// compressImage — server-only sharp pipeline wrapper.
//
// Re-encodes the input buffer into a 1920px-max JPEG (quality 80, mozjpeg)
// with EXIF stripped, returning the compressed buffer + computed ratio.
//
// Why this pipeline:
//   - 1920px (fit: inside, withoutEnlargement) caps the long edge at desktop
//     full-HD — covers the largest practical render target while collapsing
//     12MP+ phone uploads to ~25% of the byte count. Smaller inputs pass
//     through unscaled.
//   - JPEG-80 + mozjpeg trades ~5% extra encode CPU for ~10–15% smaller files
//     vs. libjpeg-turbo defaults at visually-indistinguishable quality on
//     photographic content.
//   - EXIF-stripped is the default sharp .jpeg() behaviour (no .withMetadata()
//     call). This drops GPS / camera-serial / thumbnail metadata that would
//     otherwise persist through the storage layer — a privacy default for the
//     parent / teacher uploads that dominate real traffic. Test §2 locks the
//     behaviour against a future regression.
//
// Why .autoOrient() BEFORE .resize(): .autoOrient() (sharp 0.34+ explicit API;
// supersedes the legacy `.rotate()` no-args form which had a known dimension-
// swap bug for Orientation 6 in the 0.33.x line — sharp issue #4494) reads the
// EXIF orientation tag, rotates pixel data accordingly, and resets the tag to
// 1 (normal). Resizing first would alter pixel data while leaving the
// orientation flag intact, producing a sideways-rendered output downstream.
// The order is load-bearing. Test §2 locks `meta.exif === undefined` post-
// pipeline; an orientation-correctness regression test (with an EXIF-tagged
// fixture) is out of scope for this cycle.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §16.1
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §lib/storage/sharp.ts)
//
// Server-only by construction: `import sharp from "sharp"` is itself the
// runtime boundary — sharp is a native module (libvips bindings) that fails
// fast in client bundles. The cycle locks `serverExternalPackages: ["sharp"]`
// in next.config.ts (T1) so Webpack stops bundling the native binary into
// route output. Same boundary-marker pattern as lib/audit/write.ts +
// lib/timeline/emit.ts (env / native import as the fail-fast guard, no
// `server-only` npm shim).

import sharp from "sharp";

export async function compressImage(buffer: Buffer): Promise<{
  buffer: Buffer;
  mimeType: "image/jpeg";
  ratio: number;
}> {
  // limitInputPixels caps decoded pixel count BEFORE the resize clamp runs —
  // closes the decompression-bomb DoS where a small (≤10 MB) PNG decodes to
  // ~25k×25k×4 ≈ 2.5 GB raw and OOMs the function. 24 MP covers any real
  // phone (12 MP camera + 2× cropping headroom) while rejecting bombs cleanly
  // (libvips throws; route catch flips the row to FAILED).
  const output = await sharp(buffer, { limitInputPixels: 24_000_000 })
    .autoOrient()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return {
    buffer: output,
    mimeType: "image/jpeg",
    ratio: output.length / buffer.length,
  };
}
