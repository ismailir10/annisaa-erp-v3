/**
 * Inline retry helper for Xendit calls.
 *
 * Wraps any function returning a Promise. Catches `XenditApiError` and retries
 * on `retriable === true` up to `MAX_ATTEMPTS` total. Honors `error.retryAfterMs`
 * (Task 1 already caps at 3000ms) when present, otherwise uses `BACKOFFS_MS`
 * by attempt index.
 *
 * Logging: every attempt outcome emits `[XENDIT ATTEMPT] tenantId=... invoiceId=...
 * attempt=<n> result=<success|transient|hard> status=<httpStatus|null>
 * durationMs=<n>` via `console.log`. Vercel structured logs grep on the prefix.
 *
 * `result` convention:
 * - `success`  — the attempt's `fn()` resolved.
 * - `transient` — caught a `XenditApiError` with `retriable === true`. This is
 *   logged for retried attempts AND for the final-attempt failure when the
 *   retry budget is exhausted (the error is still retriable in nature; we
 *   simply ran out of attempts).
 * - `hard` — caught a `XenditApiError` with `retriable === false`, OR caught a
 *   non-`XenditApiError` (programmer bug, etc). Re-thrown immediately.
 *
 * `durationMs` measures only the `fn()` call (excludes backoff sleep).
 */
import { XenditApiError } from "./client";

export const MAX_ATTEMPTS = 3;
export const BACKOFFS_MS = [250, 1000] as const;
/**
 * Per-code attempt cap for the dominant retriable failure on the affected
 * sandbox env. 429 retries get **2 attempts total (1 retry)** instead of the
 * default 3, so a storm of rate-limit errors fits the 60s function ceiling
 * with concurrency=2 (cycle 2026-04-28 T1). Residual 429s after the single
 * retry persist `PENDING_PAYMENT_LINK` and drain via the orchestrator's
 * auto-sweep + manual button — same fallback chain as today.
 *
 * Other retriable codes (`5xx`, `408`, `network`) keep `MAX_ATTEMPTS = 3`.
 */
export const MAX_ATTEMPTS_429 = 2;
/**
 * Backoff used when 429 retry fires WITHOUT a `Retry-After` header. With a
 * header, `err.retryAfterMs` (already capped at 3000ms in `client.ts`) wins.
 */
export const BACKOFF_429_MS = 1500;

export interface WithXenditRetryContext {
  invoiceId: string;
  tenantId: string;
}

type AttemptResult = "success" | "transient" | "hard";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logAttempt(
  ctx: WithXenditRetryContext,
  attempt: number,
  result: AttemptResult,
  status: number | null,
  durationMs: number,
): void {
  console.log(
    `[XENDIT ATTEMPT] tenantId=${ctx.tenantId} invoiceId=${ctx.invoiceId} attempt=${attempt} result=${result} status=${status} durationMs=${durationMs}`,
  );
}

export async function withXenditRetry<T>(
  fn: () => Promise<T>,
  ctx: WithXenditRetryContext,
): Promise<T> {
  let lastError: XenditApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const value = await fn();
      logAttempt(ctx, attempt, "success", null, Date.now() - startedAt);
      return value;
    } catch (err) {
      const durationMs = Date.now() - startedAt;

      if (!(err instanceof XenditApiError)) {
        // Non-typed throw: programmer bug, network lib internal, etc. Treat as
        // hard fail so we don't loop on a non-Xendit error.
        logAttempt(ctx, attempt, "hard", null, durationMs);
        throw err;
      }

      if (!err.retriable) {
        logAttempt(ctx, attempt, "hard", err.status, durationMs);
        throw err;
      }

      // Retriable. Log as transient regardless of whether attempts remain —
      // final-attempt-failed is still the same failure mode in ops grep.
      logAttempt(ctx, attempt, "transient", err.status, durationMs);
      lastError = err;

      // Per-code attempt cap. 429 gets a tighter budget (cycle 2026-04-28 T3)
      // so a rate-limit storm doesn't blow the chunk's 60s function ceiling
      // when paired with the concurrency=2 cap.
      const maxAttempts = err.code === "429" ? MAX_ATTEMPTS_429 : MAX_ATTEMPTS;
      if (attempt >= maxAttempts) {
        throw err;
      }

      const backoffMs =
        err.retryAfterMs !== undefined
          ? err.retryAfterMs
          : err.code === "429"
            ? BACKOFF_429_MS
            : BACKOFFS_MS[attempt - 1];
      await sleep(backoffMs);
    }
  }

  // Unreachable — the loop either returns on success or throws on the final
  // attempt. This satisfies TS control-flow analysis.
  throw lastError ?? new Error("withXenditRetry: exhausted without error");
}
