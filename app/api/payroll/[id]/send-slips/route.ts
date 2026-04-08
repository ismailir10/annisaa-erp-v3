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

  // Staging: override all email recipients to test email
  const emailOverride = process.env.STAGING_EMAIL_OVERRIDE;
  const isStaging = !!emailOverride;

  let sent = 0;
  let failed = 0;

  for (const item of payroll.items) {
    if (!item.employee.email) {
      failed++;
      continue;
    }

    const recipientEmail = isStaging ? emailOverride : item.employee.email;

    // TODO: Replace with actual Resend email when configured
    await prisma.emailLog.create({
      data: {
        to: recipientEmail!,
        subject: `${isStaging ? "[STAGING] " : ""}Slip Gaji ${payroll.periodStart} - ${payroll.periodEnd}`,
        template: "salary_slip",
        status: "SENT", // Simulated until Resend is configured
      },
    });
    sent++;
  }

  await prisma.payrollRun.update({
    where: { id },
    data: { status: "SLIPS_SENT", slipsSentAt: new Date() },
  });

  return NextResponse.json({
    sent,
    failed,
    total: payroll.items.length,
    ...(isStaging ? { note: `Staging mode: all emails sent to ${emailOverride}` } : {}),
  });
}
