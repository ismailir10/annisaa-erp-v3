import { GatewayApiError, type GatewayErrorCode } from "./types";

/**
 * Gateway-agnostic error-prefix tagger. Moved from `lib/xendit/error-prefix.ts`
 * in cycle 2026-07-27-doku-payment-gateway T1. `lib/xendit/error-prefix.ts`
 * re-exports everything below so existing consumers/tests are unaffected.
 *
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
 * Returns the `GatewayApiError.code` as the prefix when the error came from
 * a `PaymentGateway` implementation (success path or after retry exhaustion
 * via `withRetry`); otherwise returns `"unknown"` for generic JS Errors,
 * raw thrown strings, `null`/`undefined`, or any other shape.
 *
 * The prefix is the contract consumed by
 * `GET /api/invoices/pending-payment-link/breakdown` (Task 5) — that endpoint
 * `substring(... before ':')`s the persisted `paymentLinkError` to aggregate
 * by category, so the prefix MUST come from the
 * `GatewayErrorCode | "unknown"` union and MUST be followed by a colon
 * (handled by `formatPaymentLinkError`).
 */
export function prefixForError(
  e: unknown,
): { prefix: GatewayErrorCode | "unknown"; message: string } {
  if (e instanceof GatewayApiError) {
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
 *
 * The persisted string is LOG-ONLY (voice.md "Never render a caught error")
 * — `message` is the raw vendor/SDK text (`"Xendit API error: 500"`, a joined
 * DOKU `error_messages` array, a bare `err.message`). Never render
 * `Invoice.paymentLinkError` to an admin directly; pass it through
 * `parsePaymentLinkError` below and render `.userMessage`, offering `.detail`
 * only behind an opt-in "detail teknis" disclosure.
 */
export function formatPaymentLinkError(e: unknown): string {
  const { prefix, message } = prefixForError(e);
  return `${prefix}: ${message}`;
}

/**
 * Indonesian, user-facing sentence for a classified payment-link error
 * prefix. Every value in `PAYMENT_LINK_ERROR_PREFIXES` is covered so a caller
 * can never fall through to a raw code or an empty string.
 *
 * Mirrors the equivalent branch in `lib/payments/reconcile.ts`'s
 * `gatewayErrorMessage` (kept separate because that function also handles
 * `429`/`408` distinctly for the manual-refresh flow; this one folds those
 * into the same "coba lagi" family since the create-link flow has no
 * retry-after UI).
 */
export function paymentLinkErrorMessage(prefix: PaymentLinkErrorPrefix): string {
  switch (prefix) {
    case "401":
    case "403":
      return "Gateway pembayaran menolak kredensial. Hubungi admin sistem.";
    case "422":
    case "4xx":
      return "Gateway pembayaran menolak data tagihan ini. Periksa nominal dan data siswa.";
    case "5xx":
      return "Gateway pembayaran sedang bermasalah. Coba lagi beberapa saat.";
    case "429":
      return "Terlalu banyak permintaan ke gateway pembayaran. Tunggu sebentar lalu coba lagi.";
    case "408":
    case "network":
      return "Gateway pembayaran tidak merespons. Coba lagi sebentar.";
    case "untagged":
    case "unknown":
    default:
      return "Gagal membuat link pembayaran. Coba lagi atau hubungi tim teknis.";
  }
}

/**
 * Split a persisted `Invoice.paymentLinkError` string (the
 * `"<prefix>: <message>"` format written by `formatPaymentLinkError`) into an
 * Indonesian user-facing message plus the raw vendor detail, so a caller can
 * render `.userMessage` as the primary sentence and `.detail` only behind a
 * "detail teknis" disclosure.
 *
 * Additive helper for `app/admin/invoices/**` (owned by another agent in this
 * cycle) to wire up wherever `invoice.paymentLinkError` is currently rendered
 * verbatim — e.g. `app/admin/invoices/[id]/page.tsx:300`. Does not change the
 * stored format or `formatPaymentLinkError`'s contract, so existing writers
 * and `lib/finance/pending-breakdown.ts`'s own prefix-splitting are
 * unaffected.
 *
 * Returns `null` for a null/empty/undefined input (nothing to show). A
 * malformed or unrecognized prefix (should not happen given every writer goes
 * through `formatPaymentLinkError`, but defensive) falls back to `"unknown"`.
 */
export function parsePaymentLinkError(
  stored: string | null | undefined,
): { code: PaymentLinkErrorPrefix; userMessage: string; detail: string } | null {
  if (!stored) return null;
  const idx = stored.indexOf(": ");
  const rawPrefix = idx === -1 ? stored : stored.slice(0, idx);
  const detail = idx === -1 ? stored : stored.slice(idx + 2);
  const code = (PAYMENT_LINK_ERROR_PREFIXES as readonly string[]).includes(rawPrefix)
    ? (rawPrefix as PaymentLinkErrorPrefix)
    : "unknown";
  return { code, userMessage: paymentLinkErrorMessage(code), detail };
}
