import { redirect } from "next/navigation";

/**
 * Backwards-compat redirect shim for Xendit sessions created before the cycle
 * `2026-04-27-finance-ui-polish` shipped. Those sessions have hardcoded
 * `success_return_url = /payment/success?invoice=<id>` and Xendit cannot
 * change the URL after creation. With `expiryDays: 7` on session creation,
 * delete this shim ≥7 days after the cycle ships.
 *
 * New sessions redirect directly to `/parent/invoices?invoice=<id>&xenditStatus=paid`.
 */
export default async function PaymentSuccessRedirect({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const params = await searchParams;
  const invoiceId = params.invoice ?? "";
  const target = invoiceId
    ? `/parent/invoices?invoice=${encodeURIComponent(invoiceId)}&xenditStatus=paid`
    : "/parent/invoices";
  redirect(target);
}
