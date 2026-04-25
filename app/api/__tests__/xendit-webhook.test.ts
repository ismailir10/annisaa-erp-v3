// Webhook handler contract tests for the rewritten T5 handler.
// Mocks @/lib/db so no real DB hits.
//
// Coverage:
//  1. 401 on missing/mismatched x-callback-token
//  2. 400 on malformed JSON body
//  3. duplicate eventId (P2002) → 200 { duplicate: true }
//  4. payment_session.completed → invoice PAID + Payment row + PROCESSED
//  5. payment_session.expired → invoice CANCELLED + xendit fields nulled
//  6. unknown event → 200 IGNORED, no Invoice mutation
//  7. invoice-not-found → 200 IGNORED:invoice_not_found
//  8. mid-tx throw → DELETE WebhookEvent + 500
//  9. body.id missing → eventId synthesized with payload sha256 suffix
import { describe, it, expect, vi, beforeEach } from "vitest";

const TOKEN = "test-callback-token-padding-32!!";
process.env.XENDIT_WEBHOOK_TOKEN = TOKEN;

vi.mock("@/lib/generated/prisma/client", () => {
  // Defined inside the factory because vi.mock is hoisted; outer-scope refs
  // are not yet initialized when the factory runs.
  class FakeP2002 extends Error {
    code = "P2002";
    clientVersion = "test";
    meta = {};
    constructor(msg = "Unique constraint failed") {
      super(msg);
    }
  }
  // Minimal Decimal shim — webhook + sumDecimals use add / greaterThanOrEqualTo.
  class FakeDecimal {
    private n: number;
    constructor(v: unknown) {
      this.n = typeof v === "number" ? v : Number(v);
    }
    add(other: unknown): FakeDecimal {
      return new FakeDecimal(this.n + new FakeDecimal(other).n);
    }
    greaterThanOrEqualTo(other: unknown): boolean {
      return this.n >= new FakeDecimal(other).n;
    }
    toString(): string {
      return String(this.n);
    }
    toNumber(): number {
      return this.n;
    }
  }
  return {
    Prisma: { PrismaClientKnownRequestError: FakeP2002, Decimal: FakeDecimal },
  };
});

// Re-derive a class with the same shape for use in test bodies (rejecting
// with `new FakeP2002()` so the handler's instanceof check matches the mock).
import { Prisma } from "@/lib/generated/prisma/client";
const FakeP2002 = Prisma.PrismaClientKnownRequestError as unknown as new (
  msg?: string,
) => Error;

vi.mock("@/lib/db", () => ({
  prisma: {
    webhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../xendit/webhook/route";

function makeReq(
  body: unknown,
  token: string | null = TOKEN,
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["x-callback-token"] = token;
  return new Request("http://localhost/api/xendit/webhook", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/xendit/webhook (T5 contract)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.webhookEvent.update).mockResolvedValue({} as never);
    vi.mocked(prisma.webhookEvent.delete).mockResolvedValue({} as never);
    // Default $transaction proxies callback to the same prisma mocks.
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: unknown) =>
        await (cb as (tx: unknown) => unknown)({
          $queryRaw: prisma.$queryRaw,
          invoice: prisma.invoice,
          payment: prisma.payment,
        }),
    );
  });

  it("401 when token is missing", async () => {
    const res = await POST(makeReq({}, null) as never);
    expect(res.status).toBe(401);
  });

  it("401 when token mismatches (same length)", async () => {
    const res = await POST(
      makeReq({ event: "x" }, "wrong-token-padding-of-32-bytes!!") as never,
    );
    expect(res.status).toBe(401);
  });

  it("400 on malformed JSON body", async () => {
    const res = await POST(makeReq("not-json{{") as never);
    expect(res.status).toBe(400);
    const { prisma } = await import("@/lib/db");
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("duplicate eventId returns { duplicate: true } with 200", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.webhookEvent.create).mockRejectedValueOnce(
      new FakeP2002(),
    );
    const res = await POST(
      makeReq({
        id: "evt-1",
        event: "payment_session.completed",
        data: { reference_id: "inv1", status: "COMPLETED" },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it("completed event flips invoice to PAID + creates Payment + marks PROCESSED", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      status: "SENT",
      totalDue: 1000,
      totalPaid: 0,
      invoiceNumber: "INV-1",
    } as never);
    // Capture inner-tx spies so we can assert on the actual mutations.
    const txInvoiceUpdate = vi.fn().mockResolvedValue({});
    const txPaymentCreate = vi.fn().mockResolvedValue({ id: "p1" });
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (cb: unknown) =>
        await (cb as (tx: unknown) => unknown)({
          $queryRaw: vi.fn().mockResolvedValue([{}]),
          invoice: {
            findUnique: vi.fn().mockResolvedValue({
              id: "inv1",
              status: "SENT",
              totalDue: 1000,
              totalPaid: 0,
            }),
            update: txInvoiceUpdate,
          },
          payment: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: txPaymentCreate,
            findMany: vi.fn().mockResolvedValue([{ amount: 1000 }]),
          },
        }),
    );

    const res = await POST(
      makeReq({
        id: "evt-2",
        event: "payment_session.completed",
        data: {
          reference_id: "inv1",
          status: "COMPLETED",
          payment_id: "pay-1",
          amount: 1000,
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "PAID" });
    // Inner-tx mutations actually happened.
    expect(txPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: "inv1",
          amount: 1000,
          method: "XENDIT",
          reference: "pay-1",
        }),
      }),
    );
    expect(txInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        // totalPaid is now a Prisma.Decimal (matches FakeDecimal mock); compare
        // via .toString() to keep the assertion implementation-agnostic.
        data: expect.objectContaining({
          status: "PAID",
          totalPaid: expect.objectContaining({
            toString: expect.any(Function),
          }),
        }),
      }),
    );
    const updateCall = txInvoiceUpdate.mock.calls[0][0] as {
      data: { totalPaid: { toString: () => string } };
    };
    expect(updateCall.data.totalPaid.toString()).toBe("1000");
    // Outer audit row marked PROCESSED with invoice link.
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "evt-2" },
        data: expect.objectContaining({
          status: "PROCESSED",
          invoiceId: "inv1",
        }),
      }),
    );
  });

  it("expired event flips invoice to CANCELLED + nulls xendit fields", async () => {
    const { prisma } = await import("@/lib/db");
    // Capture the inner-tx invoice.update spy to assert the mutation.
    const txInvoiceUpdate = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (cb: unknown) =>
        await (cb as (tx: unknown) => unknown)({
          $queryRaw: vi.fn().mockResolvedValue([{}]),
          invoice: {
            findUnique: vi.fn().mockResolvedValue({
              id: "inv1",
              status: "SENT",
              invoiceNumber: "INV-1",
            }),
            update: txInvoiceUpdate,
          },
        }),
    );

    const res = await POST(
      makeReq({
        id: "evt-3",
        event: "payment_session.expired",
        data: { reference_id: "inv1", status: "EXPIRED" },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "CANCELLED" });
    // The actual mutation: status flipped + xendit fields nulled.
    expect(txInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: {
        status: "CANCELLED",
        xenditSessionId: null,
        xenditPaymentUrl: null,
      },
    });
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "evt-3" },
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });

  it("unknown event returns 200 IGNORED + does not touch invoice", async () => {
    const { prisma } = await import("@/lib/db");
    const res = await POST(
      makeReq({
        id: "evt-4",
        event: "payment_method.activated",
        data: { foo: "bar" },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "evt-4" },
        data: expect.objectContaining({ status: "IGNORED" }),
      }),
    );
  });

  it("invoice-not-found on completed → 200 IGNORED:invoice_not_found", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
    const res = await POST(
      makeReq({
        id: "evt-5",
        event: "payment_session.completed",
        data: { reference_id: "missing", status: "COMPLETED" },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "IGNORED:invoice_not_found",
    });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("mid-tx throw deletes WebhookEvent + returns 500", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv1",
      status: "SENT",
      totalDue: 1000,
      totalPaid: 0,
      invoiceNumber: "INV-1",
    } as never);
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("DB went away"),
    );
    const res = await POST(
      makeReq({
        id: "evt-6",
        event: "payment_session.completed",
        data: { reference_id: "inv1", status: "COMPLETED" },
      }) as never,
    );
    expect(res.status).toBe(500);
    expect(prisma.webhookEvent.delete).toHaveBeenCalledWith({
      where: { eventId: "evt-6" },
    });
  });

  it("synthesizes eventId with sha256 suffix when body.id missing", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
    await POST(
      makeReq({
        // intentionally no `id` field
        event: "payment_session.completed",
        data: {
          reference_id: "inv1",
          payment_session_id: "ps_x",
          status: "COMPLETED",
        },
      }) as never,
    );
    const arg = vi.mocked(prisma.webhookEvent.create).mock.calls[0]?.[0] as
      | { data: { eventId: string } }
      | undefined;
    expect(arg).toBeDefined();
    expect(arg!.data.eventId).toMatch(
      /^payment_session\.completed:ps_x:COMPLETED:[a-f0-9]{16}$/,
    );
  });
});
