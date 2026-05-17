/**
 * Decide how to render the "Bayar sekarang" CTA on the parent invoice
 * detail sheet, based on whether the Xendit payment URL is present and
 * how long the invoice has been sitting without one.
 *
 * - `ready`: link exists → render the CTA as a live link.
 * - `pending`: no link yet, but the invoice was sent less than 24h ago →
 *   render a disabled CTA + optimistic "sedang disiapkan" copy.
 *   Xendit normally provisions links within minutes; this is the happy-path
 *   transient state.
 * - `stale`: no link AND the invoice has been sent more than 24h ago (or
 *   the sent timestamp is missing entirely) → hide the CTA and direct the
 *   parent to contact admin. Resolves UAT 2026-05-12 parent MINOR-02 —
 *   parents were seeing reassuring "coba lagi" copy forever when the link
 *   never came.
 */
export type PaymentLinkState = "ready" | "pending" | "stale";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function paymentLinkState(
  hasPaymentLink: boolean,
  sentAt: string | null,
  now: Date = new Date(),
): PaymentLinkState {
  if (hasPaymentLink) return "ready";
  if (!sentAt) return "stale";
  const sentMs = new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return "stale";
  return now.getTime() - sentMs > STALE_THRESHOLD_MS ? "stale" : "pending";
}
