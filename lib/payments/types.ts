/**
 * Gateway-agnostic payment port.
 *
 * Introduced in cycle 2026-07-27-doku-payment-gateway T1 to seat a second
 * gateway (DOKU) behind the same interface Xendit already implements. Moved
 * verbatim from `lib/xendit/client.ts` — see that file's history for prior
 * provenance. Zero behaviour change in this task: `lib/xendit/client.ts` now
 * re-exports `GatewayApiError` as `XenditApiError` and `GatewayErrorCode` as
 * `XenditErrorCode` so existing consumers/tests are unaffected.
 */

/**
 * Classification codes for `GatewayApiError`. Callers (e.g. `withRetry`,
 * `prefixForError`) branch on this string-literal union.
 */
export type GatewayErrorCode =
  | "5xx"
  | "429"
  | "408"
  | "network"
  | "401"
  | "403"
  | "422"
  | "4xx"
  | "unknown";

/**
 * Typed error thrown by a `PaymentGateway` implementation so callers can
 * branch on `retriable` instead of regex-matching the error message.
 * `status` is null for network errors (fetch threw before getting a
 * response).
 */
export class GatewayApiError extends Error {
  readonly status: number | null;
  readonly code: GatewayErrorCode;
  readonly retriable: boolean;
  readonly retryAfterMs?: number;

  constructor(opts: {
    status: number | null;
    code: GatewayErrorCode;
    retriable: boolean;
    message: string;
    retryAfterMs?: number;
  }) {
    super(opts.message);
    this.name = "GatewayApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.retriable = opts.retriable;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export type CreateSessionParams = {
  referenceId: string;
  amount: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  expiryDays?: number; // Default 7 days
  items?: { name: string; quantity: number; price: number }[];
};

/** Gateway-neutral session shape returned by every `PaymentGateway.createSession`. */
export interface GatewaySession {
  id: string | null;
  paymentUrl: string;
  status: string;
  expiresAt: string;
}

/** Port implemented by each concrete payment gateway (Xendit, DOKU, ...). */
export interface PaymentGateway {
  readonly id: "xendit" | "doku";
  createSession(params: CreateSessionParams): Promise<GatewaySession>;
  ping(timeoutMs?: number): Promise<void>;
}
