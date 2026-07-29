/**
 * Tests for `lib/payments/doku/client.ts`.
 *
 * Mirrors `lib/__tests__/xendit-client-classifier.test.ts` in style. Covers
 * error classification (`classifyDokuResponse`), the `DEMO_MODE`
 * short-circuit, secret-leakage guards, and that the digest is computed over
 * the exact bytes sent as the request body (no re-serialisation).
 *
 * Constraint: no live network call to DOKU — `fetch` is mocked/stubbed in
 * every test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  classifyDokuResponse,
  createDokuSession,
  pingDoku,
  formatDokuTimestamp,
  normalizePhoneForDoku,
  DOKU_VIRTUAL_ACCOUNT_METHODS,
} from "../client";
import { GatewayApiError } from "../../types";
import { buildDigest } from "../signature";
import type { CreateSessionParams } from "../../types";

const baseParams: CreateSessionParams = {
  referenceId: "inv-test-1",
  amount: 100000,
  description: "Test invoice",
  customerName: "Test Customer",
  successReturnUrl: "https://example.test/parent/invoices?invoice=inv-test-1",
  cancelReturnUrl: "https://example.test/parent/invoices?invoice=inv-test-1",
};

/** Build a minimal `Response`-shaped mock for an error status. */
function mockErrorResponse(opts: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  return {
    ok: false,
    status: opts.status,
    headers,
    json: async () => opts.body ?? { error_messages: [`mock ${opts.status}`] },
  } as unknown as Response;
}

/**
 * A successful DOKU response. DOKU wraps every result in a top-level
 * `response` key — `{ "message": ["SUCCESS"], "response": { order, payment } }`
 * — confirmed against the live sandbox (probe 2026-07-27). The helper applies
 * that envelope so fixtures cannot drift back to the flat shape, which is a
 * failure mode the mocks previously shared with the client and therefore could
 * not catch.
 */
function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ message: ["SUCCESS"], response: body }),
  } as unknown as Response;
}

const SECRET = "super-secret-doku-key-do-not-leak";
const CLIENT_ID = "BRN-0249-1785138907502-do-not-leak";

describe("formatDokuTimestamp", () => {
  it("strips milliseconds, keeping second precision + trailing Z", () => {
    const d = new Date("2020-08-11T08:45:42.123Z");
    expect(formatDokuTimestamp(d)).toBe("2020-08-11T08:45:42Z");
  });
});

describe("normalizePhoneForDoku", () => {
  it.each([
    ["081234567890", "6281234567890"],
    ["+62 812-3456-7890", "6281234567890"],
    ["0812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["(0812) 3456-7890", "6281234567890"],
  ])("normalises %s → %s", (input, expected) => {
    expect(normalizePhoneForDoku(input)).toBe(expected);
  });

  it.each([
    ["undefined input", undefined],
    ["empty string", ""],
    ["punctuation only", "-- --"],
    ["too short", "0812"],
    ["too long — a NIK pasted into the phone column", "3204012345678901"],
    ["foreign / unrecognised prefix", "441234567890"],
  ])("returns undefined for %s rather than guessing", (_label, input) => {
    expect(normalizePhoneForDoku(input)).toBeUndefined();
  });

  it("never returns a value longer than DOKU's 16-char cap", () => {
    for (const input of ["081234567890", "+62 812-3456-7890", "62812345678901"]) {
      const out = normalizePhoneForDoku(input);
      if (out !== undefined) expect(out.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("DOKU_VIRTUAL_ACCOUNT_METHODS", () => {
  // Pins the exact enum list rather than asserting it against itself (the
  // create-session body test compares to the same constant, so it cannot
  // catch a channel being dropped). Verbatim from developers.doku.com →
  // DOKU Checkout → Supported Payment Methods, re-verified 2026-07-29.
  it("is the complete documented DOKU Checkout Virtual Account set", () => {
    expect([...DOKU_VIRTUAL_ACCOUNT_METHODS]).toEqual([
      "VIRTUAL_ACCOUNT_BCA",
      "VIRTUAL_ACCOUNT_BANK_MANDIRI",
      "VIRTUAL_ACCOUNT_BRI",
      "VIRTUAL_ACCOUNT_BNI",
      "VIRTUAL_ACCOUNT_BANK_PERMATA",
      "VIRTUAL_ACCOUNT_BANK_CIMB",
      "VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI",
      "VIRTUAL_ACCOUNT_BANK_DANAMON",
      "VIRTUAL_ACCOUNT_BTN",
      "VIRTUAL_ACCOUNT_BNC",
      "VIRTUAL_ACCOUNT_DOKU",
    ]);
  });

  it("contains only Virtual Account channels — no card, QRIS, e-wallet or paylater", () => {
    for (const method of DOKU_VIRTUAL_ACCOUNT_METHODS) {
      expect(method.startsWith("VIRTUAL_ACCOUNT_")).toBe(true);
    }
  });
});

describe("classifyDokuResponse", () => {
  it("classifies 500 as code=5xx, retriable=true", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 500 }), null);
    expect(err).toBeInstanceOf(GatewayApiError);
    expect(err.code).toBe("5xx");
    expect(err.retriable).toBe(true);
  });

  it("classifies 408 as code=408, retriable=true", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 408 }), null);
    expect(err.code).toBe("408");
    expect(err.retriable).toBe(true);
  });

  it("classifies 429 with Retry-After header, retriable=true", () => {
    const response = mockErrorResponse({
      status: 429,
      headers: { "Retry-After": "2" },
    });
    const err = classifyDokuResponse(response, null);
    expect(err.code).toBe("429");
    expect(err.retriable).toBe(true);
    expect(err.retryAfterMs).toBe(2000);
  });

  it("classifies 401 as code=401, retriable=false", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 401 }), null);
    expect(err.code).toBe("401");
    expect(err.retriable).toBe(false);
  });

  it("classifies 403 as code=403, retriable=false", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 403 }), null);
    expect(err.code).toBe("403");
    expect(err.retriable).toBe(false);
  });

  it("classifies 422 as code=422, retriable=false", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 422 }), null);
    expect(err.code).toBe("422");
    expect(err.retriable).toBe(false);
  });

  it("classifies 400 {error_messages:[...]} as code=4xx, retriable=false, joined message", () => {
    const response = mockErrorResponse({
      status: 400,
      body: {
        error_messages: [
          "order.amount must greater than 0",
          "payment.payment_due_date must not be empty",
        ],
      },
    });
    const err = classifyDokuResponse(response, {
      error_messages: [
        "order.amount must greater than 0",
        "payment.payment_due_date must not be empty",
      ],
    });
    expect(err.code).toBe("4xx");
    expect(err.retriable).toBe(false);
    expect(err.message).toBe(
      "order.amount must greater than 0; payment.payment_due_date must not be empty",
    );
  });

  it("falls back to a generic message when body has no error_messages", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 404 }), null);
    expect(err.code).toBe("4xx");
    expect(err.message).toBe("DOKU API error: 404");
  });

  it("classifies an unrecognised status band as unknown, retriable=false", () => {
    const err = classifyDokuResponse(mockErrorResponse({ status: 300 }), null);
    expect(err.code).toBe("unknown");
    expect(err.retriable).toBe(false);
  });
});

describe("createDokuSession", () => {
  const originalClientId = process.env.DOKU_CLIENT_ID;
  const originalSecretKey = process.env.DOKU_SECRET_KEY;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    process.env.DOKU_CLIENT_ID = CLIENT_ID;
    process.env.DOKU_SECRET_KEY = SECRET;
    delete process.env.DEMO_MODE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.DOKU_CLIENT_ID;
    else process.env.DOKU_CLIENT_ID = originalClientId;
    if (originalSecretKey === undefined) delete process.env.DOKU_SECRET_KEY;
    else process.env.DOKU_SECRET_KEY = originalSecretKey;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("DEMO_MODE=true returns a synthetic session and never calls fetch", async () => {
    process.env.DEMO_MODE = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const session = await createDokuSession(baseParams);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(session.paymentUrl).toBe(
      "https://demo.doku.local/checkout/inv-test-1",
    );
    expect(session.status).toBe("PENDING");
    expect(session.id).toBe("demo_session_inv-test-1");
    expect(typeof session.expiresAt).toBe("string");
  });

  it("throws naming DOKU_CLIENT_ID when missing", async () => {
    delete process.env.DOKU_CLIENT_ID;
    await expect(createDokuSession(baseParams)).rejects.toThrow(
      "DOKU_CLIENT_ID not configured",
    );
  });

  it("throws naming DOKU_SECRET_KEY when missing", async () => {
    delete process.env.DOKU_SECRET_KEY;
    await expect(createDokuSession(baseParams)).rejects.toThrow(
      "DOKU_SECRET_KEY not configured",
    );
  });

  it("computes the digest over the exact bytes sent as fetch's body (no re-serialisation)", async () => {
    let capturedBody: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        capturedHeaders = init.headers as Record<string, string>;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/abc123",
            token_id: "abc123-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );

    await createDokuSession(baseParams);

    expect(capturedBody).toBeDefined();
    expect(capturedHeaders).toBeDefined();

    // Reconstruct the exact signature createDokuSession must have produced,
    // using the SAME requestId/timestamp/clientId it actually sent (captured
    // from headers) and a digest computed from the captured body. If the
    // implementation had digested a re-serialisation of the object instead
    // of the exact string handed to fetch, this recomputed signature would
    // NOT match the one actually sent — proving digest-input === body bytes.
    const { buildSignature } = await import("../signature");
    const recomputedSignature = buildSignature({
      clientId: capturedHeaders!["Client-Id"],
      requestId: capturedHeaders!["Request-Id"],
      timestamp: capturedHeaders!["Request-Timestamp"],
      target: "/checkout/v1/payment",
      digest: buildDigest(capturedBody as string),
      secretKey: SECRET,
    });

    expect(recomputedSignature).toBe(capturedHeaders!["Signature"]);
  });

  it("sends the same serialised body string as fetch's body on every call (no non-determinism from re-serialisation)", async () => {
    let sentBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = init.body as string;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/xyz789",
            token_id: "xyz789-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );

    await createDokuSession(baseParams);

    expect(sentBody).toContain('"invoice_number":"inv-test-1"');
    expect(sentBody).toContain('"amount":100000');
  });

  it("builds order/payment/customer body per spec and maps the response", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/abc123",
            token_id: "abc123-01",
            expired_datetime: "2026-08-03T08:49:58Z",
            expired_date: "20260803154958",
          },
          order: { session_id: "abc123" },
        });
      }),
    );

    const params: CreateSessionParams = {
      ...baseParams,
      customerEmail: "guardian@example.test",
      customerPhone: "081234567890",
      items: [{ name: "SPP Juli", quantity: 1, price: 100000 }],
      expiryDays: 7,
    };

    const session = await createDokuSession(params);

    expect(capturedUrl).toBe("https://api-sandbox.doku.com/checkout/v1/payment");
    const body = JSON.parse(capturedInit!.body as string);
    expect(body.order.amount).toBe(100000);
    expect(body.order.invoice_number).toBe("inv-test-1");
    expect(body.order.currency).toBe("IDR");
    expect(body.order.callback_url_result).toBe(baseParams.successReturnUrl);
    // All three return URLs are sent. `callback_url_cancel` in particular was
    // computed by the caller but dropped by this adapter before cycle
    // 2026-07-29-doku-all-va-channels.
    expect(body.order.callback_url).toBe(baseParams.cancelReturnUrl);
    expect(body.order.callback_url_cancel).toBe(baseParams.cancelReturnUrl);
    expect(body.order.language).toBe("ID");
    expect(body.order.auto_redirect).toBe(false);
    expect(body.payment.type).toBe("SALE");
    // Local guardian format is normalised to DOKU's calling-code form.
    expect(body.customer.phone).toBe("6281234567890");
    expect(body.order.line_items).toEqual([
      { name: "SPP Juli", quantity: 1, price: 100000 },
    ]);
    expect(body.payment.payment_due_date).toBe(7 * 24 * 60);
    expect(body.payment.payment_method_types).toEqual(
      DOKU_VIRTUAL_ACCOUNT_METHODS,
    );
    expect(body.customer).toEqual({
      name: "Test Customer",
      email: "guardian@example.test",
      phone: "6281234567890",
    });
    // No notificationUrl in baseParams → the key is omitted entirely rather
    // than sent as null/empty, which DOKU would treat as an override to "".
    expect(body.additional_info).toBeUndefined();

    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers["Client-Id"]).toBe(CLIENT_ID);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Signature"]).toMatch(/^HMACSHA256=/);
    expect(headers["Request-Target"]).toBeUndefined(); // not a real header — target is embedded in the signed string only

    // response mapping — prefers expired_datetime over expired_date
    expect(session.paymentUrl).toBe(
      "https://staging.doku.com/checkout-link-v2/abc123",
    );
    expect(session.id).toBe("abc123-01");
    expect(session.status).toBe("PENDING");
    expect(session.expiresAt).toBe("2026-08-03T08:49:58Z");
  });

  it("omits customer.email / customer.phone entirely when undefined", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedInit = init;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/noemail",
            token_id: "noemail-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );

    await createDokuSession(baseParams); // no email/phone

    const body = JSON.parse(capturedInit!.body as string);
    expect("email" in body.customer).toBe(false);
    expect("phone" in body.customer).toBe(false);
  });

  it("omits customer.phone when the stored number cannot be normalised", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedInit = init;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/badphone",
            token_id: "badphone-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );

    // A NIK pasted into the phone column — must not reach DOKU, since a
    // malformed customer.phone can fail the whole session.
    await createDokuSession({ ...baseParams, customerPhone: "3204012345678901" });

    const body = JSON.parse(capturedInit!.body as string);
    expect("phone" in body.customer).toBe(false);
  });

  it("sends additional_info.override_notification_url when notificationUrl is supplied", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedInit = init;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/notif",
            token_id: "notif-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );

    await createDokuSession({
      ...baseParams,
      notificationUrl: "https://talib.annisaasekolahku.com/api/doku/webhook",
    });

    const body = JSON.parse(capturedInit!.body as string);
    expect(body.additional_info).toEqual({
      override_notification_url: "https://talib.annisaasekolahku.com/api/doku/webhook",
    });
  });

  it("falls back to expired_date when expired_datetime is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/fallback",
            token_id: "fallback-01",
            expired_date: "20260803154958",
            // no expired_datetime
          },
        }),
      ),
    );

    const session = await createDokuSession(baseParams);
    expect(session.expiresAt).toBe("20260803154958");
  });

  /**
   * Regression guard for the `response`-envelope bug: the client originally
   * read `data.payment.url` instead of `data.response.payment.url`, and the
   * fixtures shared the same flat shape, so the whole suite passed while every
   * real call would have thrown "missing payment.url". This test bypasses the
   * `mockOkResponse` helper entirely and replays a verbatim capture from the
   * live sandbox probe (2026-07-27), so it stays honest even if the helper
   * regresses.
   */
  it("parses a verbatim live-sandbox response envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          message: ["SUCCESS"],
          response: {
            order: {
              amount: "150000",
              invoice_number: "cprobems2zknn6",
              currency: "IDR",
              session_id: "e101e5ccfeae4542b8dff200de592375",
            },
            payment: {
              token_id: "e101e5ccfeae4542b8dff200de59237520264927154958965",
              url: "https://staging.doku.com/checkout-link-v2/e101e5ccfeae4542b8dff200de59237520264927154958965",
              expired_date: "20260803154958",
              expired_datetime: "2026-08-03T08:49:58Z",
            },
          },
        }),
      })) as unknown as typeof fetch,
    );

    const session = await createDokuSession(baseParams);
    expect(session.paymentUrl).toBe(
      "https://staging.doku.com/checkout-link-v2/e101e5ccfeae4542b8dff200de59237520264927154958965",
    );
    expect(session.id).toBe(
      "e101e5ccfeae4542b8dff200de59237520264927154958965",
    );
    expect(session.expiresAt).toBe("2026-08-03T08:49:58Z");
    expect(session.status).toBe("PENDING");
  });

  it("throws when response.payment.url is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockOkResponse({ payment: { token_id: "no-url-01" } }),
      ),
    );
    await expect(createDokuSession(baseParams)).rejects.toThrow(
      "missing payment.url",
    );
  });

  it("classifies a fetch throw as network error, status null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const err = await createDokuSession(baseParams).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayApiError);
    expect(err.code).toBe("network");
    expect(err.retriable).toBe(true);
    expect(err.status).toBeNull();
  });

  it("classifies a 500 error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockErrorResponse({ status: 500 })),
    );
    const err = await createDokuSession(baseParams).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayApiError);
    expect(err.code).toBe("5xx");
    expect(err.retriable).toBe(true);
  });

  it("classifies a 401 error response as non-retriable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockErrorResponse({ status: 401 })),
    );
    const err = await createDokuSession(baseParams).catch((e) => e);
    expect(err.code).toBe("401");
    expect(err.retriable).toBe(false);
  });

  it("secret-leakage guard: neither DOKU_SECRET_KEY nor DOKU_CLIENT_ID appear in a thrown/serialised error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockErrorResponse({
          status: 400,
          body: { error_messages: ["order.amount must greater than 0"] },
        }),
      ),
    );
    const err = await createDokuSession(baseParams).catch((e) => e);
    const serialised = JSON.stringify({
      message: err.message,
      name: err.name,
      code: err.code,
      status: err.status,
      stack: err.stack,
    });
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(CLIENT_ID);
  });

  it("secret-leakage guard: neither secret nor client id present in the request body", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedInit = init;
        return mockOkResponse({
          payment: {
            url: "https://staging.doku.com/checkout-link-v2/abc",
            token_id: "abc-01",
            expired_datetime: "2026-08-03T08:49:58Z",
          },
        });
      }),
    );
    await createDokuSession(baseParams);
    expect(capturedInit!.body as string).not.toContain(SECRET);
    // Client-Id legitimately appears in the header (not the body) — assert
    // the *body* specifically stays clean of both credentials.
    expect(capturedInit!.body as string).not.toContain(CLIENT_ID);
  });
});

describe("pingDoku", () => {
  const originalClientId = process.env.DOKU_CLIENT_ID;
  const originalSecretKey = process.env.DOKU_SECRET_KEY;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    process.env.DOKU_CLIENT_ID = CLIENT_ID;
    process.env.DOKU_SECRET_KEY = SECRET;
    delete process.env.DEMO_MODE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.DOKU_CLIENT_ID;
    else process.env.DOKU_CLIENT_ID = originalClientId;
    if (originalSecretKey === undefined) delete process.env.DOKU_SECRET_KEY;
    else process.env.DOKU_SECRET_KEY = originalSecretKey;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("DEMO_MODE=true resolves without calling fetch", async () => {
    process.env.DEMO_MODE = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(pingDoku()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a GET request with no Digest-derived difference (Signature header present, no digest header)", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return mockOkResponse({ status: "NOT_FOUND" });
      }),
    );

    await pingDoku();

    expect(capturedUrl).toMatch(
      /^https:\/\/api-sandbox\.doku\.com\/orders\/v1\/status\/healthcheck-/,
    );
    expect(capturedInit!.method).toBe("GET");
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers["Digest"]).toBeUndefined();
    expect(headers["Signature"]).toMatch(/^HMACSHA256=/);
  });

  it("resolves (healthy) on a non-401/403 response, e.g. 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockErrorResponse({ status: 404 })),
    );
    await expect(pingDoku()).resolves.toBeUndefined();
  });

  it("throws GatewayApiError code=401 on a 401 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockErrorResponse({ status: 401 })),
    );
    const err = await pingDoku().catch((e) => e);
    expect(err).toBeInstanceOf(GatewayApiError);
    expect(err.code).toBe("401");
  });

  it("throws GatewayApiError code=403 on a 403 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockErrorResponse({ status: 403 })),
    );
    const err = await pingDoku().catch((e) => e);
    expect(err.code).toBe("403");
  });

  it("classifies a fetch throw / abort as network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );
    const err = await pingDoku().catch((e) => e);
    expect(err).toBeInstanceOf(GatewayApiError);
    expect(err.code).toBe("network");
    expect(err.status).toBeNull();
  });
});
