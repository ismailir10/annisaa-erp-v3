import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({ where: { id } });
  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payroll.status !== "DRAFT") {
    return NextResponse.json({ error: "Hanya draft yang bisa disetujui" }, { status: 400 });
  }

  // Approve and lock attendance
  await prisma.payrollRun.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedBy: session.id,
      approvedAt: new Date(),
    },
  });

  // Lock attendance records for this period
  const items = await prisma.payrollItem.findMany({
    where: { payrollRunId: id },
    select: { employeeId: true },
  });

  for (const item of items) {
    await prisma.attendanceRecord.updateMany({
      where: {
        employeeId: item.employeeId,
        date: { gte: payroll.periodStart, lte: payroll.periodEnd },
      },
      data: { isLocked: true },
    });
  }

  return NextResponse.json({ ok: true });
}
