import { describe, it, expect, vi, beforeEach } from "vitest";

// Admin session — passes route's authz gate.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ tenantId: "tnt-1", role: "ADMIN", userId: "u-1" })),
  isAdminRole: (r: string) => r === "ADMIN" || r === "SUPER_ADMIN",
}));

// Disable rate-limit for these tests — each `it` issues several requests against
// the same `anonymous` key and the route caps at 5/min.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99 })),
  getClientIp: vi.fn(() => "test-ip"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

// Mock the helper at the boundary the route imports it from. This keeps tests
// focused on the route's idempotency + paymentLinkError write-back behavior;
// the helper's own DB updates are out of scope.
vi.mock("@/lib/xendit/helpers", () => ({
  createXenditSessionForInvoice: vi.fn(),
}));

import { POST } from "../xendit/create-session/route";

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/xendit/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/xendit/create-session — idempotency + paymentLinkError write-back", () => {
  beforeEach(() => vi.clearAllMocks());

  it("existing-session path: returns existing URL, does NOT call Xendit, clears paymentLinkError defensively", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-existing",
      tenantId: "tnt-1",
      invoiceNumber: "INV-EXIST-1",
      status: "SENT",
      totalDue: 100000,
      totalPaid: 0,
      xenditSessionId: "xnd-sess-already",
      xenditPaymentUrl: "https://checkout.xendit.co/web/already-here",
      paymentLinkError: null,
      student: { name: "Aisyah" },
      lines: [{ labelSnapshot: "SPP" }],
    } as never);

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const res = await POST(makeReq({ invoiceIds: ["inv-existing"] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      studentName: "Aisyah",
      invoiceNumber: "INV-EXIST-1",
      paymentUrl: "https://checkout.xendit.co/web/already-here",
    });

    // The helper (which would call the Xendit API) MUST NOT be invoked.
    expect(createXenditSessionForInvoice).not.toHaveBeenCalled();

    // paymentLinkError cleared defensively.
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-existing" },
      data: { paymentLinkError: null },
    });
  });

  it("Xendit success path: helper called, status flipped to SENT with paymentLinkError null", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-fresh",
      tenantId: "tnt-1",
      invoiceNumber: "INV-FRESH-1",
      status: "DRAFT",
      totalDue: 250000,
      totalPaid: 0,
      xenditSessionId: null,
      xenditPaymentUrl: null,
      paymentLinkError: null,
      student: { name: "Budi" },
      lines: [{ labelSnapshot: "SPP" }],
    } as never);

    vi.mocked(createXenditSessionForInvoice).mockResolvedValue({
      paymentUrl: "https://checkout.xendit.co/web/new-url",
    });

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const res = await POST(makeReq({ invoiceIds: ["inv-fresh"] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].paymentUrl).toBe("https://checkout.xendit.co/web/new-url");

    expect(createXenditSessionForInvoice).toHaveBeenCalledWith(
      "inv-fresh",
      "tnt-1",
      expect.stringMatching(/^https?:\/\//),
    );

    // Status flip + paymentLinkError clear in the same update.
    const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0]?.[0];
    expect(updateCall?.where).toEqual({ id: "inv-fresh" });
    expect(updateCall?.data).toMatchObject({ status: "SENT", paymentLinkError: null });
    expect(updateCall?.data).toHaveProperty("sentAt");
    expect(updateCall?.data?.sentAt).toBeInstanceOf(Date);
  });

  it("Xendit failure path: persists status=PENDING_PAYMENT_LINK + paymentLinkError, increments failed", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-fail",
      tenantId: "tnt-1",
      invoiceNumber: "INV-FAIL-1",
      status: "DRAFT",
      totalDue: 100000,
      totalPaid: 0,
      xenditSessionId: null,
      xenditPaymentUrl: null,
      paymentLinkError: null,
      student: { name: "Citra" },
      lines: [{ labelSnapshot: "SPP" }],
    } as never);

    vi.mocked(createXenditSessionForInvoice).mockRejectedValue(
      new Error("Xendit 503 Service Unavailable")
    );
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const res = await POST(makeReq({ invoiceIds: ["inv-fail"] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.results).toHaveLength(0);
    expect(body.errors).toEqual(["Citra: Xendit 503 Service Unavailable"]);

    // The failure write-back: status flips to PENDING_PAYMENT_LINK and the
    // error message is persisted for diagnosis + retry. The persisted column
    // is prefix-tagged via formatPaymentLinkError — generic Error → "unknown:".
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-fail" },
      data: {
        status: "PENDING_PAYMENT_LINK",
        paymentLinkError: "unknown: Xendit 503 Service Unavailable",
      },
    });
  });

  it("retry of PENDING_PAYMENT_LINK invoice succeeds: status flips to SENT, paymentLinkError cleared", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    // Invoice was previously flagged after a Xendit failure — has the diagnostic
    // message but no session yet. Admin clicks "Coba Lagi"; helper succeeds.
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-retry",
      tenantId: "tnt-1",
      invoiceNumber: "INV-RETRY-1",
      status: "PENDING_PAYMENT_LINK",
      totalDue: 175000,
      totalPaid: 0,
      xenditSessionId: null,
      xenditPaymentUrl: null,
      paymentLinkError: "Previous failure: Xendit timeout",
      student: { name: "Dewi" },
      lines: [{ labelSnapshot: "SPP" }],
    } as never);

    vi.mocked(createXenditSessionForInvoice).mockResolvedValue({
      paymentUrl: "https://checkout.xendit.co/web/retry-success",
    });
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const res = await POST(makeReq({ invoiceIds: ["inv-retry"] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.results[0].paymentUrl).toBe("https://checkout.xendit.co/web/retry-success");

    // The single update on the success path carries both the SENT flip AND
    // the paymentLinkError clear — that's the retry-of-PENDING contract.
    const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0]?.[0];
    expect(updateCall?.data).toMatchObject({ status: "SENT", paymentLinkError: null });
  });

  it("mixed batch: 1 already-sessioned + 1 success + 1 failure → counts and per-row results align", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    // findUnique called once per invoiceId in order.
    vi.mocked(prisma.invoice.findUnique)
      .mockResolvedValueOnce({
        id: "inv-a",
        tenantId: "tnt-1",
        invoiceNumber: "INV-A",
        status: "SENT",
        totalDue: 100000,
        totalPaid: 0,
        xenditSessionId: "xnd-existing-A",
        xenditPaymentUrl: "https://checkout.xendit.co/web/A-url",
        paymentLinkError: null,
        student: { name: "Aisyah" },
        lines: [{ labelSnapshot: "SPP" }],
      } as never)
      .mockResolvedValueOnce({
        id: "inv-b",
        tenantId: "tnt-1",
        invoiceNumber: "INV-B",
        status: "DRAFT",
        totalDue: 100000,
        totalPaid: 0,
        xenditSessionId: null,
        xenditPaymentUrl: null,
        paymentLinkError: null,
        student: { name: "Budi" },
        lines: [{ labelSnapshot: "SPP" }],
      } as never)
      .mockResolvedValueOnce({
        id: "inv-c",
        tenantId: "tnt-1",
        invoiceNumber: "INV-C",
        status: "DRAFT",
        totalDue: 100000,
        totalPaid: 0,
        xenditSessionId: null,
        xenditPaymentUrl: null,
        paymentLinkError: null,
        student: { name: "Citra" },
        lines: [{ labelSnapshot: "SPP" }],
      } as never);

    // Helper is called only for B and C. B succeeds, C throws.
    vi.mocked(createXenditSessionForInvoice)
      .mockResolvedValueOnce({ paymentUrl: "https://checkout.xendit.co/web/B-url" })
      .mockRejectedValueOnce(new Error("Xendit 500"));

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const res = await POST(
      makeReq({ invoiceIds: ["inv-a", "inv-b", "inv-c"] }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(3);
    expect(body.created).toBe(2); // A (existing) + B (fresh success)
    expect(body.failed).toBe(1); // C (Xendit failure)
    expect(body.results).toHaveLength(2);
    expect(body.results.map((r: { invoiceNumber: string }) => r.invoiceNumber).sort()).toEqual([
      "INV-A",
      "INV-B",
    ]);
    expect(body.errors).toEqual(["Citra: Xendit 500"]);

    // Helper called exactly twice — NOT for inv-a (already sessioned).
    expect(createXenditSessionForInvoice).toHaveBeenCalledTimes(2);
    expect(createXenditSessionForInvoice).toHaveBeenNthCalledWith(
      1,
      "inv-b",
      "tnt-1",
      expect.stringMatching(/^https?:\/\//),
    );
    expect(createXenditSessionForInvoice).toHaveBeenNthCalledWith(
      2,
      "inv-c",
      "tnt-1",
      expect.stringMatching(/^https?:\/\//),
    );

    // Three updates: A (defensive clear), B (SENT + clear), C (PENDING + error).
    const updateCalls = vi.mocked(prisma.invoice.update).mock.calls.map((c) => c[0]);
    expect(updateCalls).toHaveLength(3);

    const aUpdate = updateCalls.find((c) => c?.where.id === "inv-a");
    expect(aUpdate?.data).toEqual({ paymentLinkError: null });

    const bUpdate = updateCalls.find((c) => c?.where.id === "inv-b");
    expect(bUpdate?.data).toMatchObject({ status: "SENT", paymentLinkError: null });

    const cUpdate = updateCalls.find((c) => c?.where.id === "inv-c");
    // Prefix-tagged via formatPaymentLinkError — generic Error → "unknown:".
    expect(cUpdate?.data).toEqual({
      status: "PENDING_PAYMENT_LINK",
      paymentLinkError: "unknown: Xendit 500",
    });
  });
});
