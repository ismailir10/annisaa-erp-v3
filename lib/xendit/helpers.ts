import { prisma } from "@/lib/db";
import { createXenditSession, stripQuery } from "@/lib/xendit/client";

/**
 * Resolve the origin for Xendit success/cancel return URLs.
 *
 * Priority:
 *   1. `requestOrigin` (passed by route handlers from `new URL(req.url).origin`) —
 *      ensures preview/staging/prod each redirect to their own origin, not a
 *      hardcoded prod URL.
 *   2. `NEXT_PUBLIC_APP_URL` env var — fallback for script callers and
 *      contexts without a request scope.
 *   3. Throw — no silent prod fallback. Misconfigured deploys must fail
 *      loudly at session-creation time, not at the parent's confused-by-
 *      cross-origin-redirect time.
 *
 * Trailing slashes are stripped from both inputs because Vercel's env value
 * was previously configured with a "/" suffix, which produced
 * "https://host//payment/success?invoice=..." (double slash) and broke the
 * auto-redirect from Xendit's hosted checkout back to the parent portal.
 */
export function resolveAppOrigin(requestOrigin?: string): string {
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  throw new Error(
    "[XENDIT] No origin available for return URLs — pass requestOrigin or set NEXT_PUBLIC_APP_URL",
  );
}

/**
 * Create a Xendit checkout session for a single invoice and update the DB.
 * Returns the payment URL on success, null on failure.
 *
 * `requestOrigin` should be `new URL(req.url).origin` from the calling
 * route handler so preview/staging/prod each get their own return URL host.
 */
export async function createXenditSessionForInvoice(
  invoiceId: string,
  tenantId: string,
  requestOrigin?: string,
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
  const appOrigin = resolveAppOrigin(requestOrigin);
  const successReturnUrl = `${appOrigin}/payment/success?invoice=${invoice.id}`;
  const cancelReturnUrl = `${appOrigin}/payment/cancel?invoice=${invoice.id}`;

  const xenditSession = await createXenditSession({
    referenceId: invoice.id,
    amount: remaining,
    description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
    customerName: guardianParent?.name ?? invoice.student.name,
    customerEmail: guardianParent?.email ?? undefined,
    customerPhone: guardianParent?.whatsapp ?? guardianParent?.phone ?? undefined,
    successReturnUrl,
    cancelReturnUrl,
    expiryDays: 7,
    items: invoice.lines.map((line) => ({
      name: line.labelSnapshot,
      quantity: 1,
      price: Number(line.finalAmount),
    })),
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      xenditSessionId: xenditSession.id,
      xenditPaymentUrl: xenditSession.payment_link_url,
    },
  });

  // Operator triage: emit one structured line per session so an operator
  // can grep by sessionId and match against the webhook PROCESSED line.
  // Stripped URLs leave `?invoice=` ids out of logs while preserving the
  // origin (preview/staging/prod) — the field operators need to verify.
  console.info("[XENDIT SESSION CREATED]", {
    invoiceId,
    sessionId: xenditSession.id,
    successOrigin: stripQuery(successReturnUrl),
    cancelOrigin: stripQuery(cancelReturnUrl),
  });

  return { paymentUrl: xenditSession.payment_link_url };
}
