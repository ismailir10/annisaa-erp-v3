import { dokuGateway } from "./doku/client";
import { xenditGateway } from "./xendit/client";
import type { PaymentGateway } from "./types";

/**
 * Resolve the active `PaymentGateway` from `process.env.PAYMENT_GATEWAY`.
 *
 * `"xendit"` or unset → Xendit (keeps un-migrated environments working, per
 * AC-2). `"doku"` → DOKU Checkout (T2). Anything else throws with the
 * offending value in the message so a typo fails loud at call time rather
 * than silently falling back to Xendit.
 */
export function getGateway(): PaymentGateway {
  const value = process.env.PAYMENT_GATEWAY;

  if (value === undefined || value === "xendit") {
    return xenditGateway;
  }

  if (value === "doku") {
    return dokuGateway;
  }

  throw new Error(`Unrecognized PAYMENT_GATEWAY value: "${value}"`);
}
