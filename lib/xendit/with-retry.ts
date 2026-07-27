/**
 * Thin re-export shim. The real implementation moved to
 * `lib/payments/with-retry.ts` in cycle 2026-07-27-doku-payment-gateway T1
 * (the retry loop is gateway-agnostic — it only depends on `GatewayApiError`).
 * This file exists so no consumer import path had to change in that task.
 */
export {
  MAX_ATTEMPTS,
  BACKOFFS_MS,
  MAX_ATTEMPTS_429,
  BACKOFF_429_MS,
  withRetry as withXenditRetry,
  type RetryContext as WithXenditRetryContext,
} from "../payments/with-retry";
