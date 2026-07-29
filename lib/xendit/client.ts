/**
 * Thin re-export shim. The real implementation moved to
 * `lib/payments/xendit/client.ts` in cycle 2026-07-27-doku-payment-gateway
 * T1, which implements the gateway-agnostic `PaymentGateway` port. This file
 * exists so no consumer import path had to change in that task —
 * `XenditApiError` / `XenditErrorCode` are aliases of the shared
 * `GatewayApiError` / `GatewayErrorCode` types.
 */
export {
  createXenditSession,
  pingXenditBalance,
  stripQuery,
  pickSessionId,
  parseRetryAfter,
  xenditGateway,
  type CreateSessionParams,
  type CreateSessionResponse,
} from "../payments/xendit/client";

export {
  GatewayApiError as XenditApiError,
  type GatewayErrorCode as XenditErrorCode,
} from "../payments/types";
