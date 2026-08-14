import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { createBillingRunSchema } from "@/lib/validations/billing-run";
import { buildBillingRunRows, type BuildEnrollment } from "@/lib/finance/build-billing-run";
import type { AdjustmentInput } from "@/lib/finance/apply-adjustments";

// Billing Run wizard (bulk invoice wizard arc, Cycle B1 —
// docs/cycles/2026-08-14-billing-run-wizard.md, Task T4).
//
// Deliberately NO `export const revalidate` here — a DRAFT run and its
// status are mutable and scoped to one in-flight admin session; caching the
// list would risk the resume UI (or a second admin) reading a stale draft
// state. Same reasoning as app/api/student-fee-adjustments/route.ts.

/**
 * ~200-student runs materialize ~600 rows/lines in one transaction — not
 * instant. Same ceiling as app/api/invoices/generate/batch/route.ts.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["createdAt", "periodLabel", "status"],
    default: "createdAt",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;

  const status = searchParams.get("status");
  const validStatuses = new Set(["DRAFT", "COMMITTING", "COMMITTED", "CANCELLED"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  if (status && status !== "all") {
    if (!validStatuses.has(status)) {
      return NextResponse.json({ error: "Status tidak dikenal" }, { status: 400 });
    }
    where.status = status;
  }

  const [runs, total] = await Promise.all([
    prisma.billingRun.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        periodLabel: true,
        dueDate: true,
        academicYearId: true,
        status: true,
        createdAt: true,
        committedAt: true,
        createdBy: true,
      },
    }),
    prisma.billingRun.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(runs, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-billing-run:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const body = await req.json().catch(() => null);
  const parsed = createBillingRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validasi gagal", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { periodLabel, dueDate, academicYearId, classSectionIds, includeStudentIds, excludeStudentIds } =
    parsed.data;
  const trimmedLabel = periodLabel.trim();

  // Verify every referenced id belongs to this tenant before doing anything
  // — same pattern as app/api/student-fee-adjustments/route.ts and
  // app/api/fee-structure/route.ts. Each id set is checked separately since
  // they hit different tables.
  //
  // academicYearId is checked too, not just the scope arrays: it selects the
  // fee structures and keringanan the whole run is priced from, and it is
  // persisted onto the run. An unchecked value would price this tenant's
  // invoices off another tenant's fee table.
  const validYear = await prisma.academicYear.findFirst({
    where: { id: academicYearId, tenantId },
    select: { id: true },
  });
  if (!validYear) {
    return NextResponse.json({ error: "Tahun ajaran tidak ditemukan" }, { status: 404 });
  }

  if (classSectionIds.length > 0) {
    const validClassSections = await prisma.classSection.findMany({
      where: { id: { in: classSectionIds }, tenantId },
      select: { id: true },
    });
    if (validClassSections.length !== new Set(classSectionIds).size) {
      return NextResponse.json({ error: "Kelas tidak ditemukan" }, { status: 404 });
    }
  }

  const studentIdsToVerify = [...new Set([...includeStudentIds, ...excludeStudentIds])];
  if (studentIdsToVerify.length > 0) {
    const validStudents = await prisma.student.findMany({
      where: { id: { in: studentIdsToVerify }, tenantId },
      select: { id: true },
    });
    if (validStudents.length !== studentIdsToVerify.length) {
      return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
    }
  }

  // Fetch the data buildBillingRunRows needs — same query shapes as
  // app/api/invoices/generate/batch/route.ts, scoped by class-section ∪
  // explicit-include instead of an explicit studentIds list.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        classSectionIds.length > 0 ? { classSectionId: { in: classSectionIds } } : undefined,
        includeStudentIds.length > 0 ? { studentId: { in: includeStudentIds } } : undefined,
      ].filter(Boolean) as Prisma.StudentEnrollmentWhereInput[],
      classSection: { tenantId },
    },
    select: {
      studentId: true,
      classSectionId: true,
      student: { select: { id: true, name: true } },
      classSection: { select: { name: true, programId: true } },
    },
  });

  const buildEnrollments: BuildEnrollment[] = enrollments.map((e) => ({
    studentId: e.studentId,
    studentName: e.student.name,
    classLabel: e.classSection.name,
    programId: e.classSection.programId,
    classSectionId: e.classSectionId,
  }));

  const candidateStudentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const programIds = [...new Set(enrollments.map((e) => e.classSection.programId))];

  const [feeStructures, existingInvoices, primaryGuardians, candidateAdjustments] = await Promise.all([
    prisma.programFeeStructure.findMany({
      where: {
        programId: { in: programIds },
        academicYearId,
        feeComponent: { isEnabled: true, isRecurring: true },
      },
      include: { feeComponent: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId, periodLabel: trimmedLabel, studentId: { in: candidateStudentIds } },
      select: { studentId: true },
    }),
    prisma.studentGuardian.findMany({
      where: { studentId: { in: candidateStudentIds }, isPrimary: true },
      select: { studentId: true, parentId: true },
    }),
    // Candidate keringanan grants — narrowed here for efficiency;
    // applyAdjustments() re-checks status/academicYearId/validity itself.
    prisma.studentFeeAdjustment.findMany({
      where: { tenantId, studentId: { in: candidateStudentIds }, academicYearId, status: "ACTIVE" },
    }),
  ]);

  const feesByProgram = new Map<string, { feeComponentId: string; label: string; amount: Prisma.Decimal }[]>();
  for (const fs of feeStructures) {
    const list = feesByProgram.get(fs.programId) ?? [];
    list.push({ feeComponentId: fs.feeComponentId, label: fs.feeComponent.label, amount: fs.amount });
    feesByProgram.set(fs.programId, list);
  }

  const alreadyInvoicedStudentIds = new Set(existingInvoices.map((i) => i.studentId));
  const parentByStudent = new Map(primaryGuardians.map((g) => [g.studentId, g.parentId]));

  const adjustmentsByStudent = new Map<string, AdjustmentInput[]>();
  for (const adj of candidateAdjustments) {
    const list = adjustmentsByStudent.get(adj.studentId) ?? [];
    list.push({
      id: adj.id,
      academicYearId: adj.academicYearId,
      feeComponentId: adj.feeComponentId,
      type: adj.type as AdjustmentInput["type"],
      mode: adj.mode as AdjustmentInput["mode"],
      value: adj.value,
      reason: adj.reason,
      status: adj.status,
      validFrom: adj.validFrom,
      validTo: adj.validTo,
    });
    adjustmentsByStudent.set(adj.studentId, list);
  }

  const { rows, summary } = buildBillingRunRows({
    enrollments: buildEnrollments,
    scope: { classSectionIds, includeStudentIds, excludeStudentIds },
    feesByProgram,
    adjustmentsByStudent,
    alreadyInvoicedStudentIds,
    parentByStudent,
    academicYearId,
    dueDate,
  });

  const rowsWithIds = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));

  try {
    const run = await prisma.$transaction(
      async (tx) => {
        // Reject a second open draft — checked and created inside the same
        // Serializable transaction (mirrors app/api/payroll/generate/route.ts)
        // so two concurrent POSTs can't both pass the guard.
        const existingDraft = await tx.billingRun.findFirst({
          where: { tenantId, status: "DRAFT" },
          select: { id: true, periodLabel: true },
        });
        if (existingDraft) {
          throw Object.assign(new Error("DUPLICATE_DRAFT"), {
            existingId: existingDraft.id,
            existingPeriodLabel: existingDraft.periodLabel,
          });
        }

        const created = await tx.billingRun.create({
          data: {
            tenantId,
            academicYearId,
            periodLabel: trimmedLabel,
            dueDate,
            status: "DRAFT",
            scope: { classSectionIds, includeStudentIds, excludeStudentIds },
            createdBy: session.id,
          },
          select: { id: true },
        });

        if (rowsWithIds.length > 0) {
          await tx.billingRunRow.createMany({
            data: rowsWithIds.map((r) => ({
              id: r.id,
              billingRunId: created.id,
              studentId: r.studentId,
              studentNameSnapshot: r.studentNameSnapshot,
              classLabelSnapshot: r.classLabelSnapshot,
              parentId: r.parentId,
              totalDue: r.totalDue,
              status: r.status,
            })),
          });

          const lineData = rowsWithIds.flatMap((r) =>
            r.lines.map((l) => ({
              id: crypto.randomUUID(),
              billingRunRowId: r.id,
              feeComponentId: l.feeComponentId,
              labelSnapshot: l.labelSnapshot,
              amount: l.amount,
              adjustmentAmount: l.adjustmentAmount,
              adjustmentNote: l.adjustmentNote,
              finalAmount: l.finalAmount,
              source: l.source,
            })),
          );
          if (lineData.length > 0) {
            await tx.billingRunLine.createMany({ data: lineData });
          }
        }

        return created;
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({ id: run.id, summary }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE_DRAFT") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      return NextResponse.json(
        {
          error: "Sudah ada draft tagihan yang belum diselesaikan",
          id: err.existingId,
          periodLabel: err.existingPeriodLabel,
        },
        { status: 409 },
      );
    }
    throw e;
  }
}
