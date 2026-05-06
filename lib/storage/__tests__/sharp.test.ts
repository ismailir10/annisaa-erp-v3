// Unit tests for compressImage (lib/storage/sharp.ts).
//
// Exercises the locked sharp pipeline: 1920px resize cap, EXIF strip default
// (regression lock against a future .withMetadata() addition), ratio
// computation, format coercion (PNG → JPEG), and corrupt-input rejection.
//
// Fixture: lib/storage/__tests__/fixtures/sample.jpg (~3000×2000, ~41KB,
// generated synthetically via sharp's create + composite — NOT a real photo,
// no PII, no embedded EXIF). Dimensions chosen to exercise the 1920px resize
// path (3000 > 1920); JPEG quality 70 keeps the file under 50KB.
//
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §sharp.test.ts)

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { compressImage } from "../sharp";

const FIXTURE = readFileSync(join(__dirname, "fixtures", "sample.jpg"));

describe("compressImage — resize", () => {
  it("caps a 3000×2000 image at 1920px on the long edge", async () => {
    // Verify the fixture actually exercises the resize path — guards against
    // a future fixture swap silently regressing this test to a passthrough.
    const inputMeta = await sharp(FIXTURE).metadata();
    expect(inputMeta.width).toBeGreaterThan(1920);

    const output = await compressImage(FIXTURE);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1920);
  });
});

describe("compressImage — EXIF strip", () => {
  it("produces output with no EXIF metadata (regression lock against .withMetadata())", async () => {
    const output = await compressImage(FIXTURE);
    const meta = await sharp(output.buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });
});

describe("compressImage — ratio", () => {
  it("computes ratio as output.buffer.length / input.length", async () => {
    const output = await compressImage(FIXTURE);
    expect(output.ratio).toBe(output.buffer.length / FIXTURE.length);
    expect(output.ratio).toBeGreaterThan(0);
  });
});

describe("compressImage — format coercion", () => {
  it("re-encodes a PNG input as JPEG output", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const output = await compressImage(pngBuffer);
    expect(output.mimeType).toBe("image/jpeg");
    const meta = await sharp(output.buffer).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

describe("compressImage — corrupt input", () => {
  it("rejects a non-image buffer", async () => {
    await expect(
      compressImage(Buffer.from("not-an-image")),
    ).rejects.toThrow();
  });
});
