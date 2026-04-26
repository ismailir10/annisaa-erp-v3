/**
 * Regression test for the double-slash bug observed in production webhook
 * payloads — `success_return_url` and `cancel_return_url` were being
 * emitted as `https://annisaa-erp-v3.vercel.app//payment/...` (note the
 * `//`) because `NEXT_PUBLIC_APP_URL` in Vercel env carries a trailing
 * slash and the helper concatenated `${APP_URL}/payment/...` directly.
 *
 * The fix: `lib/xendit/helpers.ts` strips trailing slashes from APP_URL.
 * This test pins the behavior so future env changes can't reintroduce it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/xendit/client", () => ({
  createXenditSession: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
});

describe("createXenditSessionForInvoice — APP_URL trailing-slash safety", () => {
  it("strips a trailing slash from NEXT_PUBLIC_APP_URL before constructing redirect URLs", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://annisaa-erp-v3.vercel.app/";

    const { createXenditSession } = await import("@/lib/xendit/client");
    const { prisma } = await import("@/lib/db");
    vi.mocked(createXenditSession).mockResolvedValue({
      id: "ps-x",
      payment_link_url: "https://x/y",
    } as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      tenantId: "tnt-1",
      status: "SENT",
      totalDue: 1000,
      totalPaid: 0,
      invoiceNumber: "INV-1",
      periodLabel: "Apr 2026",
      student: { name: "Aisy", guardians: [] },
      lines: [],
    } as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const { createXenditSessionForInvoice } = await import(
      "@/lib/xendit/helpers"
    );
    await createXenditSessionForInvoice("inv-1", "tnt-1");

    const args = vi.mocked(createXenditSession).mock.calls[0]?.[0];
    expect(args?.successReturnUrl).toBe(
      "https://annisaa-erp-v3.vercel.app/payment/success?invoice=inv-1",
    );
    expect(args?.cancelReturnUrl).toBe(
      "https://annisaa-erp-v3.vercel.app/payment/cancel?invoice=inv-1",
    );
    // Critical: no double slash anywhere except the protocol.
    expect(args?.successReturnUrl).not.toMatch(/(?<!:)\/\//);
    expect(args?.cancelReturnUrl).not.toMatch(/(?<!:)\/\//);
  });

});
