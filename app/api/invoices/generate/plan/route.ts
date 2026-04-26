import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { generatePlanSchema } from "@/lib/validations/invoice";

/**
 * POST /api/invoices/generate/plan
 *
 * Compute how many invoices a bulk-generate run WOULD produce, without
 * writing anything. The admin reviews the breakdown (eligible /
 * already-invoiced / no-fee-structure) before committing to the actual
 * batch run via `/api/invoices/generate/batch`.
 *
 * Mirrors the eligibility query from the legacy `POST /api/invoices/generate`
 * route — same active-enrollment + per-program fee structure + dedup-by-period
 * logic, just stops short of the transactional createMany.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 10 plan calls per minute per IP. Cheap-but-not-free read,
  // and the admin really only needs one plan per generation flow.
  const { success } = rateLimit(`invoices-plan:${getClientIp(req)}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = generatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Periode, tanggal jatuh tempo, dan tahun ajaran wajib diisi" },
      { status: 400 }
    );
  }

  const { periodLabel, dueDate: _dueDate, academicYearId } = parsed.data;
  const tenantId = session.tenantId;
  const trimmedLabel = periodLabel.trim();

  // Same enrollment query as the legacy generate route — scoped to the
  // tenant's class sections for the given academic year.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      status: "ACTIVE",
      classSection: {
        tenantId,
        academicYearId,
      },
    },
    include: {
      student: { select: { id: true } },
      classSection: { select: { programId: true } },
    },
  });

  if (enrollments.length === 0) {
    return NextResponse.json({
      eligibleStudentIds: [],
      skippedAlreadyInvoiced: 0,
      skippedNoFeeStructure: 0,
      total: 0,
      eligible: 0,
    });
  }

  const programIds = [...new Set(enrollments.map((e) => e.classSection.programId))];
  const studentIds = enrollments.map((e) => e.student.id);

  const [feeStructures, existingInvoices] = await Promise.all([
    prisma.programFeeStructure.findMany({
      where: {
        programId: { in: programIds },
        academicYearId,
        feeComponent: { isEnabled: true, isRecurring: true },
      },
    }),
    prisma.invoice.findMany({
      where: { tenantId, periodLabel: trimmedLabel, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
  ]);

  // Build the per-program fee-structure presence set. We only need
  // "does this program have any active recurring component?" for the
  // eligibility check — the actual line items are computed at batch time.
  const programsWithFees = new Set(feeStructures.map((f) => f.programId));
  const existingStudentIds = new Set(existingInvoices.map((i) => i.studentId));

  // Dedupe by studentId before classifying — one student may have multiple
  // active enrollments (e.g. enrolled in two class sections), but we only
  // ever create one invoice per student per period. Counting enrollment rows
  // would overstate `total` and double-add the student to eligibleStudentIds.
  const eligibleStudentIds: string[] = [];
  const seenStudentIds = new Set<string>();
  let skippedAlreadyInvoiced = 0;
  let skippedNoFeeStructure = 0;

  for (const enrollment of enrollments) {
    const studentId = enrollment.student.id;
    if (seenStudentIds.has(studentId)) continue;
    seenStudentIds.add(studentId);

    if (existingStudentIds.has(studentId)) {
      skippedAlreadyInvoiced++;
      continue;
    }
    if (!programsWithFees.has(enrollment.classSection.programId)) {
      skippedNoFeeStructure++;
      continue;
    }
    eligibleStudentIds.push(studentId);
  }

  return NextResponse.json({
    eligibleStudentIds,
    skippedAlreadyInvoiced,
    skippedNoFeeStructure,
    total: seenStudentIds.size,
    eligible: eligibleStudentIds.length,
  });
}
