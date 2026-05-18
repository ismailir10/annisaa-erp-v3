/**
 * Server-side MIME detection via magic-byte signature.
 *
 * Why: the `Content-Type` header sent by the client is attacker-controlled.
 * A malicious actor can upload a `.exe` claiming `image/jpeg` and trigger
 * downstream parsers, AV-scanners, or image libraries on non-image bytes.
 * The reviewer pass on the kesiswaan cycle flagged the same risk for KTP /
 * KK upload — this adapter is the foundation for both photos (T3) and
 * sensitive PII docs (T14), so we read magic bytes ourselves.
 *
 * Supported signatures (kept minimal — this adapter handles images only.
 * PDF support for KTP/KK is added in T14 by extending this detector):
 *   - JPEG: starts with `FF D8 FF`
 *   - PNG : starts with `89 50 4E 47 0D 0A 1A 0A`
 *
 * Returns a discriminated union so callers do `if (!result.ok) return 415`.
 */

export type MimeResult =
  | { ok: true; mimeType: "image/jpeg" | "image/png"; ext: "jpg" | "png" }
  | { ok: false; error: string };

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Detect the MIME type of `bytes` by inspecting the leading magic-byte
 * signature. The `claimedType` is recorded for the error message only —
 * never trusted for the routing decision.
 */
export function detectMime(bytes: Buffer, claimedType: string): MimeResult {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: "Empty file" };
  }
  // Smallest valid JPEG SOI+marker is 3 bytes; PNG header is 8 bytes.
  // Anything below 8 bytes cannot match either signature.
  if (bytes.length < 8) {
    return { ok: false, error: "File too small to validate" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { ok: true, mimeType: "image/jpeg", ext: "jpg" };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { ok: true, mimeType: "image/png", ext: "png" };
  }
  return {
    ok: false,
    error: `Unsupported file type (claimed: ${claimedType || "unknown"}); only JPEG and PNG accepted`,
  };
}
