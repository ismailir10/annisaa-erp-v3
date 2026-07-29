/**
 * Thin re-export shim. The real implementation moved to
 * `lib/payments/session.ts` in cycle 2026-07-27-doku-payment-gateway T3,
 * which resolves the active `PaymentGateway` (Xendit or DOKU) via
 * `getGateway()` instead of calling the Xendit client concretely. This file
 * exists so no consumer import path had to change in that task.
 */
export {
  createPaymentSessionForInvoice,
  createPaymentSessionForInvoice as createXenditSessionForInvoice,
  resolveAppOrigin,
} from "../payments/session";
