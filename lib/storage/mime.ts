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
 * Supported signatures:
 *   - JPEG: starts with `FF D8 FF`
 *   - PNG : starts with `89 50 4E 47 0D 0A 1A 0A`
 *   - PDF : starts with `%PDF-` (`25 50 44 46 2D`) — T14 KTP/KK only
 *
 * `detectMime()` returns any supported type (used by T14 doc routes that
 * accept all three). Callers that only accept images (T3 student photo)
 * pass `imagesOnly: true` to keep PDF out of their allow-list.
 *
 * Returns a discriminated union so callers do `if (!result.ok) return 415`.
 */

export type MimeResult =
  | { ok: true; mimeType: "image/jpeg" | "image/png" | "application/pdf"; ext: "jpg" | "png" | "pdf" }
  | { ok: false; error: string };

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

export type DetectOpts = {
  /** When true, PDF magic bytes are rejected — used by image-only callers (T3). */
  imagesOnly?: boolean;
};

/**
 * Detect the MIME type of `bytes` by inspecting the leading magic-byte
 * signature. The `claimedType` is recorded for the error message only —
 * never trusted for the routing decision.
 */
export function detectMime(bytes: Buffer, claimedType: string, opts: DetectOpts = {}): MimeResult {
  if (!bytes || bytes.length === 0) {
    return { ok: false, error: "Empty file" };
  }
  // Smallest valid JPEG SOI+marker is 3 bytes; PNG header is 8 bytes; PDF is 5.
  // Anything below 8 bytes cannot match the longest required signature.
  if (bytes.length < 8) {
    return { ok: false, error: "File too small to validate" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { ok: true, mimeType: "image/jpeg", ext: "jpg" };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { ok: true, mimeType: "image/png", ext: "png" };
  }
  if (!opts.imagesOnly && startsWith(bytes, PDF_SIGNATURE)) {
    return { ok: true, mimeType: "application/pdf", ext: "pdf" };
  }
  const accepted = opts.imagesOnly ? "JPEG and PNG" : "JPEG, PNG, and PDF";
  return {
    ok: false,
    error: `Unsupported file type (claimed: ${claimedType || "unknown"}); only ${accepted} accepted`,
  };
}
