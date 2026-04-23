import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.XENDIT_WEBHOOK_TOKEN = "test-callback-token";

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../xendit/webhook/route";

function makeReq(body: unknown, token = "test-callback-token") {
  return new Request("http://localhost:3000/api/xendit/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-callback-token": token },
    body: JSON.stringify(body),
  });
}

describe("POST /api/xendit/webhook — end-to-end regression", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks invoice PAID via advisory-lock path (hashtext cast, not bit(64) bit-cast)", async () => {
    const { prisma } = await import("@/lib/db");
    const invoiceId = "inv-uuid-1234";
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: invoiceId,
      invoiceNumber: "INV-001",
      status: "SENT",
      totalDue: 100000,
      totalPaid: 0,
    } as never);

    let queryRawArgs: unknown[] | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray, ...args: unknown[]) => {
          queryRawArgs = [strings.join("?"), ...args];
          return Promise.resolve([{ pg_advisory_xact_lock: "" }]);
        }),
        invoice: {
          findUnique: vi.fn().mockResolvedValue({ id: invoiceId, status: "SENT", totalDue: 100000 }),
          update: vi.fn().mockResolvedValue({}),
        },
        payment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "p1" }),
          findMany: vi.fn().mockResolvedValue([{ amount: 100000 }]),
        },
      };
      return cb(tx);
    });

    const res = await POST(
      makeReq({
        event: "payment_session.completed",
        data: {
          status: "COMPLETED",
          reference_id: invoiceId,
          payment_id: "xnd-pay-1",
          amount: 100000,
          channel_code: "VA_BCA",
        },
      }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("PAID");
    expect(queryRawArgs).not.toBeNull();
    const args = queryRawArgs as unknown as unknown[];
    const joined = args[0] as string;
    expect(joined).toContain("hashtext");
    expect(joined).not.toContain("bit(64)");
    expect(args[1]).toBe(invoiceId);
  });

  it("rejects request with invalid callback token (401)", async () => {
    const res = await POST(
      makeReq({ event: "payment_session.completed", data: {} }, "wrong-token-same-len") as never
    );
    expect(res.status).toBe(401);
  });
});
