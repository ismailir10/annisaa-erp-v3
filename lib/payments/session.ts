import { prisma } from "@/lib/db";
import { getGateway } from "@/lib/payments/registry";
import { withRetry } from "@/lib/payments/with-retry";
import { stripQuery } from "@/lib/payments/xendit/client";

/**
 * Gateway-agnostic session creation. Ported from `lib/xendit/helpers.ts` in
 * cycle 2026-07-27-doku-payment-gateway T3 — resolves the active
 * `PaymentGateway` via `getGateway()` instead of calling the Xendit client
 * concretely. `lib/xendit/helpers.ts` is now a thin re-export shim so no
 * consumer import path had to change in this task.
 */

/**
 * Resolve the origin for payment gateway success/cancel return URLs.
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
 * Create a payment gateway checkout session for a single invoice and update
 * the DB. Returns the payment URL on success, null on failure. Resolves the
 * active gateway via `getGateway()` — Xendit or DOKU, selected by
 * `PAYMENT_GATEWAY` — so this function's body does not change per gateway.
 *
 * `requestOrigin` should be `new URL(req.url).origin` from the calling
 * route handler so preview/staging/prod each get their own return URL host.
 */
export async function createPaymentSessionForInvoice(
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
  const successReturnUrl = `${appOrigin}/parent/invoices?invoice=${invoice.id}&paymentStatus=paid`;
  const cancelReturnUrl = `${appOrigin}/parent/invoices?invoice=${invoice.id}&paymentStatus=cancel`;

  const gateway = getGateway();

  // Wrap the gateway call in withRetry so transient 5xx/408/429/network
  // errors retry up to 3 attempts before surfacing. The typed `GatewayApiError`
  // bubbles up on terminal failure so route-handler callers can prefix-tag
  // `paymentLinkError` (Task 4). TOCTOU guard, params build, and DB persist
  // remain outside the retry — only the network call itself is retried.
  const session = await withRetry(
    () =>
      gateway.createSession({
        referenceId: invoice.id,
        amount: remaining,
        description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
        customerName: guardianParent?.name ?? invoice.student.name,
        customerEmail: guardianParent?.email ?? undefined,
        customerPhone: guardianParent?.whatsapp ?? guardianParent?.phone ?? undefined,
        successReturnUrl,
        cancelReturnUrl,
        // Same origin the parent is browsing, so a preview/staging/prod
        // deploy each receive their own notifications. DOKU maps this onto
        // `additional_info.override_notification_url`, which outranks the
        // per-channel Back Office setting — the one place a missing Back
        // Office value would otherwise mean a paid invoice never credits.
        notificationUrl: `${appOrigin}/api/doku/webhook`,
        expiryDays: 7,
        items: invoice.lines.map((line) => ({
          name: line.labelSnapshot,
          quantity: 1,
          price: Number(line.finalAmount),
        })),
      }),
    { invoiceId, tenantId },
  );

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      xenditSessionId: session.id,
      xenditPaymentUrl: session.paymentUrl,
    },
  });

  // Operator triage: emit one structured line per session so an operator
  // can grep by sessionId and match against the webhook PROCESSED line.
  // Stripped URLs leave `?invoice=` ids out of logs while preserving the
  // origin (preview/staging/prod) — the field operators need to verify.
  //
  // `customerEmailPresent` is a boolean, never the address itself — the
  // address is PII and `lib/webhook/redact-payload.ts` strips it everywhere
  // else, so logging it here would defeat that. Under DOKU the gateway emails
  // the Virtual Account number to `customer.email`; when the primary guardian
  // has no address on file the parent is never told which VA to pay and the
  // invoice silently stalls at SENT. That is invisible without this flag —
  // the session still succeeds and still returns a payment URL.
  const customerEmailPresent = Boolean(guardianParent?.email);
  console.info("[PAYMENT SESSION CREATED]", {
    gateway: gateway.id,
    invoiceId,
    sessionId: session.id,
    customerEmailPresent,
    successOrigin: stripQuery(successReturnUrl),
    cancelOrigin: stripQuery(cancelReturnUrl),
  });
  if (!customerEmailPresent) {
    console.warn("[PAYMENT SESSION NO CUSTOMER EMAIL]", {
      gateway: gateway.id,
      invoiceId,
      hasPrimaryGuardian: Boolean(guardianParent),
    });
  }

  return { paymentUrl: session.paymentUrl };
}
