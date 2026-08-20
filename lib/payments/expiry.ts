/**
 * Payment session expiry policy.
 *
 * Added in cycle 2026-08-20-invoice-due-date-to-gateway. Before that cycle the
 * gateway port carried `expiryDays?: number` and the invoice session builder
 * passed a hardcoded `7`, so every Virtual Account expired seven days after it
 * was issued no matter what due date the admin had entered. This module owns
 * the replacement policy so it can be unit tested directly instead of being
 * inlined in the session builder where it could not be exercised.
 */

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fallback expiry for callers that have no invoice and therefore no due date —
 * the DOKU probe route, the reseed script, the finish-xendit script. Preserves
 * the historical 7-day behaviour for those paths only.
 *
 * The invoice path must never reach this. `resolveSessionExpiry` is what that
 * path uses, and `lib/payments/__tests__/session-expiry.test.ts` asserts the
 * gateway receives a due-date-derived instant rather than this default.
 */
export function defaultExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + 7 * DAY_MS);
}
