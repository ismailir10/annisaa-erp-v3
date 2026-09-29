/**
 * POST /api/invoices/[id]/payments — the transaction body (FIN-6/7/8/23).
 * Validation-only cases live in invoices-record-payment.test.ts (which mocks
 * Prisma.Decimal); this file runs the real Decimal maths against a tx double.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const db = vi.hoisted(() => ({ invoice: { findFirst: vi.fn() }, $transaction: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { POST } from "../invoices/[id]/payments/route";
import { getSession } from "@/lib/auth";

const ADMIN = {
  id: "u-admin",
  email: "a@t.local",
  name: "Bu Nur",
  role: "SCHOOL_ADMIN",
  tenantId: "t-1",
  employeeId: null,
  parentId: null,
  permissions: ["payments.record"] as string[],
  customRoleCode: null,
};
const ctx = { params: Promise.resolve({ id: "inv-1" }) };
const req = (body: unknown) =>
  new Request("http://localhost/api/invoices/inv-1/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

const invoice = (over: object = {}) => ({
  id: "inv-1",
  tenantId: "t-1",
  status: "SENT",
  totalDue: new Prisma.Decimal(1_000_000),
  totalPaid: new Prisma.Decimal(400_000),
  dueDate: "2099-01-01",
  sentAt: new Date("2026-09-01"),
  xenditPaymentUrl: null,
  paymentLinkError: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(ADMIN as never);
  db.invoice.findFirst.mockResolvedValue({ id: "inv-1" });
  db.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
  tx.invoice.findUnique.mockResolvedValue(invoice());
  tx.payment.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "pay-9", ...data }));
});

describe("POST /api/invoices/[id]/payments — transaction", () => {
  it("stores the session user as createdBy, audits, and recomputes from non-reversed rows", async () => {
    tx.payment.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(400_000) },
      { amount: new Prisma.Decimal(600_000) },
    ]);
    const res = await POST(req({ amount: 600_000, method: "CASH" }), ctx);
    expect(res.status).toBe(201);
    expect(tx.payment.create.mock.calls[0][0].data.createdBy).toBe("u-admin");
    expect(tx.payment.findMany.mock.calls[0][0].where).toEqual({
      invoiceId: "inv-1",
      status: { not: "REVERSED" },
    });
    expect(tx.invoice.update.mock.calls[0][0].data.status).toBe("PAID");
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ entity: "Payment", entityId: "pay-9", action: "record", actorId: "u-admin" });
  });

  it("overpayment: 400 with Rupiah-formatted amounts, attached to the Jumlah field", async () => {
    const res = await POST(req({ amount: 700_000, method: "CASH" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Jumlah pembayaran (Rp 700.000) melebihi sisa tagihan (Rp 600.000)");
    expect(body.errors).toEqual([{ field: "amount", message: body.error }]);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it.each(["XENDIT", "DOKU"])("400 for gateway method %s on a manual record (FIN-23)", async (method) => {
    const res = await POST(req({ amount: 100_000, method }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0].field).toBe("method");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
