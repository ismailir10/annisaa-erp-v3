import { describe, it, expect } from "vitest";
import { detectMime } from "../mime";

// Magic-byte detection has no I/O so we test pure Buffer inputs.
//
// The CRITICAL contract this test pins: claimed Content-Type from the client
// is NEVER trusted. A `.exe` claiming `image/jpeg` must be rejected on the
// first byte of its DOS-stub header (`MZ` = 0x4d 0x5a), not on its claim.

const JPEG_PREFIX = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]); // SOI + APP0 "JF"
const PNG_PREFIX = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]); // canonical PNG header + 1 byte
const EXE_PREFIX = Buffer.from([
  0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04,
]); // DOS "MZ" stub start

describe("detectMime", () => {
  it("accepts JPEG by magic bytes regardless of claimed type", () => {
    const r = detectMime(JPEG_PREFIX, "application/octet-stream");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mimeType).toBe("image/jpeg");
      expect(r.ext).toBe("jpg");
    }
  });

  it("accepts PNG by magic bytes regardless of claimed type", () => {
    const r = detectMime(PNG_PREFIX, "image/jpeg" /* lying */);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mimeType).toBe("image/png");
      expect(r.ext).toBe("png");
    }
  });

  it("rejects an .exe claiming image/jpeg (security-critical case)", () => {
    const r = detectMime(EXE_PREFIX, "image/jpeg");
    expect(r.ok).toBe(false);
  });

  it("rejects empty buffer", () => {
    const r = detectMime(Buffer.alloc(0), "image/jpeg");
    expect(r.ok).toBe(false);
  });

  it("rejects too-small buffer (< 8 bytes — cannot match PNG signature)", () => {
    const r = detectMime(Buffer.from([0xff, 0xd8]), "image/jpeg");
    expect(r.ok).toBe(false);
  });

  it("accepts PDF by magic bytes (T14 — KTP/KK upload allows it)", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const r = detectMime(pdf, "application/pdf");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mimeType).toBe("application/pdf");
      expect(r.ext).toBe("pdf");
    }
  });

  it("rejects PDF when imagesOnly=true (T3 photo upload — PDF avatars not useful)", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const r = detectMime(pdf, "application/pdf", { imagesOnly: true });
    expect(r.ok).toBe(false);
  });

  it("rejects an .exe claiming application/pdf — magic bytes still win", () => {
    const r = detectMime(EXE_PREFIX, "application/pdf");
    expect(r.ok).toBe(false);
  });
});
