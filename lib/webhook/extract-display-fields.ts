/**
 * Pure parser that distills a payment-gateway webhook envelope into the
 * small set of fields the admin "Aktivitas Pembayaran" panel actually
 * displays. Handles both envelope shapes stored in `WebhookEvent.payload`:
 *
 * **Xendit** (`payment_session.completed` etc. — envelope wraps a `data`
 * object):
 *   - paidAt        ← `data.updated ?? data.created ?? envelope.created`
 *   - paymentMethod ← always `null`. Xendit Payment Link does NOT surface
 *                     the user's chosen rail on this event; the rail only
 *                     appears on an event type we don't subscribe to. UI
 *                     shows "Metode: —" with a tooltip.
 *   - amount        ← `data.amount`
 *   - currency      ← `data.currency`
 *   - sessionId     ← `data.payment_session_id`
 *   - paymentId     ← `data.payment_id`
 *
 * **DOKU** (notification envelope — flat top-level `order` / `transaction` /
 * `channel`, no `data` wrapper; cycle 2026-07-27-doku-payment-gateway T6):
 *   - paidAt        ← `transaction.date`
 *   - paymentMethod ← `channel.id` (e.g. `"VIRTUAL_ACCOUNT_BCA"`) — DOKU
 *                     DOES report the rail, unlike Xendit. The activity card
 *                     renders this human-readably rather than dumping the
 *                     raw enum.
 *   - amount        ← `order.amount`
 *   - currency      ← `transaction.amount_details.currency` when present
 *                     (DOKU's notification doesn't always echo it)
 *   - sessionId     ← `null` (DOKU notifications carry no session/token id)
 *   - paymentId     ← `transaction.original_request_id`
 *
 * The envelope shape is detected structurally (presence of `order` +
 * `transaction`, both objects, at the top level) rather than by a
 * `provider` discriminator, since the raw payload stored on disk is exactly
 * what each gateway sent — Xendit's shape never has a top-level `order` or
 * `transaction` key, so the two detections cannot collide.
 *
 * Other event shapes (e.g. Xendit's `payment_session.expired`) lack most of
 * these fields. The parser returns all-null for completely unparseable
 * inputs rather than throwing, so the panel can render a row for any stored
 * event without special-casing per type.
 */

export interface DisplayFields {
  paidAt: Date | null;
  paymentMethod: string | null;
  amount: number | null;
  currency: string | null;
  sessionId: string | null;
  paymentId: string | null;
}

const ALL_NULL: DisplayFields = {
  paidAt: null,
  paymentMethod: null,
  amount: null,
  currency: null,
  sessionId: null,
  paymentId: null,
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDokuDisplayFields(
  order: Record<string, unknown>,
  transaction: Record<string, unknown>,
  channel: Record<string, unknown>,
): DisplayFields {
  const amountDetails = isPlainObject(transaction.amount_details)
    ? transaction.amount_details
    : null;

  return {
    paidAt: parseDate(transaction.date),
    paymentMethod: asString(channel.id),
    // DOKU sends `order.amount` as an integer on most channels but as a
    // float (e.g. `20000.00`) on some — mirror the coercion the webhook
    // route itself applies rather than dropping to null on a valid amount.
    amount: asNumber(order.amount) ?? asNumber(Number(order.amount)),
    currency: amountDetails ? asString(amountDetails.currency) : null,
    // DOKU notifications carry no session/token id.
    sessionId: null,
    paymentId: asString(transaction.original_request_id),
  };
}

export function extractDisplayFields(envelope: unknown): DisplayFields {
  if (envelope === null || envelope === undefined) return { ...ALL_NULL };
  if (typeof envelope !== "object") return { ...ALL_NULL };

  const body = envelope as Record<string, unknown>;

  // DOKU notification shape: flat top-level `order` + `transaction` objects,
  // no `data` wrapper. Detected structurally — Xendit envelopes never carry
  // both keys at the top level.
  if (isPlainObject(body.order) && isPlainObject(body.transaction)) {
    const channel = isPlainObject(body.channel) ? body.channel : {};
    return extractDokuDisplayFields(body.order, body.transaction, channel);
  }

  const data = (body.data ?? null) as Record<string, unknown> | null;

  if (!data || typeof data !== "object") {
    return { ...ALL_NULL };
  }

  const paidAt =
    parseDate(data.updated) ?? parseDate(data.created) ?? parseDate(body.created);

  return {
    paidAt,
    // Payment Link mode: method is not in payment_session.completed events.
    // Keep null; UI renders the long-form rationale via tooltip.
    paymentMethod: null,
    amount: asNumber(data.amount),
    currency: asString(data.currency),
    sessionId: asString(data.payment_session_id),
    paymentId: asString(data.payment_id),
  };
}
