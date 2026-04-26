import { prisma } from "@/lib/db";
import { createXenditSession } from "@/lib/xendit/client";

/**
 * Resolve the origin for Xendit success/cancel return URLs.
 *
 * Priority:
 *   1. `requestOrigin` (passed by route handlers from `new URL(req.url).origin`) —
 *      ensures preview deployments redirect to the preview origin, not prod.
 *   2. `NEXT_PUBLIC_APP_URL` env var — fallback for script callers and
 *      contexts without a request scope.
 *   3. Throw — no silent prod fallback. Misconfigured deploys must fail
 *      loudly at session-creation time, not at the parent's confused-by-
 *      cross-origin-redirect time.
 */
export function resolveAppOrigin(requestOrigin?: string): string {
  if (requestOrigin) return requestOrigin;
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env;
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

  const xenditSession = await createXenditSession({
    referenceId: invoice.id,
    amount: remaining,
    description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
    customerName: guardianParent?.name ?? invoice.student.name,
    customerEmail: guardianParent?.email ?? undefined,
    customerPhone: guardianParent?.whatsapp ?? guardianParent?.phone ?? undefined,
    successReturnUrl: `${appOrigin}/payment/success?invoice=${invoice.id}`,
    cancelReturnUrl: `${appOrigin}/payment/cancel?invoice=${invoice.id}`,
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

  return { paymentUrl: xenditSession.payment_link_url };
}
