/**
 * POST /api/invoices/[id]/payments/[paymentId]/reverse (FIN-6 second half).
 * Mocks `$transaction` to run the callback against a tx double; the recompute
 * helper itself is covered in lib/finance/__tests__/invoice-payment-state.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const $transaction = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: { $transaction } }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { POST } from "../invoices/[id]/payments/[paymentId]/reverse/route";
import { getSession } from "@/lib/auth";

const ADMIN = {
  id: "u-1",
  email: "admin@t.local",
  name: "Bu Nur",
  role: "SCHOOL_ADMIN",
  tenantId: "t-1",
  employeeId: null,
  parentId: null,
  permissions: ["payments.record"] as string[],
  customRoleCode: null,
};
const ctx = { params: Promise.resolve({ id: "inv-1", paymentId: "pay-1" }) };
const req = (body: unknown) =>
  new Request("http://localhost/api/invoices/inv-1/payments/pay-1/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

const invoice = {
  id: "inv-1",
  tenantId: "t-1",
  status: "PAID",
  totalDue: new Prisma.Decimal(1_000_000),
  totalPaid: new Prisma.Decimal(1_000_000),
  dueDate: "2099-01-01",
  sentAt: new Date("2026-09-01"),
  xenditPaymentUrl: null,
  paymentLinkError: null,
};
const payment = {
  id: "pay-1",
  invoiceId: "inv-1",
  amount: new Prisma.Decimal(1_000_000),
  method: "CASH",
  status: "RECORDED",
  notes: null,
  xenditPaymentId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(ADMIN as never);
  $transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
  tx.invoice.findUnique.mockResolvedValue(invoice);
  tx.payment.findUnique.mockResolvedValue(payment);
  tx.payment.update.mockImplementation(async ({ data }: { data: object }) => ({ ...payment, ...data }));
  tx.payment.findMany.mockResolvedValue([]); // nothing left after the reversal
});

describe("POST reverse payment", () => {
  it("reverses a manual payment, recomputes the invoice back to unpaid and audits it", async () => {
    const res = await POST(req({ reason: "Salah input nominal" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, alreadyReversed: false, invoiceStatus: "SENT" });

    const upd = tx.payment.update.mock.calls[0][0];
    expect(upd.data.status).toBe("REVERSED");
    expect(upd.data.notes).toContain("Salah input nominal");
    expect(upd.data.notes).toContain("Bu Nur");

    // recompute excluded REVERSED rows
    expect(tx.payment.findMany.mock.calls[0][0].where).toEqual({
      invoiceId: "inv-1",
      status: { not: "REVERSED" },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { totalPaid: expect.anything(), status: "SENT", paidAt: null },
    });

    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      tenantId: "t-1",
      actorId: "u-1",
      entity: "Payment",
      entityId: "pay-1",
      action: "reverse",
    });
    expect(audit.after.reason).toBe("Salah input nominal");
    expect(revalidateTag).toHaveBeenCalledWith("parent-invoice-list", { expire: 0 });
  });

  it("is idempotent: an already-reversed payment answers 200 and writes nothing", async () => {
    tx.payment.findUnique.mockResolvedValue({ ...payment, status: "REVERSED" });
    const res = await POST(req({ reason: "Salah input nominal" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyReversed).toBe(true);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["XENDIT method", { method: "XENDIT" }],
    ["DOKU method", { method: "DOKU" }],
    ["gateway id on a manual-looking row", { method: "OTHER", xenditPaymentId: "gw-1" }],
  ])("409 with a clear message for a gateway payment (%s)", async (_l, patch) => {
    tx.payment.findUnique.mockResolvedValue({ ...payment, ...patch });
    const res = await POST(req({ reason: "Salah input nominal" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/gateway/i);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("409 when the invoice is cancelled", async () => {
    tx.invoice.findUnique.mockResolvedValue({ ...invoice, status: "CANCELLED" });
    const res = await POST(req({ reason: "Salah input nominal" }), ctx);
    expect(res.status).toBe(409);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("400 without a reason (or a too-short one); no transaction opened", async () => {
    expect((await POST(req({}), ctx)).status).toBe(400);
    expect((await POST(req({ reason: "  x " }), ctx)).status).toBe(400);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("404 for another tenant's invoice and for a payment on a different invoice", async () => {
    tx.invoice.findUnique.mockResolvedValue({ ...invoice, tenantId: "t-other" });
    expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(404);
    tx.invoice.findUnique.mockResolvedValue(invoice);
    tx.payment.findUnique.mockResolvedValue({ ...payment, invoiceId: "inv-2" });
    expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(404);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("403 without payments.record, for guardians and with no session", async () => {
    vi.mocked(getSession).mockResolvedValue({ ...ADMIN, role: "TEACHER" } as never);
    expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(403);
    vi.mocked(getSession).mockResolvedValue({ ...ADMIN, permissions: ["invoices.view"] } as never);
    expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(403);
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(403);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("429 after 20 reversals a minute by one user; no transaction opened for the 21st", async () => {
    vi.mocked(getSession).mockResolvedValue({ ...ADMIN, id: "u-ratelimit" } as never);
    for (let i = 0; i < 20; i++) {
      expect((await POST(req({ reason: "Salah input nominal" }), ctx)).status).toBe(200);
    }
    $transaction.mockClear();
    const res = await POST(req({ reason: "Salah input nominal" }), ctx);
    expect(res.status).toBe(429);
    expect($transaction).not.toHaveBeenCalled();
  });
});
