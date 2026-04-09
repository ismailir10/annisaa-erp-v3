import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createXenditSession } from "@/lib/xendit/client";

/**
 * Create Xendit Checkout Sessions — single or bulk.
 * Bulk: admin clicks "Kirim Tagihan" → creates sessions for all selected invoices.
 * Mirrors the payroll "Kirim Slip" flow.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const invoiceIds: string[] = body.invoiceIds ?? (body.invoiceId ? [body.invoiceId] : []);

  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu tagihan" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";

  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: { studentName: string; invoiceNumber: string; paymentUrl: string }[] = [];

  for (const invoiceId of invoiceIds) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: { include: { guardians: { where: { isPrimary: true }, take: 1 } } },
        lines: true,
      },
    });

    if (!invoice || invoice.tenantId !== session.tenantId) {
      errors.push(`Tagihan tidak ditemukan`);
      failed++;
      continue;
    }

    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      failed++;
      continue; // Skip silently
    }

    const remaining = invoice.totalDue - invoice.totalPaid;
    if (remaining <= 0) {
      failed++;
      continue;
    }

    const guardian = invoice.student.guardians[0];

    try {
      const xenditSession = await createXenditSession({
        referenceId: invoice.id,
        amount: remaining,
        description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
        customerName: guardian?.name ?? invoice.student.name,
        customerEmail: guardian?.email ?? undefined,
        customerPhone: guardian?.whatsapp ?? guardian?.phone ?? undefined,
        successReturnUrl: `${appUrl}/payment/success?invoice=${invoice.id}`,
        cancelReturnUrl: `${appUrl}/payment/cancel?invoice=${invoice.id}`,
        expiryDays: 7,
        items: invoice.lines.map((line) => ({
          name: line.labelSnapshot,
          quantity: 1,
          price: line.finalAmount,
        })),
      });

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          xenditSessionId: xenditSession.id,
          xenditPaymentUrl: xenditSession.payment_link_url,
          status: "SENT",
          sentAt: new Date(),
        },
      });

      results.push({
        studentName: invoice.student.name,
        invoiceNumber: invoice.invoiceNumber,
        paymentUrl: xenditSession.payment_link_url,
      });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${invoice.student.name}: ${msg}`);
      failed++;
    }
  }

  return NextResponse.json({
    created,
    failed,
    total: invoiceIds.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
