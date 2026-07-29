/**
 * Tests for `lib/payments/doku/signature.ts`.
 *
 * Covers: DOKU's published worked signature-assembly vector (string assembly
 * only — see note below), digest of known bodies (cross-checked against an
 * independent `openssl` computation, not just node `crypto`), GET signatures
 * omitting the `Digest:` line, and a self-computed HMAC vector.
 *
 * IMPORTANT — what we could NOT verify: DOKU's docs publish
 *   Client-Id:MCH-0001-10791114622547
 *   Request-Id:cc682442-6c22-493e-8121-b9ef6b3fa728
 *   Request-Timestamp:2020-08-11T08:45:42Z
 *   Request-Target:/doku-virtual-account/v2/payment-code
 *   Digest:5WIYK2TJg6iiZ0d5v4IXSR0EkYEkYOezJIma3Ufli5s=
 * → Signature: HMACSHA256=OvIRJs/jH8BIcGsktr4d8nnYtxY6E0Uzdm9d1GVgv5s=
 * but do not publish the secret key that produces that signature. We do NOT
 * fabricate a key and claim it reproduces DOKU's output — we could not
 * reproduce `OvIRJs/jH8BIcGsktr4d8nnYtxY6E0Uzdm9d1GVgv5s=` with any key,
 * because the key is genuinely unknown. Instead:
 *   1. We assert `buildSignedString(...)` produces byte-for-byte the 5 lines
 *      above (this is the part of the algorithm the worked example actually
 *      lets us pin).
 *   2. We separately assert the HMAC step against a vector we computed
 *      ourselves with a fixed, known test key (`unit-test-secret-key`),
 *      cross-checked with an independent `openssl dgst -sha256 -hmac`
 *      invocation (see comment inline) — this proves `buildSignature`
 *      correctly performs base64(hmacSha256(signedString, secretKey))
 *      without depending on DOKU's undisclosed key.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { buildDigest, buildSignature, buildSignedString } from "../signature";

/**
 * Run `openssl` over the exact bytes of `input` via a temp file, never via a
 * shell argv string. `bash -c "printf '%s' \"...\\n...\""` does NOT expand
 * `\n` inside a `%s` argument (bash's `printf` only expands escapes in the
 * *format* string), so a signed string built by joining lines with a real
 * newline character would silently get corrupted into literal backslash-n
 * text if piped through argv. Writing to a file sidesteps all shell-quoting
 * questions entirely — the bytes on disk are exactly `input`.
 */
function opensslDigestBase64(input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "doku-sig-test-"));
  const file = join(dir, "input.bin");
  try {
    writeFileSync(file, input, "utf8");
    return execFileSync("bash", [
      "-c",
      `openssl dgst -sha256 -binary < ${JSON.stringify(file)} | openssl base64`,
    ])
      .toString()
      .trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function opensslHmacBase64(input: string, key: string): string {
  const dir = mkdtempSync(join(tmpdir(), "doku-sig-test-"));
  const file = join(dir, "input.bin");
  try {
    writeFileSync(file, input, "utf8");
    return execFileSync("bash", [
      "-c",
      `openssl dgst -sha256 -hmac ${JSON.stringify(key)} -binary < ${JSON.stringify(file)} | openssl base64`,
    ])
      .toString()
      .trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DOCS_CLIENT_ID = "MCH-0001-10791114622547";
const DOCS_REQUEST_ID = "cc682442-6c22-493e-8121-b9ef6b3fa728";
const DOCS_TIMESTAMP = "2020-08-11T08:45:42Z";
const DOCS_TARGET = "/doku-virtual-account/v2/payment-code";
const DOCS_DIGEST = "5WIYK2TJg6iiZ0d5v4IXSR0EkYEkYOezJIma3Ufli5s=";

describe("buildSignedString", () => {
  it("matches DOKU's worked example assembly byte-for-byte", () => {
    const signedString = buildSignedString({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      digest: DOCS_DIGEST,
    });

    expect(signedString).toBe(
      [
        "Client-Id:MCH-0001-10791114622547",
        "Request-Id:cc682442-6c22-493e-8121-b9ef6b3fa728",
        "Request-Timestamp:2020-08-11T08:45:42Z",
        "Request-Target:/doku-virtual-account/v2/payment-code",
        "Digest:5WIYK2TJg6iiZ0d5v4IXSR0EkYEkYOezJIma3Ufli5s=",
      ].join("\n"),
    );
    // No trailing newline.
    expect(signedString.endsWith("\n")).toBe(false);
  });

  it("omits the Digest: line entirely for a GET (digest undefined)", () => {
    const signedString = buildSignedString({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      // digest omitted
    });

    expect(signedString).toBe(
      [
        "Client-Id:MCH-0001-10791114622547",
        "Request-Id:cc682442-6c22-493e-8121-b9ef6b3fa728",
        "Request-Timestamp:2020-08-11T08:45:42Z",
        "Request-Target:/doku-virtual-account/v2/payment-code",
      ].join("\n"),
    );
    expect(signedString).not.toContain("Digest:");
  });
});

describe("buildDigest", () => {
  it("digest of an empty body — cross-checked with openssl", () => {
    // Re-run an openssl pipeline (via a temp file, not argv) so CI itself
    // re-verifies the fixture wasn't hand-typed wrong, rather than trusting
    // a hardcoded string alone.
    const expected = opensslDigestBase64("");
    expect(expected).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
    expect(buildDigest("")).toBe(expected);
  });

  it('digest of \'{"a":1}\' — cross-checked with openssl', () => {
    const expected = opensslDigestBase64('{"a":1}');
    expect(expected).toBe("AVq9f1zFei3ZS3WQ8ErYCEJzkF7jPsXOvq5iJ2qX+GI=");
    expect(buildDigest('{"a":1}')).toBe(expected);
  });
});

describe("buildSignature", () => {
  const TEST_SECRET_KEY = "unit-test-secret-key";

  it("matches a self-computed HMAC vector (fixed known key, POST w/ digest)", () => {
    // Cross-checked with a real openssl invocation over a temp file (not an
    // argv string — see `opensslHmacBase64`'s comment for why that matters
    // when the input contains literal newline bytes).
    const signedString = [
      "Client-Id:MCH-0001-10791114622547",
      "Request-Id:cc682442-6c22-493e-8121-b9ef6b3fa728",
      "Request-Timestamp:2020-08-11T08:45:42Z",
      "Request-Target:/doku-virtual-account/v2/payment-code",
      "Digest:5WIYK2TJg6iiZ0d5v4IXSR0EkYEkYOezJIma3Ufli5s=",
    ].join("\n");
    const expectedHmac = opensslHmacBase64(signedString, TEST_SECRET_KEY);
    expect(expectedHmac).toBe("tIU65SJi4/ZPvvvDLNEvv71dlebEXscSGe/H2rSmTZI=");

    const signature = buildSignature({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      digest: DOCS_DIGEST,
      secretKey: TEST_SECRET_KEY,
    });

    expect(signature).toBe(`HMACSHA256=${expectedHmac}`);
  });

  it("cannot reproduce DOKU's published Signature (secret key is undisclosed) — documented, not asserted as a pass", () => {
    // This test exists to make the limitation explicit and machine-checkable:
    // DOKU's docs do not publish the secret key, so no key value should ever
    // make buildSignature(...) equal the published signature below UNLESS
    // someone hardcodes it — which would be fabrication. We assert the
    // opposite: our test key's output is NOT the published value that would
    // arise from an unknown key.
    const signature = buildSignature({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      digest: DOCS_DIGEST,
      secretKey: TEST_SECRET_KEY,
    });
    expect(signature).not.toBe("HMACSHA256=OvIRJs/jH8BIcGsktr4d8nnYtxY6E0Uzdm9d1GVgv5s=");
  });

  it("omits Digest: from the signed string for a GET (no digest field)", () => {
    const signatureWithDigest = buildSignature({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      digest: DOCS_DIGEST,
      secretKey: TEST_SECRET_KEY,
    });
    const signatureWithoutDigest = buildSignature({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      secretKey: TEST_SECRET_KEY,
    });
    // Different signed strings (one has a Digest: line, one doesn't) must
    // produce different signatures.
    expect(signatureWithDigest).not.toBe(signatureWithoutDigest);
  });

  it("returns the HMACSHA256= prefix", () => {
    const signature = buildSignature({
      clientId: DOCS_CLIENT_ID,
      requestId: DOCS_REQUEST_ID,
      timestamp: DOCS_TIMESTAMP,
      target: DOCS_TARGET,
      secretKey: TEST_SECRET_KEY,
    });
    expect(signature.startsWith("HMACSHA256=")).toBe(true);
  });
});
