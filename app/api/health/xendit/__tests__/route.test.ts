/**
 * Tests for `GET /api/health/xendit` — deploy-time Xendit credential probe.
 *
 * Cycle 2026-04-28 T4. Coverage:
 * (a) success → 200 + tier:"live"  (mock key prefix xnd_production_)
 * (b) success → 200 + tier:"sandbox" (mock key prefix xnd_development_)
 * (c) 401 from Xendit → 503 + code:"401"
 * (d) network throw → 503 + code:"network"
 * (e) abort timeout → 503 + code:"network"
 * (f) tier:"unknown" when key missing → short-circuits, no network ping
 * (g) response body never echoes the secret string
 * (h) rate-limit hit returns 429 from the route (NOT from cache)
 * (i) cache hit short-circuits the second call within 30s (same IP)
 *
 * The route uses `lib/rate-limit.ts` which keeps its store in module scope.
 * To avoid cross-test contamination of the limiter, each test uses a unique
 * IP via the `X-Forwarded-For` header (the route reads this through
 * `getClientIp`). The cache is reset between tests via `__resetHealthCacheForTest`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { XenditApiError } from "@/lib/xendit/client";

vi.mock("@/lib/xendit/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/xendit/client")>(
    "@/lib/xendit/client",
  );
  return {
    ...actual,
    pingXenditBalance: vi.fn(),
  };
});

import { pingXenditBalance } from "@/lib/xendit/client";
import { GET, __resetHealthCacheForTest } from "../route";

const pingMock = pingXenditBalance as unknown as ReturnType<typeof vi.fn>;

let testIpCounter = 0;
function makeRequest(): Request {
  // Unique IP per call to side-step the shared rate-limit store between tests.
  testIpCounter += 1;
  return new Request("http://localhost/api/health/xendit", {
    method: "GET",
    headers: {
      "X-Forwarded-For": `203.0.113.${testIpCounter}`,
    },
  });
}

const ORIGINAL_KEY = process.env.XENDIT_SECRET_KEY;

beforeEach(() => {
  __resetHealthCacheForTest();
  pingMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.XENDIT_SECRET_KEY;
  } else {
    process.env.XENDIT_SECRET_KEY = ORIGINAL_KEY;
  }
});

// --------------------------------------------------------------------------
// Success paths
// --------------------------------------------------------------------------

describe("GET /api/health/xendit — tier detection from key prefix", () => {
  it("(a) live tier on success when key starts with xnd_production_", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_production_abc123";
    pingMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      source: "xendit",
      tier: "live",
    });
    expect(typeof body.checkedAt).toBe("string");
    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it("(b) sandbox tier on success when key starts with xnd_development_", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_xyz789";
    pingMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      source: "xendit",
      tier: "sandbox",
    });
    expect(pingMock).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------
// Error paths
// --------------------------------------------------------------------------

describe("GET /api/health/xendit — error responses", () => {
  it("(c) 401 from Xendit → 503 with code:\"401\" and the typed error message", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_bad";
    pingMock.mockRejectedValue(
      new XenditApiError({
        status: 401,
        code: "401",
        retriable: false,
        message: "Xendit returned 401: invalid api key",
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      source: "xendit",
      tier: "sandbox",
      code: "401",
      error: "Xendit returned 401: invalid api key",
    });
  });

  it("(d) network throw → 503 with code:\"network\"", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_ok";
    pingMock.mockRejectedValue(
      new XenditApiError({
        status: null,
        code: "network",
        retriable: true,
        message: "fetch failed",
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("network");
    expect(body.tier).toBe("sandbox");
  });

  it("(e) abort/timeout surfaces as code:\"network\" (matches client.ts behavior)", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_ok";
    // pingXenditBalance wraps abort errors into XenditApiError code:"network"
    pingMock.mockRejectedValue(
      new XenditApiError({
        status: null,
        code: "network",
        retriable: true,
        message: "The operation was aborted",
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("network");
  });

  it("(f) tier:\"unknown\" short-circuits when key missing — no Xendit ping fires", async () => {
    delete process.env.XENDIT_SECRET_KEY;

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      source: "xendit",
      tier: "unknown",
      code: "unknown",
    });
    // Critical: no network ping when tier is unknown.
    expect(pingMock).not.toHaveBeenCalled();
  });

  it("(f2) tier:\"unknown\" when key has unrecognized prefix", async () => {
    process.env.XENDIT_SECRET_KEY = "weirdold_key_format";

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.tier).toBe("unknown");
    expect(pingMock).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// Security: secret never echoed in response body
// --------------------------------------------------------------------------

describe("GET /api/health/xendit — secret never echoed in response", () => {
  it("(g) response body never contains the secret string on success", async () => {
    const secret = "xnd_development_SUPER_SECRET_VALUE_12345";
    process.env.XENDIT_SECRET_KEY = secret;
    pingMock.mockResolvedValue(undefined);

    const res = await GET(makeRequest());
    const bodyText = await res.text();

    expect(bodyText).not.toContain("SUPER_SECRET_VALUE_12345");
    expect(bodyText).not.toContain(secret);
    // Tier label is fine — that's the whole derived value the route exposes.
    expect(bodyText).toContain("sandbox");
  });

  it("(g2) response body never contains the secret string on error", async () => {
    const secret = "xnd_development_ANOTHER_SECRET_77777";
    process.env.XENDIT_SECRET_KEY = secret;
    pingMock.mockRejectedValue(
      new XenditApiError({
        status: 401,
        code: "401",
        retriable: false,
        message: "Xendit returned 401",
      }),
    );

    const res = await GET(makeRequest());
    const bodyText = await res.text();

    expect(bodyText).not.toContain("ANOTHER_SECRET_77777");
    expect(bodyText).not.toContain(secret);
  });
});

// --------------------------------------------------------------------------
// Rate-limit + cache ordering (cycle 2026-04-28 T4 ordering pin)
// --------------------------------------------------------------------------

describe("GET /api/health/xendit — rate limit", () => {
  it("(h) rate-limit hit returns 429 from the route (not via cache)", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_ok";
    pingMock.mockResolvedValue(undefined);

    // Pin a single IP for this test so all 31 calls share the same limiter
    // bucket. 30 calls succeed; the 31st must return 429.
    const fixedIp = `203.0.113.250`;
    function pinnedReq(): Request {
      return new Request("http://localhost/api/health/xendit", {
        method: "GET",
        headers: { "X-Forwarded-For": fixedIp },
      });
    }

    let lastStatus = 0;
    for (let i = 0; i < 30; i++) {
      const res = await GET(pinnedReq());
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(200);

    const overflow = await GET(pinnedReq());
    expect(overflow.status).toBe(429);
    const overflowBody = await overflow.json();
    expect(overflowBody.error).toBe("Too many requests");
  });
});

describe("GET /api/health/xendit — cache", () => {
  it("(i) cache hit short-circuits — second call within 30s does NOT re-ping Xendit", async () => {
    process.env.XENDIT_SECRET_KEY = "xnd_development_ok";
    pingMock.mockResolvedValue(undefined);

    const res1 = await GET(makeRequest());
    expect(res1.status).toBe(200);
    expect(pingMock).toHaveBeenCalledTimes(1);

    // Second call from a DIFFERENT ip — proves the cache is not per-ip and
    // disambiguates from the rate-limit short-circuit (which would also
    // skip the ping but would return 429 instead).
    const res2 = await GET(makeRequest());
    const body2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(body2.ok).toBe(true);
    // Critical: still 1 ping, not 2 — cache absorbed the second hit.
    expect(pingMock).toHaveBeenCalledTimes(1);
  });
});
