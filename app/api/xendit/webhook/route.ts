import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Xendit Payment Session Webhook handler.
 * Receives payment_session.completed / payment_session.expired events.
 * URL: POST /api/xendit/webhook (configure in Xendit dashboard)
 */
export async function POST(req: NextRequest) {
  // Verify webhook token (Xendit sends x-callback-token header)
  const callbackToken = req.headers.get("x-callback-token");
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;

  if (expectedToken && callbackToken !== expectedToken) {
    console.error("[XENDIT WEBHOOK] Invalid callback token");
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const event = body.event;
  const data = body.data;

  console.log(`[XENDIT WEBHOOK] Event: ${event}, Reference: ${data?.reference_id}, Status: ${data?.status}`);

  if (event === "payment_session.completed" && data?.status === "COMPLETED") {
    const invoiceId = data.reference_id;
    const paymentId = data.payment_id;
    const amount = data.amount;

    if (!invoiceId) {
      console.error("[XENDIT WEBHOOK] No reference_id in webhook data");
      // Return 200 to prevent Xendit from retrying
      return NextResponse.json({ ok: false, error: "Missing reference_id" });
    }

    // Find invoice by ID (reference_id = invoice.id)
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice) {
      console.error(`[XENDIT WEBHOOK] Invoice not found: ${invoiceId}`);
      // Return 200 — don't make Xendit retry for a missing invoice
      return NextResponse.json({ ok: false, error: "Invoice not found" });
    }

    if (invoice.status === "PAID") {
      return NextResponse.json({ ok: true, message: "Already paid" });
    }

    // Idempotency: check if this payment was already recorded
    const existingPayment = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id, reference: paymentId ?? data.payment_session_id },
    });
    if (existingPayment) {
      return NextResponse.json({ ok: true, message: "Payment already recorded" });
    }

    // Record payment
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: amount ?? Number(invoice.totalDue),
        method: "XENDIT",
        reference: paymentId ?? data.payment_session_id,
        notes: `Xendit payment via ${data.channel_code ?? "checkout"}`,
      },
    });

    // Update invoice totals
    const allPayments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);

    const newStatus = totalPaid >= Number(invoice.totalDue) ? "PAID" : "PARTIALLY_PAID";

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        totalPaid,
        status: newStatus,
        paidAt: newStatus === "PAID" ? new Date() : null,
      },
    });

    console.log(`[XENDIT WEBHOOK] Invoice ${invoice.invoiceNumber} → ${newStatus} (paid: ${totalPaid})`);
    return NextResponse.json({ ok: true, status: newStatus });
  }

  if (event === "payment_session.expired") {
    console.log(`[XENDIT WEBHOOK] Session expired for: ${data?.reference_id}`);
    // Don't change invoice status — admin can create a new session
    return NextResponse.json({ ok: true, message: "Session expired noted" });
  }

  // Unknown event — acknowledge
  return NextResponse.json({ ok: true, message: `Event ${event} acknowledged` });
}
