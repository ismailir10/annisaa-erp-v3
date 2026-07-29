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

describe("extractDisplayFields — DOKU notification shape (2026-07-27-doku-payment-gateway T6)", () => {
  function makeDokuNotification(overrides: {
    order?: Record<string, unknown>;
    transaction?: Record<string, unknown>;
    channel?: Record<string, unknown>;
  } = {}) {
    return {
      service: { id: "VIRTUAL_ACCOUNT" },
      acquirer: { id: "BCA" },
      channel: { id: "VIRTUAL_ACCOUNT_BCA", ...(overrides.channel ?? {}) },
      transaction: {
        status: "SUCCESS",
        date: "2026-07-27T10:00:00Z",
        original_request_id: "req-default",
        ...(overrides.transaction ?? {}),
      },
      order: {
        invoice_number: "inv1",
        amount: 400_000,
        ...(overrides.order ?? {}),
      },
    };
  }

  it("reports a live paymentMethod from channel.id — unlike Xendit's hardcoded null", () => {
    const fields = extractDisplayFields(makeDokuNotification());
    expect(fields.paymentMethod).toBe("VIRTUAL_ACCOUNT_BCA");
  });

  it("parses paidAt from transaction.date", () => {
    const fields = extractDisplayFields(makeDokuNotification());
    expect(fields.paidAt?.toISOString()).toBe("2026-07-27T10:00:00.000Z");
  });

  it("parses amount from order.amount", () => {
    const fields = extractDisplayFields(makeDokuNotification());
    expect(fields.amount).toBe(400_000);
  });

  it("coerces a float order.amount (some channels send e.g. 20000.00)", () => {
    const fields = extractDisplayFields(
      makeDokuNotification({ order: { amount: 20000.0 } }),
    );
    expect(fields.amount).toBe(20000);
  });

  it("parses paymentId from transaction.original_request_id", () => {
    const fields = extractDisplayFields(
      makeDokuNotification({ transaction: { original_request_id: "req-abc-123" } }),
    );
    expect(fields.paymentId).toBe("req-abc-123");
  });

  it("returns sessionId = null — DOKU notifications carry no session/token id", () => {
    const fields = extractDisplayFields(makeDokuNotification());
    expect(fields.sessionId).toBeNull();
  });

  it("parses currency from transaction.amount_details.currency when present", () => {
    const fields = extractDisplayFields(
      makeDokuNotification({ transaction: { amount_details: { currency: "IDR" } } }),
    );
    expect(fields.currency).toBe("IDR");
  });

  it("returns currency = null when amount_details is absent", () => {
    const fields = extractDisplayFields(makeDokuNotification());
    expect(fields.currency).toBeNull();
  });

  it("does not match the DOKU branch when only one of order/transaction is present", () => {
    // Guards the structural-detection boundary: a malformed/partial payload
    // must fall through to all-null, not throw or half-populate.
    const fields = extractDisplayFields({ order: { amount: 1000 } });
    expect(fields).toEqual({
      paidAt: null,
      paymentMethod: null,
      amount: null,
      currency: null,
      sessionId: null,
      paymentId: null,
    });
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
