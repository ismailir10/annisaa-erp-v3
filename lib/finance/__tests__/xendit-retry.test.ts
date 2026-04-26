import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/xendit/helpers", () => ({
  createXenditSessionForInvoice: vi.fn(),
}));

import { retryPaymentLinks } from "../xendit-retry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryPaymentLinks — empty candidates", () => {
  it("returns zeros and an empty results array when no PENDING invoices match", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const out = await retryPaymentLinks("tnt-1", null);

    expect(out).toEqual({
      retried: 0,
      succeeded: 0,
      stillFailed: 0,
      results: [],
    });
    // Helper must not be touched when there's nothing to retry.
    expect(createXenditSessionForInvoice).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});

describe("retryPaymentLinks — mixed success/failure", () => {
  it("3 PENDING invoices, 2 succeed + 1 throws → retried=3, succeeded=2, stillFailed=1; updates correct shape per outcome", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    const candidates = [
      { id: "i-1", invoiceNumber: "INV-2026-0001", studentId: "s-1" },
      { id: "i-2", invoiceNumber: "INV-2026-0002", studentId: "s-2" },
      { id: "i-3", invoiceNumber: "INV-2026-0003", studentId: "s-3" },
    ];
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(candidates as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    vi.mocked(createXenditSessionForInvoice).mockImplementation(async (invoiceId) => {
      if (invoiceId === "i-3") throw new Error("Xendit 503");
      return { paymentUrl: `https://checkout.xendit.co/web/${invoiceId}` };
    });

    const out = await retryPaymentLinks("tnt-1", null);

    expect(out.retried).toBe(3);
    expect(out.succeeded).toBe(2);
    expect(out.stillFailed).toBe(1);
    expect(out.results).toHaveLength(3);

    const succeededRows = out.results.filter((r) => r.status === "SENT");
    const failedRows = out.results.filter((r) => r.status === "PENDING_PAYMENT_LINK");
    expect(succeededRows).toHaveLength(2);
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]).toMatchObject({
      invoiceId: "i-3",
      invoiceNumber: "INV-2026-0003",
      studentId: "s-3",
      status: "PENDING_PAYMENT_LINK",
      error: "Xendit 503",
    });

    // 2 successes get { status: SENT, paymentLinkError: null, sentAt: Date }
    const updateCalls = vi.mocked(prisma.invoice.update).mock.calls.map((c) => c[0]);

    const successUpdates = updateCalls.filter(
      (c) => c.where.id === "i-1" || c.where.id === "i-2"
    );
    expect(successUpdates).toHaveLength(2);
    for (const u of successUpdates) {
      expect(u.data).toMatchObject({ status: "SENT", paymentLinkError: null });
      expect((u.data as { sentAt: Date }).sentAt).toBeInstanceOf(Date);
    }

    // The 1 failure gets { paymentLinkError: <msg> } (no status change).
    const failUpdate = updateCalls.find((c) => c.where.id === "i-3");
    expect(failUpdate?.data).toEqual({ paymentLinkError: "Xendit 503" });
  });
});

describe("retryPaymentLinks — invoiceIds filter", () => {
  it('passes id: { in: invoiceIds } to the where clause when invoiceIds is provided', async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await retryPaymentLinks("tnt-1", ["i1", "i2"]);

    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(prisma.invoice.findMany).mock.calls[0][0];
    expect(arg?.where).toMatchObject({
      tenantId: "tnt-1",
      status: "PENDING_PAYMENT_LINK",
      id: { in: ["i1", "i2"] },
    });
    expect(arg?.take).toBe(25);
    expect(createXenditSessionForInvoice).not.toHaveBeenCalled();
  });

  it("does NOT add an id filter when invoiceIds is null (retries all PENDING)", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await retryPaymentLinks("tnt-1", null);

    const arg = vi.mocked(prisma.invoice.findMany).mock.calls[0][0];
    expect(arg?.where).toMatchObject({
      tenantId: "tnt-1",
      status: "PENDING_PAYMENT_LINK",
    });
    expect((arg?.where as Record<string, unknown>).id).toBeUndefined();
  });

  it("does NOT add an id filter when invoiceIds is an empty array (treats as retry-all)", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await retryPaymentLinks("tnt-1", []);

    const arg = vi.mocked(prisma.invoice.findMany).mock.calls[0][0];
    expect((arg?.where as Record<string, unknown>).id).toBeUndefined();
  });
});

describe("retryPaymentLinks — 25-invoice happy path", () => {
  it("fans out 25 candidates in parallel and reports all succeeded", async () => {
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");

    const candidates = Array.from({ length: 25 }, (_, i) => ({
      id: `i-${i + 1}`,
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      studentId: `s-${i + 1}`,
    }));
    vi.mocked(prisma.invoice.findMany).mockResolvedValue(candidates as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    vi.mocked(createXenditSessionForInvoice).mockImplementation(async (invoiceId) => {
      return { paymentUrl: `https://checkout.xendit.co/web/${invoiceId}` };
    });

    const out = await retryPaymentLinks("tnt-1", null);

    expect(out.retried).toBe(25);
    expect(out.succeeded).toBe(25);
    expect(out.stillFailed).toBe(0);
    expect(vi.mocked(createXenditSessionForInvoice)).toHaveBeenCalledTimes(25);
  });
});
