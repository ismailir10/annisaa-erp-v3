import { describe, it, expect } from "vitest";
import { pickSessionId, stripQuery } from "../xendit/client";

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
