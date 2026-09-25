import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: auth.getSession, isAdminRole: (role: string) => role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ success: true }), getClientIp: () => "test" }));
vi.mock("@/lib/payments/session", () => ({ createPaymentSessionForInvoice: vi.fn() }));
vi.mock("@/lib/payments/reconcile", () => ({ reconcileInvoicePayment: vi.fn() }));
vi.mock("@/lib/finance/xendit-retry", () => ({ retryPaymentLinks: vi.fn() }));
const cases = [
  ["../invoices/route", "POST", "invoices.create"],
  ["../invoices/route", "GET", "invoices.view"],
  ["../invoices/[id]/route", "GET", "invoices.view"],
  ["../invoices/[id]/route", "PUT", "invoices.create"],
  ["../invoices/[id]/payments/route", "POST", "payments.record"],
  ["../invoices/[id]/refresh-payment/route", "POST", "payments.record"],
  ["../invoices/[id]/void/route", "POST", "invoices.void"],
  ["../invoices/retry-payment-links/route", "POST", "invoices.create"],
  ["../xendit/create-session/route", "POST", "invoices.create"],
  ["../billing-runs/route", "POST", "invoices.create"],
  ["../billing-runs/[id]/commit/route", "POST", "invoices.create"],
  ["../billing-runs/[id]/rebuild/route", "POST", "invoices.create"],
  ["../billing-runs/[id]/route", "PATCH", "invoices.create"],
  ["../billing-runs/[id]/rows/[rowId]/route", "PATCH", "invoices.create"],
  ["../billing-runs/[id]/rows/[rowId]/lines/route", "POST", "invoices.create"],
  ["../billing-runs/[id]/rows/[rowId]/lines/[lineId]/route", "PATCH", "invoices.create"],
  ["../billing-runs/[id]/rows/[rowId]/lines/[lineId]/route", "DELETE", "invoices.create"],
] as const;
beforeEach(() => vi.clearAllMocks());
describe("invoice route domain permission boundary", () => {
  it.each(cases)("%s %s rejects a role without %s before reading or writing records", async (file, method, missing) => {
    const permissions = ["invoices.view", "invoices.create", "payments.record", "invoices.void"].filter(p => p !== missing);
    auth.getSession.mockResolvedValue({ role: "SCHOOL_ADMIN", tenantId: "tenant-a", permissions });
    const handlers = await import(file);
    const request = new NextRequest("http://localhost/api/test", { method, ...(method !== "GET" ? { body: "{}", headers: { "content-type": "application/json" } } : {}) });
    const response = await handlers[method](request, { params: Promise.resolve({ id: "foreign-record", rowId: "row", lineId: "line" }) });
    expect(response.status).toBe(403);
  });
});
