import { XenditApiError, type XenditErrorCode } from "./client";

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
