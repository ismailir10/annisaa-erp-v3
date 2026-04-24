import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { SalarySlipPdf, SlipData } from "@/lib/pdf/salary-slip";
import { sendSalarySlipEmail } from "@/lib/email/send-slip";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { formatRupiah } from "@/lib/format";
import React from "react";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 2 slip sends per minute
  const { success } = rateLimit(`send-slips:${getClientIp(_req)}`, 2, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          employee: true,
          lines: { orderBy: { componentDef: { sortOrder: "asc" } } },
        },
      },
    },
  });

  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (payroll.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Hanya penggajian berstatus APPROVED yang bisa dikirim slip-nya" },
      { status: 409 }
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: payroll.tenantId } });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < payroll.items.length; idx++) {
    const item = payroll.items[idx];

    // Skip items already emailed — idempotency guard so retried runs after a
    // serverless timeout don't re-email the same employees.
    if (item.emailSent) {
      skipped++;
      continue;
    }

    // Throttle: 600ms between emails to stay under Resend's 2 req/sec limit
    if (idx > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    if (!item.employee.email) {
      failed++;
      errors.push(`${item.employee.nama}: tidak ada email`);
      continue;
    }

    try {
      // Generate PDF for this employee
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";
      const slipData: SlipData = {
        schoolName: tenant?.name ?? "An Nisaa' Sekolahku",
        logoUrl: `${appUrl}/logo.png`,
        period: `${payroll.periodStart} s/d ${payroll.periodEnd}`,
        employeeName: item.employee.formalName ?? item.employee.nama,
        employeeCode: item.employee.kode,
        position: item.employee.jabatan,
        workingDays: payroll.actualWorkDays,
        bankName: item.employee.bankName,
        bankAccountNo: item.employee.bankAccountNo,
        incomeLines: item.lines
          .filter((l) => l.categorySnapshot === "INCOME")
          .map((l) => ({ label: l.labelSnapshot, amount: Number(l.finalAmount) })),
        deductionLines: item.lines
          .filter((l) => l.categorySnapshot === "DEDUCTION")
          .map((l) => ({ label: l.labelSnapshot, amount: Number(l.finalAmount) })),
        totalIncome: Number(item.grossAmount),
        totalDeductions: Number(item.deductions),
        netPay: Number(item.netAmount),
        generatedDate: new Date().toLocaleDateString("id-ID", {
          day: "numeric", month: "long", year: "numeric",
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfBuffer = await renderToBuffer(React.createElement(SalarySlipPdf, { data: slipData }) as any);

      // Send email with PDF attachment to the employee's actual email
      const result = await sendSalarySlipEmail({
        to: item.employee.email,
        employeeName: item.employee.nama,
        period: `${payroll.periodStart} s/d ${payroll.periodEnd}`,
        netPay: formatRupiah(Number(item.netAmount)),
        pdfBuffer: new Uint8Array(pdfBuffer),
        pdfFilename: `slip-gaji-${item.employee.kode}-${payroll.periodStart}.pdf`,
      });

      await prisma.emailLog.create({
        data: {
          tenantId: payroll.tenantId,
          to: item.employee.email,
          subject: `Slip Gaji ${payroll.periodStart} - ${payroll.periodEnd}`,
          template: "salary_slip",
          status: result.sent ? "SENT" : (result.error ? "FAILED" : "SENT"),
          error: result.error ?? null,
        },
      });

      // Mark per-item emailSent so a retry skips this employee.
      if (result.sent) {
        await prisma.payrollItem.update({
          where: { id: item.id },
          data: { emailSent: true },
        });
      }

      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${item.employee.nama}: ${msg}`);

      await prisma.emailLog.create({
        data: {
          tenantId: payroll.tenantId,
          to: item.employee.email,
          subject: `Slip Gaji ${payroll.periodStart}`,
          template: "salary_slip",
          status: "FAILED",
          error: msg,
        },
      });
    }
  }

  // Compare-and-swap: only promote status if still APPROVED. Prevents two
  // concurrent send-slips invocations from both writing SLIPS_SENT on top of
  // each other, and prevents promotion if run was cancelled mid-send.
  //
  // Promotion condition: run is fully accounted for with no failures — either
  // at least one slip was sent this call (first run OR partial-retry finishes
  // the remaining items), or every item was already marked emailSent on a
  // prior partial run (complete retry — sent=0, skipped=all, failed=0).
  const allAccounted = sent + skipped === payroll.items.length && failed === 0;
  if (allAccounted && (sent > 0 || skipped > 0)) {
    const swap = await prisma.payrollRun.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "SLIPS_SENT", slipsSentAt: new Date() },
    });
    if (swap.count === 0) {
      return NextResponse.json({
        sent,
        failed,
        skipped,
        total: payroll.items.length,
        errors: errors.length > 0 ? errors : undefined,
        warning: "Status penggajian sudah diperbarui oleh proses lain",
      });
    }
  }

  return NextResponse.json({ sent, failed, skipped, total: payroll.items.length, errors: errors.length > 0 ? errors : undefined });
}
