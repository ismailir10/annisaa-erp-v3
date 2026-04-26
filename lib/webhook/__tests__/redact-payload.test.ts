import { describe, it, expect } from "vitest";
import { redactPayload } from "../redact-payload";
import realprod from "../__fixtures__/session-completed-realprod.json";
import bareId from "../__fixtures__/session-completed-bare-id.json";
import expired from "../__fixtures__/session-expired.json";

describe("redactPayload", () => {
  it("strips customer.* and replaces with REDACTED marker", () => {
    const out = redactPayload(realprod) as Record<string, unknown>;
    expect(out.customer).toEqual({ REDACTED: true });
  });

  it("strips billing_information.* and replaces with REDACTED marker", () => {
    const out = redactPayload(realprod) as Record<string, unknown>;
    expect(out.billing_information).toEqual({ REDACTED: true });
  });

  it("preserves event, created, and data subtrees untouched", () => {
    const out = redactPayload(realprod) as Record<string, unknown>;
    expect(out.event).toBe("payment_session.completed");
    expect(out.created).toBe("2026-04-26T09:23:19.140Z");
    expect(out.data).toEqual(realprod.data);
  });

  it("does not mutate the input", () => {
    const before = JSON.parse(JSON.stringify(realprod));
    redactPayload(realprod);
    expect(realprod).toEqual(before);
  });

  it("leaves payloads without customer/billing_information untouched", () => {
    const out = redactPayload(bareId) as Record<string, unknown>;
    expect(out).toEqual(bareId);
    // No keys added.
    expect("customer" in out).toBe(false);
    expect("billing_information" in out).toBe(false);
  });

  it("handles minimal expired-event shape", () => {
    const out = redactPayload(expired) as Record<string, unknown>;
    expect(out.event).toBe("payment_session.expired");
    expect(out.data).toEqual(expired.data);
  });

  it("returns null for null input", () => {
    expect(redactPayload(null)).toBeNull();
  });

  it("returns undefined for undefined input", () => {
    expect(redactPayload(undefined)).toBeUndefined();
  });

  it("returns scalar for non-object input", () => {
    expect(redactPayload("hello")).toBe("hello");
    expect(redactPayload(42)).toBe(42);
  });

  it("recursively redacts customer.* nested under data (Xendit may emit either shape)", () => {
    const nested = {
      event: "payment_session.completed",
      data: {
        amount: 800_000,
        customer: {
          email: "leak@test.com",
          mobile_number: "+62811000",
          given_names: "Should",
          surname: "Vanish",
        },
        billing_information: {
          city: "Jakarta",
          street_line1: "Jl. Rahasia",
        },
      },
    };
    const out = redactPayload(nested) as Record<string, unknown>;
    const data = out.data as Record<string, unknown>;
    expect(data.customer).toEqual({ REDACTED: true });
    expect(data.billing_information).toEqual({ REDACTED: true });
    expect(data.amount).toBe(800_000);
    // Stringify the entire output and assert PII strings do not appear.
    const stringified = JSON.stringify(out);
    expect(stringified).not.toContain("leak@test.com");
    expect(stringified).not.toContain("+62811000");
    expect(stringified).not.toContain("Jl. Rahasia");
  });
});
