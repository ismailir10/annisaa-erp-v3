/**
 * Xendit Session API client.
 * Uses the Checkout Session API with PAYMENT_LINK mode.
 * Docs: https://docs.xendit.co/apidocs/create-session
 */

const XENDIT_API_URL = "https://api.xendit.co";

/**
 * Classification codes for `XenditApiError`. Callers (e.g. `withXenditRetry`,
 * `paymentLinkError` prefix tagger) branch on this string-literal union.
 */
export type XenditErrorCode =
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
 * Typed error thrown by `createXenditSession` so callers can branch on
 * `retriable` instead of regex-matching the error message. `status` is null
 * for network errors (fetch threw before getting a response).
 */
export class XenditApiError extends Error {
  readonly status: number | null;
  readonly code: XenditErrorCode;
  readonly retriable: boolean;
  readonly retryAfterMs?: number;

  constructor(opts: {
    status: number | null;
    code: XenditErrorCode;
    retriable: boolean;
    message: string;
    retryAfterMs?: number;
  }) {
    super(opts.message);
    this.name = "XenditApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.retriable = opts.retriable;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/**
 * Defensive parse of the `Retry-After` header (RFC 7231 — seconds form).
 * Multiplies seconds → ms, caps at 3000ms (per spec budget). Returns
 * `undefined` for missing/non-numeric values so the caller can fall back to
 * its default backoff schedule rather than crashing on `NaN`.
 *
 * Note: HTTP-date form (e.g. "Wed, 21 Oct 2015 07:28:00 GMT") is not
 * supported — Xendit documents the seconds form, and parsing dates would
 * complicate the cap. parseInt("Wed", 10) returns NaN → undefined fallback.
 */
export function parseRetryAfter(headerValue: string | null): number | undefined {
  if (headerValue === null) return undefined;
  const seconds = parseInt(headerValue, 10);
  if (Number.isNaN(seconds)) return undefined;
  return Math.min(seconds * 1000, 3000);
}

/**
 * Map an HTTP response (already known to be non-OK) to a typed
 * `XenditApiError`. Body is the parsed JSON (may be `null` if parse failed).
 */
function classifyXenditResponse(
  response: Response,
  body: unknown,
): XenditApiError {
  const status = response.status;
  const bodyMessage =
    body && typeof body === "object" && "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : null;
  const message = bodyMessage ?? `Xendit API error: ${status}`;

  if (status >= 500 && status <= 599) {
    return new XenditApiError({ status, code: "5xx", retriable: true, message });
  }
  if (status === 408) {
    return new XenditApiError({ status, code: "408", retriable: true, message });
  }
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    return new XenditApiError({
      status,
      code: "429",
      retriable: true,
      message,
      retryAfterMs,
    });
  }
  if (status === 401) {
    return new XenditApiError({ status, code: "401", retriable: false, message });
  }
  if (status === 403) {
    return new XenditApiError({ status, code: "403", retriable: false, message });
  }
  if (status === 422) {
    return new XenditApiError({ status, code: "422", retriable: false, message });
  }
  if (status >= 400 && status <= 499) {
    return new XenditApiError({ status, code: "4xx", retriable: false, message });
  }
  // Last-resort default: response was non-OK but not in any known band.
  return new XenditApiError({
    status,
    code: "unknown",
    retriable: false,
    message,
  });
}

/** Convert Indonesian phone number to E.164 format (+62xxx) */
function formatPhoneE164(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("62")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+62${cleaned.slice(1)}`;
  return `+62${cleaned}`;
}

function getAuthHeader(): string {
  const apiKey = process.env.XENDIT_SECRET_KEY;
  if (!apiKey) throw new Error("XENDIT_SECRET_KEY not configured");
  // Xendit uses Basic Auth with secret key as username, empty password
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
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

export type CreateSessionResponse = {
  /**
   * Xendit session id. Null when Xendit returns a response without a
   * recognizable id field (observed in sandbox; see `pickSessionId`).
   * The payment URL is still usable; callers should persist `null` in
   * `Invoice.xenditSessionId` and rely on `xenditPaymentUrl` for
   * idempotency / re-fetch.
   */
  id: string | null;
  payment_link_url: string;
  status: string;
  expires_at: string;
};

/**
 * Create a Xendit Checkout Session for an invoice.
 * Returns the payment link URL that can be shared with parents.
 */
export async function createXenditSession(
  params: CreateSessionParams
): Promise<CreateSessionResponse> {
  // Set expiry to N days from now (default 7)
  const expiryDays = params.expiryDays ?? 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const body: Record<string, unknown> = {
    reference_id: params.referenceId,
    session_type: "PAY",
    mode: "PAYMENT_LINK",
    amount: Math.round(params.amount),
    currency: "IDR",
    country: "ID",
    capture_method: "AUTOMATIC",
    locale: "id",
    description: params.description,
    success_return_url: params.successReturnUrl,
    cancel_return_url: params.cancelReturnUrl,
    expires_at: expiresAt.toISOString(),
    customer: {
      reference_id: `cust_${params.referenceId}`,
      type: "INDIVIDUAL",
      ...(params.customerEmail && { email: params.customerEmail }),
      ...(params.customerPhone && { mobile_number: formatPhoneE164(params.customerPhone) }),
      individual_detail: {
        given_names: params.customerName,
      },
    },
  };

  // Add items if provided
  if (params.items?.length) {
    body.items = params.items.map((item, idx) => ({
      reference_id: `item_${idx}`,
      name: item.name,
      type: "DIGITAL_PRODUCT",
      category: "EDUCATION",
      net_unit_amount: Math.round(item.price),
      quantity: item.quantity,
      currency: "IDR",
    }));
  }

  let response: Response;
  try {
    response = await fetch(`${XENDIT_API_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Fetch itself threw — DNS, TLS, socket reset, etc. No HTTP response to
    // classify, so retriable network error with status=null.
    const message = err instanceof Error ? err.message : "Xendit network error";
    throw new XenditApiError({
      status: null,
      code: "network",
      retriable: true,
      message,
    });
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    console.error("[XENDIT ERROR] Create session failed:", JSON.stringify(errorBody));
    throw classifyXenditResponse(response, errorBody);
  }

  const data = await response.json();
  if (process.env.XENDIT_DEBUG === "1") {
    // One-off shape probing. Only enabled when operator opts in.
    console.log("[XENDIT DEBUG] Session response:", JSON.stringify(data));
  }
  const paymentUrl: string | undefined =
    data.payment_link_url ?? data.checkout?.url;
  if (!paymentUrl) {
    // Empty/missing URL would silently break the SENT-transition guard at
    // app/api/invoices/[id]/route.ts (it gates on truthy xenditPaymentUrl).
    throw new Error("[XENDIT] Session response missing payment_link_url");
  }
  return {
    id: pickSessionId(data),
    payment_link_url: paymentUrl,
    status: data.status,
    expires_at: data.expires_at,
  };
}

/**
 * Strip query string from a URL — keeps origin + pathname only.
 * Used by triage logging so `?invoice=…` ids stay out of logs while
 * the route (`/payment/success` or `/payment/cancel`) and origin
 * (preview / staging / prod) remain visible for debugging.
 *
 * Returns null on falsy input or non-URL strings (defensive — webhook
 * payload field may be missing on some Xendit payloads).
 */
export function stripQuery(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

/**
 * Defensive id extraction. Earlier Xendit `/sessions` responses observed
 * with a missing top-level `id` — `xenditSessionId` came back null even
 * though `payment_link_url` was set. Try documented shapes in priority
 * order; return null if none matched (caller stores `null` and continues).
 *
 * Exported for unit testing.
 */
export function pickSessionId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidates: unknown[] = [
    d.id,
    d.session_id,
    d.payment_session_id,
    (d.session as { id?: unknown } | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}
