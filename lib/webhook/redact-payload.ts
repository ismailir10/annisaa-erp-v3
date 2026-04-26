/**
 * Pure PII redactor for Xendit webhook payloads.
 *
 * Strips two top-level subtrees that Xendit may include with personally
 * identifiable information before the payload is shipped to the admin
 * "Aktivitas Xendit" panel:
 *   - `customer`             → entire object replaced with `{ REDACTED: true }`
 *   - `billing_information`  → same
 *
 * Every other field is preserved untouched. Null / undefined / non-object
 * inputs are returned unchanged so the caller does not need to pre-validate.
 *
 * The redactor does NOT mutate the input — a shallow copy with the two
 * sensitive keys overridden is returned. This matters because the same
 * `payload` field is read in `extractDisplayFields` immediately afterwards,
 * and we don't want order-of-operations to silently strip data the parser
 * needs.
 */

export type RedactedPayload = Record<string, unknown> | null | undefined;

const REDACTED_MARKER = { REDACTED: true } as const;

export function redactPayload(input: unknown): RedactedPayload {
  if (input === null || input === undefined) return input as RedactedPayload;
  if (typeof input !== "object") return input as RedactedPayload;

  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };

  if ("customer" in out) {
    out.customer = { ...REDACTED_MARKER };
  }
  if ("billing_information" in out) {
    out.billing_information = { ...REDACTED_MARKER };
  }

  return out;
}
