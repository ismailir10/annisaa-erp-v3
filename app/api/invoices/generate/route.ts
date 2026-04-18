import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Bulk generate monthly invoices for all active enrolled students
export async function POST(req: NextRequest) {
  // Rate limit: 3 invoice generations per minute
  const { success } = rateLimit(`invoices-gen:${getClientIp(req)}`, 3, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { periodLabel, dueDate, academicYearId } = body;

  if (!periodLabel?.trim() || !dueDate || !academicYearId) {
    return NextResponse.json({ error: "Periode, tanggal jatuh tempo, dan tahun ajaran wajib diisi" }, { status: 400 });
  }

  // Get all active enrolled students
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      status: "ACTIVE",
      classSection: {
        tenantId: session.tenantId,
        academicYearId,
      },
    },
    include: {
      student: { select: { id: true, name: true, tenantId: true } },
      classSection: {
        select: { programId: true },
      },
    },
  });

  if (enrollments.length === 0) {
    return NextResponse.json({ error: "Tidak ada siswa aktif untuk tahun ajaran ini" }, { status: 400 });
  }

  // Get fee structures for all involved programs
  const programIds = [...new Set(enrollments.map((e) => e.classSection.programId))];
  const feeStructures = await prisma.programFeeStructure.findMany({
    where: {
      programId: { in: programIds },
      academicYearId,
      feeComponent: { isEnabled: true, isRecurring: true },
    },
    include: { feeComponent: true },
  });

  // Group fee structures by program
  const feesByProgram = new Map<string, typeof feeStructures>();
  for (const fs of feeStructures) {
    const existing = feesByProgram.get(fs.programId) ?? [];
    existing.push(fs);
    feesByProgram.set(fs.programId, existing);
  }

  // Get next invoice number
  const year = new Date().getFullYear();
  const tenantId = session.tenantId!;

  // Pre-fetch datasets outside the transaction to eliminate N+1 queries in the loop.
  // The advisory lock inside the transaction still guards invoiceNumber uniqueness.
  const studentIds = enrollments.map((e) => e.student.id);
  const trimmedPeriodLabel = periodLabel.trim();

  const [existingInvoices, primaryGuardians] = await Promise.all([
    // Dedup check: which students already have an invoice for this period?
    prisma.invoice.findMany({
      where: { tenantId, periodLabel: trimmedPeriodLabel, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
    // Primary guardian lookup for parentId on each invoice
    prisma.studentGuardian.findMany({
      where: { studentId: { in: studentIds }, isPrimary: true },
      select: { studentId: true, parentId: true },
    }),
  ]);

  const existingStudentIds = new Set(existingInvoices.map((i) => i.studentId));
  const guardianByStudent = new Map(primaryGuardians.map((g) => [g.studentId, g.parentId]));

  let created = 0;
  let skipped = 0;

  // Pre-build the invoices-to-create list outside the transaction
  type InvoiceToBuild = {
    studentId: string;
    parentId: string | null;
    totalDue: number;
    programFees: typeof feeStructures;
  };
  const invoicesToBuild: InvoiceToBuild[] = [];

  for (const enrollment of enrollments) {
    const studentId = enrollment.student.id;
    const programFees = feesByProgram.get(enrollment.classSection.programId) ?? [];
    if (programFees.length === 0 || existingStudentIds.has(studentId)) {
      skipped++;
      continue;
    }
    invoicesToBuild.push({
      studentId,
      parentId: guardianByStudent.get(studentId) ?? null,
      totalDue: programFees.reduce((s, f) => s + Number(f.amount), 0),
      programFees,
    });
  }

  // Atomic invoice generation with advisory lock to prevent race conditions
  await prisma.$transaction(async (tx) => {
    // Acquire advisory lock per tenant — lock is released when transaction ends
    const lockKey = tenantId.split("").reduce((h, c) => h + c.charCodeAt(0), 0);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    const lastInvoice = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let nextNum = 1;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    if (invoicesToBuild.length === 0) return;

    // Assign invoice numbers and build row data
    const invoiceRows = invoicesToBuild.map((inv) => {
      const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, "0")}`;
      nextNum++;
      return { ...inv, invoiceNumber };
    });

    // 1. Bulk-insert all invoices in one round-trip
    await tx.invoice.createMany({
      data: invoiceRows.map((inv) => ({
        tenantId,
        studentId: inv.studentId,
        parentId: inv.parentId,
        invoiceNumber: inv.invoiceNumber,
        periodLabel: trimmedPeriodLabel,
        dueDate,
        totalDue: inv.totalDue,
        createdBy: session.id,
      })),
    });

    // 2. Fetch the created invoice IDs (keyed by invoiceNumber for line mapping)
    const createdInvoices = await tx.invoice.findMany({
      where: { tenantId, periodLabel: trimmedPeriodLabel, invoiceNumber: { in: invoiceRows.map((r) => r.invoiceNumber) } },
      select: { id: true, invoiceNumber: true },
    });
    const idByNumber = new Map(createdInvoices.map((i) => [i.invoiceNumber, i.id]));

    // 3. Bulk-insert all invoice lines in one round-trip
    await tx.invoiceLine.createMany({
      data: invoiceRows.flatMap((inv) =>
        inv.programFees.map((f) => ({
          invoiceId: idByNumber.get(inv.invoiceNumber)!,
          feeComponentId: f.feeComponentId,
          labelSnapshot: f.feeComponent.label,
          amount: f.amount,
          finalAmount: f.amount,
        }))
      ),
    });

    created = invoicesToBuild.length;
  });

  return NextResponse.json({ created, skipped, total: enrollments.length });
}
