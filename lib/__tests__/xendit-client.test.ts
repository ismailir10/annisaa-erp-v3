import { describe, it, expect, afterEach, vi } from "vitest";
import { pickSessionId, stripQuery, createXenditSession, pingXenditBalance } from "../xendit/client";

describe("pickSessionId", () => {
  it("picks data.id when present", () => {
    expect(pickSessionId({ id: "ses-1", session_id: "ses-2" })).toBe("ses-1");
  });

  it("falls back to data.session_id when data.id missing", () => {
    expect(pickSessionId({ session_id: "ses-2" })).toBe("ses-2");
  });

  it("falls back to data.payment_session_id", () => {
    expect(pickSessionId({ payment_session_id: "ses-3" })).toBe("ses-3");
  });

  it("falls back to nested data.session.id", () => {
    expect(pickSessionId({ session: { id: "ses-4" } })).toBe("ses-4");
  });

  it("returns null when no id field is present", () => {
    expect(pickSessionId({ payment_link_url: "https://x" })).toBeNull();
  });

  it("returns null on empty string id", () => {
    expect(pickSessionId({ id: "" })).toBeNull();
  });

  it("returns null on non-string id (defense)", () => {
    expect(pickSessionId({ id: 123 })).toBeNull();
    expect(pickSessionId({ id: null })).toBeNull();
    expect(pickSessionId({ id: undefined })).toBeNull();
  });

  it("returns null on null/undefined input", () => {
    expect(pickSessionId(null)).toBeNull();
    expect(pickSessionId(undefined)).toBeNull();
  });

  it("returns null on non-object input", () => {
    expect(pickSessionId("not-an-object")).toBeNull();
    expect(pickSessionId(42)).toBeNull();
  });
});

describe("stripQuery", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(stripQuery(null)).toBeNull();
    expect(stripQuery(undefined)).toBeNull();
    expect(stripQuery("")).toBeNull();
  });

  it("returns origin + pathname unchanged when no query string present", () => {
    expect(stripQuery("https://annisaa-erp-v3.vercel.app/payment/success")).toBe(
      "https://annisaa-erp-v3.vercel.app/payment/success",
    );
  });

  it("strips query string from URL with ?invoice= param", () => {
    expect(
      stripQuery("https://annisaa-erp-v3.vercel.app/payment/success?invoice=inv-123"),
    ).toBe("https://annisaa-erp-v3.vercel.app/payment/success");
  });

  it("returns null for malformed URL string", () => {
    expect(stripQuery("not a url")).toBeNull();
  });
});

describe("createXenditSession — DEMO_MODE", () => {
  const originalDemoMode = process.env.DEMO_MODE;
  const originalKey = process.env.XENDIT_SECRET_KEY;
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  afterEach(() => {
    process.env.DEMO_MODE = originalDemoMode;
    process.env.XENDIT_SECRET_KEY = originalKey;
    fetchSpy.mockClear();
  });

  it("returns a synthetic session without hitting fetch when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.XENDIT_SECRET_KEY;

    const result = await createXenditSession({
      referenceId: "inv-123",
      amount: 100_000,
      description: "Test invoice",
      customerName: "Test Parent",
      successReturnUrl: "http://localhost:3000/parent/invoices?invoice=inv-123",
      cancelReturnUrl: "http://localhost:3000/parent/invoices?invoice=inv-123",
    });

    expect(result.id).toBe("demo_session_inv-123");
    expect(result.payment_link_url).toBe("https://demo.xendit.local/checkout/inv-123");
    expect(result.status).toBe("ACTIVE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit when DEMO_MODE is unset (real path triggers auth lookup)", async () => {
    delete process.env.DEMO_MODE;
    delete process.env.XENDIT_SECRET_KEY;

    await expect(
      createXenditSession({
        referenceId: "inv-456",
        amount: 50_000,
        description: "x",
        customerName: "x",
        successReturnUrl: "https://example.com/s",
        cancelReturnUrl: "https://example.com/c",
      }),
    ).rejects.toThrow("XENDIT_SECRET_KEY not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pingXenditBalance — DEMO_MODE", () => {
  const originalDemoMode = process.env.DEMO_MODE;
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  afterEach(() => {
    process.env.DEMO_MODE = originalDemoMode;
    fetchSpy.mockClear();
  });

  it("no-ops without hitting fetch when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    await expect(pingXenditBalance()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
