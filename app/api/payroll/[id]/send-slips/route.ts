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

  const payroll = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      items: {
        include: { employee: { select: { email: true, nama: true } } },
      },
    },
  });

  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (payroll.status === "DRAFT") {
    return NextResponse.json({ error: "Payroll belum disetujui" }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;

  for (const item of payroll.items) {
    if (!item.employee.email) {
      failed++;
      continue;
    }

    // TODO: Replace with actual Resend email when configured
    // For now, just log the email
    await prisma.emailLog.create({
      data: {
        to: item.employee.email,
        subject: `Slip Gaji ${payroll.periodStart} - ${payroll.periodEnd}`,
        template: "salary_slip",
        status: "SENT", // Simulated
      },
    });
    sent++;
  }

  await prisma.payrollRun.update({
    where: { id },
    data: { status: "SLIPS_SENT", slipsSentAt: new Date() },
  });

  return NextResponse.json({ sent, failed, total: payroll.items.length });
}
