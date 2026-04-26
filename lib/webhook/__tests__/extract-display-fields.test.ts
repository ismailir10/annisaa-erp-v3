import { describe, it, expect } from "vitest";
import { extractDisplayFields } from "../extract-display-fields";
import realprod from "../__fixtures__/session-completed-realprod.json";
import bareId from "../__fixtures__/session-completed-bare-id.json";
import expired from "../__fixtures__/session-expired.json";

describe("extractDisplayFields — real production payload", () => {
  it("parses paidAt from data.updated", () => {
    const fields = extractDisplayFields(realprod);
    expect(fields.paidAt).not.toBeNull();
    expect(fields.paidAt?.toISOString()).toBe("2026-04-26T09:23:18.882Z");
  });

  it("returns paymentMethod = null (Payment Link mode)", () => {
    const fields = extractDisplayFields(realprod);
    expect(fields.paymentMethod).toBeNull();
  });

  it("parses amount, currency, sessionId, paymentId", () => {
    const fields = extractDisplayFields(realprod);
    expect(fields.amount).toBe(800000);
    expect(fields.currency).toBe("IDR");
    expect(fields.sessionId).toBe("ps-69ec4131991c6b6d61d2e989");
    expect(fields.paymentId).toBe("py-baa5f75a-73b0-4d57-9476-58f1bb160168");
  });
});

describe("extractDisplayFields — bare-CUID payload", () => {
  it("parses paidAt from data.updated", () => {
    const fields = extractDisplayFields(bareId);
    expect(fields.paidAt?.toISOString()).toBe("2026-04-26T10:14:55.000Z");
  });

  it("parses amount = 500000", () => {
    const fields = extractDisplayFields(bareId);
    expect(fields.amount).toBe(500000);
  });
});

describe("extractDisplayFields — expired payload", () => {
  it("returns null for amount/currency/paidAt (data.updated absent)", () => {
    const fields = extractDisplayFields(expired);
    expect(fields.amount).toBeNull();
    expect(fields.currency).toBeNull();
    // No data.updated, no data.created, fall back to envelope.created.
    expect(fields.paidAt?.toISOString()).toBe("2026-04-26T11:00:00.000Z");
  });

  it("still parses sessionId from data.payment_session_id", () => {
    const fields = extractDisplayFields(expired);
    expect(fields.sessionId).toBe("ps-cccccccccccccccccccccccc");
  });
});

describe("extractDisplayFields — fallback chain", () => {
  it("uses data.created when data.updated absent", () => {
    const envelope = {
      data: {
        created: "2026-01-01T00:00:00.000Z",
      },
    };
    expect(extractDisplayFields(envelope).paidAt?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("uses envelope.created when both data.updated + data.created absent", () => {
    const envelope = {
      created: "2026-02-02T02:02:02.000Z",
      data: {},
    };
    expect(extractDisplayFields(envelope).paidAt?.toISOString()).toBe(
      "2026-02-02T02:02:02.000Z",
    );
  });
});

describe("extractDisplayFields — unparseable input", () => {
  it("returns all-null for null input", () => {
    expect(extractDisplayFields(null)).toEqual({
      paidAt: null,
      paymentMethod: null,
      amount: null,
      currency: null,
      sessionId: null,
      paymentId: null,
    });
  });

  it("returns all-null for undefined input", () => {
    expect(extractDisplayFields(undefined)).toEqual({
      paidAt: null,
      paymentMethod: null,
      amount: null,
      currency: null,
      sessionId: null,
      paymentId: null,
    });
  });

  it("returns all-null when data field is missing", () => {
    expect(extractDisplayFields({ event: "x" })).toEqual({
      paidAt: null,
      paymentMethod: null,
      amount: null,
      currency: null,
      sessionId: null,
      paymentId: null,
    });
  });

  it("returns all-null for non-object input", () => {
    expect(extractDisplayFields("hello").paidAt).toBeNull();
    expect(extractDisplayFields(42).amount).toBeNull();
  });

  it("returns null for amount when not a finite number", () => {
    const envelope = { data: { amount: "800000" } };
    expect(extractDisplayFields(envelope).amount).toBeNull();
  });
});
