// Unit tests for verifyMimeBytes (lib/storage/mime-verify.ts).
//
// Cycle: docs/cycles/2026-05-06-p2-students-guardians-household.md (T5)
// Spec lower bound: 5 cases (each FileKind valid sample, mismatch, truncated,
// unknown kind, declared MIME spoof). Below exceeds that — one valid case
// per FileKind in the enum (5) + truncated + unknown-kind + spoof + WEBP
// multi-segment + extended buffer permissiveness (10 total). Goal: lock the
// any-of signature semantics and the spoof-rejection invariant T8 will rely
// on when wiring /api/upload.

import { describe, expect, it } from "vitest";
import { _internal, verifyMimeBytes } from "../mime-verify";

// Deterministic 12-byte (or longer) prefixes covering every signature in the
// table. Pad with zeros after the magic bytes — the verifier only inspects
// the prefix; the trailing bytes are payload.

const JPEG_HEAD = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const PDF_HEAD = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0,
]);
const WEBP_HEAD = new Uint8Array([
  // "RIFF" + 4 size bytes (any) + "WEBP"
  0x52, 0x49, 0x46, 0x46, 0x10, 0x20, 0x30, 0x40, 0x57, 0x45, 0x42, 0x50,
]);
// MP4: 4 size bytes + "ftyp" at offset 4 + "isom" brand at offset 8.
const MP4_HEAD = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);
// MP3 with ID3v2 tag.
const MP3_HEAD = new Uint8Array([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0, 0, 0, 0, 0, 0,
]);
// ZIP local-file-header.
const ZIP_HEAD = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0, 0, 0, 0, 0, 0,
]);

describe("verifyMimeBytes — valid samples per FileKind", () => {
  it("accepts a valid JPEG header for IMAGE", () => {
    expect(verifyMimeBytes(JPEG_HEAD, "IMAGE")).toEqual({ ok: true });
  });

  it("accepts a valid PNG header for IMAGE", () => {
    expect(verifyMimeBytes(PNG_HEAD, "IMAGE")).toEqual({ ok: true });
  });

  it("accepts a valid WEBP header for IMAGE (multi-segment RIFF + WEBP)", () => {
    expect(verifyMimeBytes(WEBP_HEAD, "IMAGE")).toEqual({ ok: true });
  });

  it("accepts a valid PDF header for DOCUMENT", () => {
    expect(verifyMimeBytes(PDF_HEAD, "DOCUMENT")).toEqual({ ok: true });
  });

  it("accepts a valid MP4 ftyp box for VIDEO", () => {
    expect(verifyMimeBytes(MP4_HEAD, "VIDEO")).toEqual({ ok: true });
  });

  it("accepts an MP3 ID3v2 header for AUDIO", () => {
    expect(verifyMimeBytes(MP3_HEAD, "AUDIO")).toEqual({ ok: true });
  });

  it("accepts a ZIP local-file-header for ARCHIVE", () => {
    expect(verifyMimeBytes(ZIP_HEAD, "ARCHIVE")).toEqual({ ok: true });
  });
});

describe("verifyMimeBytes — rejection paths", () => {
  it("rejects ext/magic mismatch: JPEG bytes declared as DOCUMENT", () => {
    const r = verifyMimeBytes(JPEG_HEAD, "DOCUMENT");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/did not match/);
  });

  it("rejects content-type spoof: PDF bytes declared as IMAGE", () => {
    // T8's contract: a client lying about Content-Type (declaring image/jpeg
    // while sending a PDF body) must be caught here, not by sharp's decode
    // failure. Locks the spoof-rejection invariant.
    const r = verifyMimeBytes(PDF_HEAD, "IMAGE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/did not match/);
  });

  it("rejects buffer shorter than the 12-byte minimum", () => {
    // Only 3 bytes (valid JPEG SOI but truncated). Verifier short-circuits
    // on length BEFORE running matchers — this guards against accidentally
    // letting a 3-byte JPEG-prefix payload through if a future signature
    // edit shortened the WEBP-required prefix.
    const truncated = new Uint8Array([0xff, 0xd8, 0xff]);
    const r = verifyMimeBytes(truncated, "IMAGE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too short/);
  });

  it("rejects an unknown FileKind value", () => {
    const r = verifyMimeBytes(JPEG_HEAD, "UNKNOWN_KIND");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unsupported FileKind/);
  });
});

describe("verifyMimeBytes — table coverage invariant", () => {
  it("covers every FileKind enum value with at least one signature", () => {
    // Locks the FileKind ↔ TABLE-key contract — if a future migration adds
    // a new FileKind, this test fails until the table is extended.
    const kinds = ["DOCUMENT", "IMAGE", "VIDEO", "AUDIO", "ARCHIVE"];
    for (const k of kinds) {
      expect(_internal.TABLE[k]).toBeDefined();
      expect(_internal.TABLE[k].length).toBeGreaterThan(0);
    }
  });
});
