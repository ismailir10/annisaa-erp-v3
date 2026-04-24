// @public — external Xendit webhook, auth via XENDIT_WEBHOOK_TOKEN signature.
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Xendit Payment Session Webhook handler.
 * Receives payment_session.completed / payment_session.expired events.
 * URL: POST /api/xendit/webhook (configure in Xendit dashboard)
 */
export async function POST(req: NextRequest) {
  // Verify webhook token (Xendit sends x-callback-token header)
  const callbackToken = req.headers.get("x-callback-token");
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;

  if (
    !expectedToken ||
    !callbackToken ||
    callbackToken.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(callbackToken), Buffer.from(expectedToken))
  ) {
    console.error("[XENDIT WEBHOOK] Invalid callback token");
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const event = body.event;
  const data = body.data;

  console.log(`[XENDIT WEBHOOK] Event: ${event}, Reference: ${data?.reference_id}, Status: ${data?.status}`);

  if (event === "payment_session.completed" && data?.status === "COMPLETED") {
    const invoiceId = data.reference_id;
    const amount = data.amount;

    if (!invoiceId) {
      console.error("[XENDIT WEBHOOK] No reference_id in webhook data");
      // Return 200 to prevent Xendit from retrying
      return NextResponse.json({ error: "Missing reference_id" });
    }

    // Find invoice by ID (reference_id = invoice.id)
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

    if (!invoice) {
      console.error(`[XENDIT WEBHOOK] Invoice not found: ${invoiceId}`);
      // Return 200 — don't make Xendit retry for a missing invoice
      return NextResponse.json({ error: "Invoice not found" });
    }

    if (invoice.status === "PAID") {
      return NextResponse.json({ ok: true, message: "Already paid" });
    }

    // Idempotency key: stable payment_session_id ONLY. Xendit can deliver the
    // same session twice, once before payment_id is populated and once after —
    // keying on `paymentId ?? session_id` caused the second delivery to miss
    // the first via a different reference → double credit. session_id is set
    // on first dispatch and never changes.
    const sessionId: string | null = data.payment_session_id ?? null;
    if (!sessionId) {
      console.error("[XENDIT WEBHOOK] Missing payment_session_id — cannot dedupe");
      return NextResponse.json({ error: "Missing payment_session_id" });
    }

    const newStatus = await prisma.$transaction(async (tx) => {
      // Advisory lock on invoice to serialize concurrent webhooks
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoice.id}))`;

      // Re-fetch invoice inside tx for fresh status + totals
      const fresh = await tx.invoice.findUnique({ where: { id: invoice.id } });
      if (!fresh || fresh.status === "PAID") return "PAID";

      // Idempotency check inside tx — keyed on session_id only
      const existing = await tx.payment.findFirst({
        where: { invoiceId: invoice.id, reference: sessionId },
      });
      if (existing) return fresh.status as string;

      // Clamp overpayment to remaining so a malformed Xendit callback cannot
      // push totalPaid past totalDue (defense-in-depth — Xendit shouldn't, but).
      const totalDueDec = new Prisma.Decimal(fresh.totalDue.toString());
      const currentPaidDec = new Prisma.Decimal(fresh.totalPaid.toString());
      const remainingDec = totalDueDec.sub(currentPaidDec);
      const callbackAmountDec = amount != null
        ? new Prisma.Decimal(amount.toString())
        : totalDueDec;
      const paymentAmountDec = Prisma.Decimal.min(callbackAmountDec, remainingDec);

      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: paymentAmountDec,
          method: "XENDIT",
          reference: sessionId,
          notes: `Xendit payment via ${data.channel_code ?? "checkout"}`,
        },
      });

      const allPayments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        select: { amount: true },
      });
      const totalPaidDec = allPayments.reduce(
        (acc, p) => acc.add(new Prisma.Decimal(p.amount.toString())),
        new Prisma.Decimal(0)
      );

      const status = totalPaidDec.gte(totalDueDec) ? "PAID" : "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalPaid: totalPaidDec,
          status,
          paidAt: status === "PAID" ? new Date() : null,
        },
      });

      return status;
    });

    revalidateTag("student-invoices", {});
    console.log(`[XENDIT WEBHOOK] Invoice ${invoice.invoiceNumber} → ${newStatus}`);
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
