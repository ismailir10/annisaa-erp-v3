import { prisma } from "@/lib/db";
import { createXenditSession } from "@/lib/xendit/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";

/**
 * Create a Xendit checkout session for a single invoice and atomically flip
 * status DRAFT/PENDING_PAYMENT_LINK → SENT inside an advisory-lock transaction.
 *
 * Why the lock: void and webhook acquire the same `pg_advisory_xact_lock(
 * hashtext(invoiceId))`. Without it, a TOCTOU window between the pre-call
 * status read and the post-call DB write let void mark the invoice CANCELLED
 * while the helper kept overwriting `xenditSessionId`/`xenditPaymentUrl` —
 * leaving a live link on a CANCELLED invoice that a parent could still pay.
 *
 * The helper now: (1) reads status outside the lock as a cheap pre-check,
 * (2) calls Xendit, (3) opens a tx + acquires the lock, (4) re-reads status
 * and refuses to write if it flipped to PAID/CANCELLED, (5) writes session
 * fields AND status:SENT + sentAt + paymentLinkError:null in a single update.
 *
 * Callers therefore must NOT do their own post-flip status update — the helper
 * already did it. They only need cache invalidation.
 *
 * Returns the payment URL on success, null if a guard tripped.
 */
export async function createXenditSessionForInvoice(
  invoiceId: string,
  tenantId: string
): Promise<{ paymentUrl: string } | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: {
        include: {
          guardians: { where: { isPrimary: true }, take: 1, include: { parent: true } },
        },
      },
      lines: true,
    },
  });

  if (!invoice || invoice.tenantId !== tenantId) return null;
  if (invoice.status === "PAID" || invoice.status === "CANCELLED") return null;

  const remaining = Number(invoice.totalDue) - Number(invoice.totalPaid);
  if (remaining <= 0) return null;

  const guardianParent = invoice.student.guardians[0]?.parent;

  const xenditSession = await createXenditSession({
    referenceId: invoice.id,
    amount: remaining,
    description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
    customerName: guardianParent?.name ?? invoice.student.name,
    customerEmail: guardianParent?.email ?? undefined,
    customerPhone: guardianParent?.whatsapp ?? guardianParent?.phone ?? undefined,
    successReturnUrl: `${APP_URL}/payment/success?invoice=${invoice.id}`,
    cancelReturnUrl: `${APP_URL}/payment/cancel?invoice=${invoice.id}`,
    expiryDays: 7,
    items: invoice.lines.map((line) => ({
      name: line.labelSnapshot,
      quantity: 1,
      price: Number(line.finalAmount),
    })),
  });

  // Atomic write inside the per-invoice advisory lock. If void or webhook
  // flipped status mid-flight we surface null and the caller treats this as a
  // soft failure — Xendit session was created but is orphaned (no live link
  // on the DB; expires naturally).
  const wrote = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
    const fresh = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, totalDue: true, totalPaid: true },
    });
    if (!fresh) return false;
    if (fresh.status === "PAID" || fresh.status === "CANCELLED") return false;
    const remainingNow = Number(fresh.totalDue) - Number(fresh.totalPaid);
    if (remainingNow <= 0) return false;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        xenditSessionId: xenditSession.id,
        xenditPaymentUrl: xenditSession.payment_link_url,
        status: "SENT",
        sentAt: new Date(),
        paymentLinkError: null,
      },
    });
    return true;
  });

  if (!wrote) return null;
  return { paymentUrl: xenditSession.payment_link_url };
}
