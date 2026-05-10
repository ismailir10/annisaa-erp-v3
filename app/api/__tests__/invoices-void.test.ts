/**
 * Coverage for `POST /api/invoices/[id]/void`.
 *
 * The handler runs inside a `$transaction(callback)` with an advisory lock
 * to serialize against the Xendit webhook + manual payment paths. We mock
 * `$transaction` to invoke the callback with a tx mock that exposes the
 * methods the route uses (`$executeRaw`, `invoice.findUnique`, `invoice.update`).
 *
 * Status guard: only DRAFT / SENT / PENDING_PAYMENT_LINK are voidable;
 * anything else (PAID, CANCELLED, etc.) → 409.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txExecuteRaw = vi.fn();
const txInvoiceFindUnique = vi.fn();
const txInvoiceUpdate = vi.fn();
const $transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction,
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function adminSession() {
  return {
    id: "u-1",
    email: "admin@test.com",
    name: "Admin",
    role: "SUPER_ADMIN" as const,
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
    permissions: [] as string[],
    customRoleCode: null,
  };
}

function makeReq() {
  return new Request("http://localhost/api/invoices/inv-1/void", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  txExecuteRaw.mockResolvedValue(undefined);
  txInvoiceUpdate.mockResolvedValue({ id: "inv-1", status: "CANCELLED" });
  // Default: pass the inner callback a tx-shaped object and propagate any thrown error.
  $transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({
      $executeRaw: txExecuteRaw,
      invoice: {
        findUnique: txInvoiceFindUnique,
        update: txInvoiceUpdate,
      },
    });
  });
});

describe("POST /api/invoices/[id]/void", () => {
  it("voids a SENT invoice and clears Xendit fields", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    txInvoiceFindUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-1",
      status: "SENT",
    });

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(200);
    expect(txInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({
          status: "CANCELLED",
          xenditSessionId: null,
          xenditPaymentUrl: null,
          paymentLinkError: null,
        }),
      }),
    );
  });

  it("voids a DRAFT invoice", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    txInvoiceFindUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-1",
      status: "DRAFT",
    });

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(200);
    expect(txInvoiceUpdate).toHaveBeenCalled();
  });

  it("409 when invoice is PAID (status guard)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    txInvoiceFindUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-1",
      status: "PAID",
    });

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(409);
    expect(txInvoiceUpdate).not.toHaveBeenCalled();
  });

  it("404 when row exists but for another tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession()); // tnt-1
    txInvoiceFindUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-other",
      status: "DRAFT",
    });

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(404);
    expect(txInvoiceUpdate).not.toHaveBeenCalled();
  });

  it("404 when row missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    txInvoiceFindUnique.mockResolvedValueOnce(null);

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("403 when no session", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(403);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("403 for non-admin (TEACHER)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const { POST } = await import("../invoices/[id]/void/route");
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(403);
    expect($transaction).not.toHaveBeenCalled();
  });
});
