/**
 * Pure PII redactor for payment-gateway webhook payloads (Xendit + DOKU).
 *
 * Recursively strips PII subtrees at ANY depth — Xendit nests customer info
 * under `data.customer.*` for sessions created with embedded customer
 * details, and at the envelope root in other cases; both shapes leak
 * `email`, `mobile_number`, `given_names`, `surname` if not redacted. DOKU's
 * notification envelope additionally carries `virtual_account_info.*`,
 * which can include the account holder's name.
 *
 * Replaced subtrees: `customer.*`, `billing_information.*`,
 * `virtual_account_info.*` → `{ REDACTED: true }`.
 *
 * Every other field is preserved untouched. Null / undefined / primitives
 * are returned unchanged so callers don't pre-validate.
 *
 * The redactor does NOT mutate the input — a deep copy is built and
 * sensitive keys are replaced. The unredacted `WebhookEvent.payload`
 * column on disk is the audit-of-record; this function only protects
 * the read surface exposed to the admin "Aktivitas Pembayaran" panel.
 */

export type RedactedPayload = Record<string, unknown> | null | undefined;

const REDACTED_MARKER = { REDACTED: true } as const;
const PII_KEYS = new Set(["customer", "billing_information", "virtual_account_info"]);

function deepRedact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepRedact);
  if (typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    out[k] = PII_KEYS.has(k) ? { ...REDACTED_MARKER } : deepRedact(v);
  }
  return out;
}

export function redactPayload(input: unknown): RedactedPayload {
  if (input === null || input === undefined) return input as RedactedPayload;
  if (typeof input !== "object") return input as RedactedPayload;
  return deepRedact(input) as RedactedPayload;
}
