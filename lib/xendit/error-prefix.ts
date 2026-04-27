import { XenditApiError, type XenditErrorCode } from "./client";

/**
 * Canonical render order for the 10 payment-link error buckets surfaced by
 * `GET /api/invoices/pending-payment-link/breakdown` and rendered by
 * `PendingLinkBreakdownPopover`. Transient categories come first (`5xx`,
 * `429`, `408`, `network`) so admins recognize the "be patient and retry"
 * buckets before the hard ones (auth, validation, untagged legacy rows).
 *
 * Single source of truth: the breakdown route uses this to zero-fill the
 * response, the popover iterates it for render order, and the component test
 * uses it to build fixture objects with all keys present. Adding a bucket
 * means updating this constant once — every consumer picks it up.
 */
export const PAYMENT_LINK_ERROR_PREFIXES = [
  "5xx",
  "429",
  "408",
  "network",
  "401",
  "403",
  "422",
  "4xx",
  "untagged",
  "unknown",
] as const;

export type PaymentLinkErrorPrefix = (typeof PAYMENT_LINK_ERROR_PREFIXES)[number];

/**
 * Classify any caught error into a stable prefix + message pair.
 *
 * Returns the `XenditApiError.code` as the prefix when the error came from
 * `lib/xendit/client.ts` (success path or after retry exhaustion via
 * `withXenditRetry`); otherwise returns `"unknown"` for generic JS Errors,
 * raw thrown strings, `null`/`undefined`, or any other shape.
 *
 * The prefix is the contract consumed by
 * `GET /api/invoices/pending-payment-link/breakdown` (Task 5) — that endpoint
 * `substring(... before ':')`s the persisted `paymentLinkError` to aggregate
 * by category, so the prefix MUST come from the
 * `XenditErrorCode | "unknown"` union and MUST be followed by a colon
 * (handled by `formatPaymentLinkError`).
 */
export function prefixForError(
  e: unknown,
): { prefix: XenditErrorCode | "unknown"; message: string } {
  if (e instanceof XenditApiError) {
    return { prefix: e.code, message: e.message };
  }
  if (e instanceof Error) {
    return { prefix: "unknown", message: e.message };
  }
  return { prefix: "unknown", message: String(e) };
}

/**
 * Format an error for persistence in `Invoice.paymentLinkError` as
 * `"<prefix>: <message>"`. The colon separator is load-bearing — the
 * breakdown endpoint splits on it. Always pair writes through this helper.
 */
export function formatPaymentLinkError(e: unknown): string {
  const { prefix, message } = prefixForError(e);
  return `${prefix}: ${message}`;
}
