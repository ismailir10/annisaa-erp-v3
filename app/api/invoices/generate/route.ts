import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Bulk generate monthly invoices for all active enrolled students
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
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
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let nextNum = 1;
  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const year = new Date().getFullYear();

  let created = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    const studentId = enrollment.student.id;
    const programFees = feesByProgram.get(enrollment.classSection.programId) ?? [];

    if (programFees.length === 0) {
      skipped++;
      continue;
    }

    // Check if invoice already exists for this student + period
    const existing = await prisma.invoice.findFirst({
      where: { studentId, periodLabel: periodLabel.trim(), tenantId: session.tenantId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, "0")}`;
    nextNum++;

    const totalDue = programFees.reduce((s, f) => s + f.amount, 0);

    await prisma.invoice.create({
      data: {
        tenantId: session.tenantId,
        studentId,
        invoiceNumber,
        periodLabel: periodLabel.trim(),
        dueDate,
        totalDue,
        createdBy: session.id,
        lines: {
          create: programFees.map((f) => ({
            feeComponentId: f.feeComponentId,
            labelSnapshot: f.feeComponent.label,
            amount: f.amount,
            finalAmount: f.amount,
          })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: enrollments.length });
}
