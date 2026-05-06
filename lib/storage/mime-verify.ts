// MIME magic-byte verification per cycle p2-students-guardians-household
// (assumption 3 — no `file-type` npm dep; inline magic-byte table for the
// FileKind allowlist; reads first 12 bytes minimum). The /api/upload route
// (T8 wires this in) calls verifyMimeBytes post-formData-read pre-sharp to
// reject content-type spoofing where the declared MIME doesn't match the
// buffer's leading bytes.
//
// FileKind enum (prisma/schema.prisma L85-91):
//   DOCUMENT | IMAGE | VIDEO | AUDIO | ARCHIVE
//
// MIME allowlist mirrors app/api/upload/route.ts MIME_ALLOWLIST:
//   IMAGE     → jpeg, png, webp
//   DOCUMENT  → pdf
//   VIDEO     → mp4
//   AUDIO     → mpeg (mp3), mp4 (m4a)
//   ARCHIVE   → zip
//
// Why no `file-type` npm dep: pinned ESM-only since v17 (Next.js 16 dual-
// runtime route gotcha — server bundle imports `file-type` fine but the
// edge runtime stumbles on the dynamic CJS interop in some package
// constellations). Inline table covers the 7 MIME types in the route's
// allowlist with ~25 lines of byte-array data + a single matcher loop.
//
// Why first 12 bytes minimum:
//   - JPEG SOI: 3 bytes (FF D8 FF)
//   - PNG signature: 8 bytes (89 50 4E 47 0D 0A 1A 0A)
//   - PDF "%PDF-": 5 bytes
//   - WEBP needs RIFF (offset 0, 4 bytes) + "WEBP" (offset 8, 4 bytes) → 12
//   - MP4/M4A "ftyp" box: 4 bytes at offset 4 → 8 minimum
//   - MP3 "ID3" header (3 bytes) OR MPEG sync 0xFF 0xFB/0xF3/0xF2 (2 bytes)
//   - ZIP local-file-header: 4 bytes (50 4B 03 04)
// 12 bytes is the load-bearing minimum (covers WEBP). Larger buffers always
// permitted; the matcher only inspects the prefix.
//
// Cycle: docs/cycles/2026-05-06-p2-students-guardians-household.md (T5)

import type { FileKind } from "@/lib/generated/prisma/client";

export type VerifyMimeResult =
  | { ok: true }
  | { ok: false; reason: string };

// One signature = an AND of byte-segments at given offsets. A FileKind maps
// to a list of signatures (any-of). `null` in a position means "any byte".
type SignatureSegment = {
  /** Byte values to match; null = wildcard at that index. */
  bytes: ReadonlyArray<number | null>;
  /** Offset into the buffer where matching starts. Default 0. */
  offset?: number;
};
type Signature = ReadonlyArray<SignatureSegment>;
type SignatureTable = Record<string, ReadonlyArray<Signature>>;

// --- Image signatures ---
const JPEG: Signature = [
  // SOI marker (FF D8) + first marker byte FF — covers JFIF/Exif/SPIFF/raw.
  { bytes: [0xff, 0xd8, 0xff] },
];
const PNG: Signature = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];
const WEBP: Signature = [
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // "RIFF"
  { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // "WEBP"
];

// --- Document signatures ---
const PDF: Signature = [{ bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }]; // "%PDF-"

// --- Video signatures ---
// MP4 has the "ftyp" box at offset 4; the brand at offset 8 varies (isom,
// mp42, avc1, M4V, etc.). Match "ftyp" (66 74 79 70) at offset 4 and accept
// any brand — the route's MIME allowlist already pins this to video/mp4.
const MP4_VIDEO: Signature = [
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // "ftyp"
];

// --- Audio signatures ---
// MP3: "ID3" tag (49 44 33) OR MPEG sync FF Ex/Fx where the first sync
// frame's bits indicate MPEG audio. Common patterns: FF FB (MPEG-1 L3),
// FF F3 (MPEG-2 L3), FF F2 (MPEG-2.5 L3). Match the sync byte FF + a high
// nibble of F (0xFx) and accept the bottom-nibble variants.
const MP3_ID3: Signature = [{ bytes: [0x49, 0x44, 0x33] }]; // "ID3"
const MP3_SYNC_FB: Signature = [{ bytes: [0xff, 0xfb] }];
const MP3_SYNC_F3: Signature = [{ bytes: [0xff, 0xf3] }];
const MP3_SYNC_F2: Signature = [{ bytes: [0xff, 0xf2] }];
// M4A audio reuses the MP4 ftyp box; brand "M4A " at offset 8. Wildcard
// over the brand for permissiveness — same rationale as MP4_VIDEO above.
const M4A_AUDIO: Signature = [
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

// --- Archive signatures ---
// ZIP local file header: PK\x03\x04. Empty/EOCD-only zips (PK\x05\x06)
// rejected — uploaded archives should always have content.
const ZIP: Signature = [{ bytes: [0x50, 0x4b, 0x03, 0x04] }];

// FileKind → list of acceptable signatures (any-of). Keys MUST match the
// FileKind enum values from prisma/schema.prisma.
const TABLE: SignatureTable = {
  IMAGE: [JPEG, PNG, WEBP],
  DOCUMENT: [PDF],
  VIDEO: [MP4_VIDEO],
  AUDIO: [MP3_ID3, MP3_SYNC_FB, MP3_SYNC_F3, MP3_SYNC_F2, M4A_AUDIO],
  ARCHIVE: [ZIP],
};

const MIN_BUFFER_BYTES = 12; // Enough for WEBP "RIFF____WEBP" prefix.

export function verifyMimeBytes(
  buffer: Uint8Array,
  declaredKind: FileKind | string,
): VerifyMimeResult {
  if (!(declaredKind in TABLE)) {
    return {
      ok: false,
      reason: `unsupported FileKind for MIME verification: ${String(declaredKind)}`,
    };
  }
  if (buffer.byteLength < MIN_BUFFER_BYTES) {
    return {
      ok: false,
      reason: `buffer too short for MIME verification (got ${buffer.byteLength} bytes, need >=${MIN_BUFFER_BYTES})`,
    };
  }
  const signatures = TABLE[declaredKind as keyof typeof TABLE];
  for (const sig of signatures) {
    if (matches(buffer, sig)) return { ok: true };
  }
  return {
    ok: false,
    reason: `magic bytes for ${String(declaredKind)} did not match any expected signature`,
  };
}

function matches(buffer: Uint8Array, signature: Signature): boolean {
  for (const segment of signature) {
    const offset = segment.offset ?? 0;
    if (buffer.byteLength < offset + segment.bytes.length) return false;
    for (let i = 0; i < segment.bytes.length; i++) {
      const expected = segment.bytes[i];
      if (expected === null) continue;
      if (buffer[offset + i] !== expected) return false;
    }
  }
  return true;
}

/** Test-only: expose internals for assertions about table coverage. */
export const _internal = { TABLE, MIN_BUFFER_BYTES };
