/**
 * Pure parser that distills a Xendit webhook envelope into the small set of
 * fields the admin "Aktivitas Xendit" panel actually displays.
 *
 * Sources for `payment_session.completed` (the event type the panel cares
 * most about):
 *   - paidAt        ← `data.updated ?? data.created ?? envelope.created`
 *   - paymentMethod ← always `null` for Payment Link mode. Xendit does NOT
 *                     surface the user's chosen rail in this event; the rail
 *                     appears only on `payment.succeeded` which we don't
 *                     subscribe to. UI shows "Metode: —" with a tooltip.
 *   - amount        ← `data.amount`
 *   - currency      ← `data.currency`
 *   - sessionId     ← `data.payment_session_id`
 *   - paymentId     ← `data.payment_id`
 *
 * Other event shapes (e.g. `payment_session.expired`) lack most of these
 * fields. The parser returns all-null for completely unparseable inputs
 * rather than throwing, so the panel can render a row for any stored event
 * without special-casing per type.
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

export function extractDisplayFields(envelope: unknown): DisplayFields {
  if (envelope === null || envelope === undefined) return { ...ALL_NULL };
  if (typeof envelope !== "object") return { ...ALL_NULL };

  const body = envelope as Record<string, unknown>;
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
