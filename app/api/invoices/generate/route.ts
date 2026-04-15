import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Bulk generate monthly invoices for all active enrolled students
export async function POST(req: NextRequest) {
  // Rate limit: 3 invoice generations per minute
  const { success } = rateLimit(`invoices-gen:${getClientIp(req)}`, 3, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

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
  const year = new Date().getFullYear();

  let created = 0;
  let skipped = 0;

  // Atomic invoice generation with advisory lock to prevent race conditions
  await prisma.$transaction(async (tx) => {
    // Acquire advisory lock per tenant — lock is released when transaction ends
    const tenantId = session.tenantId!;
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

    for (const enrollment of enrollments) {
      const studentId = enrollment.student.id;
      const programFees = feesByProgram.get(enrollment.classSection.programId) ?? [];

      if (programFees.length === 0) {
        skipped++;
        continue;
      }

      // Check if invoice already exists for this student + period
      const existing = await tx.invoice.findFirst({
        where: { studentId, periodLabel: periodLabel.trim(), tenantId },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, "0")}`;
      nextNum++;

      const totalDue = programFees.reduce((s, f) => s + Number(f.amount), 0);

      // Look up primary guardian for parentId
      const primaryGuardian = await tx.studentGuardian.findFirst({
        where: { studentId, isPrimary: true },
      });

      await tx.invoice.create({
        data: {
          tenantId,
          studentId,
          parentId: primaryGuardian?.parentId ?? null,
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
  });

  return NextResponse.json({ created, skipped, total: enrollments.length });
}
