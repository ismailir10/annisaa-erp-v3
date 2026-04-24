import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.approve");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({ where: { id } });
  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payroll.status !== "DRAFT") {
    return NextResponse.json({ error: "Hanya draft yang bisa disetujui" }, { status: 400 });
  }

  // Approve and lock attendance atomically
  await prisma.$transaction(async (tx) => {
    await tx.payrollRun.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy: session.id,
        approvedAt: new Date(),
      },
    });

    const items = await tx.payrollItem.findMany({
      where: { payrollRunId: id },
      select: { employeeId: true },
    });

    await tx.attendanceRecord.updateMany({
      where: {
        employeeId: { in: items.map(i => i.employeeId) },
        date: { gte: payroll.periodStart, lte: payroll.periodEnd },
      },
      data: { isLocked: true },
    });
  });

  return NextResponse.json({ ok: true });
}
