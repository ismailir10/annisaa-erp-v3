/**
 * DOKU Checkout (non-SNAP) request signing.
 *
 * Pure functions, no I/O, no env reads — cycle 2026-07-27-doku-payment-gateway
 * T2. Mirrors DOKU's documented signature scheme:
 *
 *   Digest    = base64(sha256(rawRequestBody))
 *   Signature = "HMACSHA256=" + base64(hmacSha256(signedString, secretKey))
 *
 * where `signedString` is the following components joined by `"\n"` with NO
 * trailing newline, in this exact order:
 *
 *   Client-Id:{clientId}
 *   Request-Id:{requestId}
 *   Request-Timestamp:{timestamp}
 *   Request-Target:{target}
 *   Digest:{digest}
 *
 * The `Digest:` line is omitted entirely when `digest` is `undefined` — DOKU's
 * docs: "For GET Method, you don't need to generate a Digest."
 *
 * Verified against DOKU's published worked example (see
 * `lib/payments/doku/__tests__/signature.test.ts`): the signed-string
 * assembly matches byte-for-byte. DOKU does not publish the secret key used
 * to produce that example's `Signature` value, so the HMAC step itself is
 * verified against a separately fixed, self-computed vector instead.
 */
import { createHash, createHmac } from "crypto";

/** `base64(sha256(rawBody))`. Pass the exact string that will be sent as the
 * request body — re-serialising a parsed object would change the bytes and
 * break verification on DOKU's side. */
export function buildDigest(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("base64");
}

export interface DokuSignedStringInput {
  clientId: string;
  requestId: string;
  timestamp: string;
  target: string;
  /** Omitted (no `Digest:` line) for GET requests — DOKU docs. */
  digest?: string;
}

/**
 * Assemble the newline-joined string that gets HMAC-signed. Exported
 * separately from `buildSignature` so tests can assert the assembly step in
 * isolation from the (unpublished) secret key.
 */
export function buildSignedString(input: DokuSignedStringInput): string {
  const lines = [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.timestamp}`,
    `Request-Target:${input.target}`,
  ];
  if (input.digest !== undefined) {
    lines.push(`Digest:${input.digest}`);
  }
  return lines.join("\n");
}

export interface DokuSignatureInput extends DokuSignedStringInput {
  secretKey: string;
}

/** `"HMACSHA256=" + base64(hmacSha256(signedString, secretKey))`. */
export function buildSignature(input: DokuSignatureInput): string {
  const signedString = buildSignedString(input);
  const hmac = createHmac("sha256", input.secretKey)
    .update(signedString, "utf8")
    .digest("base64");
  return `HMACSHA256=${hmac}`;
}
