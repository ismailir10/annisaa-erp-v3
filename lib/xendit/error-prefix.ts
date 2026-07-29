/**
 * Thin re-export shim. The real implementation moved to
 * `lib/payments/error-prefix.ts` in cycle 2026-07-27-doku-payment-gateway T1
 * (the prefix tagger is gateway-agnostic). This file exists so no consumer
 * import path had to change in that task. The colon separator emitted by
 * `formatPaymentLinkError` is a persisted-data schema contract — unchanged.
 */
export {
  PAYMENT_LINK_ERROR_PREFIXES,
  type PaymentLinkErrorPrefix,
  prefixForError,
  formatPaymentLinkError,
} from "../payments/error-prefix";
