/**
 * Xendit Session API client.
 * Uses the Checkout Session API with PAYMENT_LINK mode.
 * Docs: https://docs.xendit.co/apidocs/create-session
 */

const XENDIT_API_URL = "https://api.xendit.co";

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

  const response = await fetch(`${XENDIT_API_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("[XENDIT ERROR] Create session failed:", JSON.stringify(error));
    throw new Error(error.message || `Xendit API error: ${response.status}`);
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
