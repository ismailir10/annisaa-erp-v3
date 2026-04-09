/**
 * Xendit Session API client.
 * Uses the Checkout Session API with PAYMENT_LINK mode.
 * Docs: https://docs.xendit.co/apidocs/create-session
 */

const XENDIT_API_URL = "https://api.xendit.co";

function getAuthHeader(): string {
  const apiKey = process.env.XENDIT_API_KEY;
  if (!apiKey) throw new Error("XENDIT_API_KEY not configured");
  // Xendit uses Basic Auth with API key as username, empty password
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
}

export type CreateSessionParams = {
  referenceId: string; // Our invoice ID
  amount: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  items?: { name: string; quantity: number; price: number }[];
};

export type CreateSessionResponse = {
  id: string;
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
  const body = {
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
    customer: {
      reference_id: `cust_${params.referenceId}`,
      type: "INDIVIDUAL",
      ...(params.customerEmail && { email: params.customerEmail }),
      ...(params.customerPhone && { mobile_number: params.customerPhone }),
      individual_detail: {
        given_names: params.customerName,
      },
    },
    ...(params.items && {
      items: params.items.map((item) => ({
        reference_id: `item_${item.name.toLowerCase().replace(/\s+/g, "_")}`,
        name: item.name,
        type: "DIGITAL_PRODUCT",
        category: "EDUCATION",
        net_unit_amount: Math.round(item.price),
        quantity: item.quantity,
        currency: "IDR",
      })),
    }),
  };

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
    console.error("[XENDIT ERROR] Create session failed:", error);
    throw new Error(error.message || `Xendit API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    payment_link_url: data.payment_link_url,
    status: data.status,
    expires_at: data.expires_at,
  };
}
