import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory tx mock — the route's transaction body issues two operations:
//   1. nextInvoiceNumber → tx.$queryRaw twice (advisory lock + last-number lookup)
//   2. tx.invoice.create({ ..., lines: { create: [...] } }) → returns the new id
//
// The fee-component lookup, enrollment check, and guardian lookup happen on the
// outer prisma client (see vi.mock below).
const txMock = {
  $queryRaw: vi.fn(),
  invoice: {
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    studentEnrollment: { findFirst: vi.fn() },
    feeComponentDef: { findMany: vi.fn() },
    studentGuardian: { findFirst: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});


// Mock the Xendit helper at the boundary the route imports it from. Its own
// DB writes are out of scope here — we control success/failure/null directly.
vi.mock("@/lib/xendit/helpers", () => ({
  createXenditSessionForInvoice: vi.fn(),
}));

import { POST } from "../invoices/route";

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

const validBody = {
  studentId: "s-1",
  periodLabel: "April 2026",
  dueDate: "2026-04-30",
  lines: [
    { feeComponentId: "fc-1", amount: 100_000 },
    { feeComponentId: "fc-2", amount: 50_000 },
  ],
};

/**
 * Wire the prisma + tx mocks for a happy-path manual create.
 * Returns the freshly-created invoice id used downstream by Xendit + re-fetch.
 */
function wireHappyPath({
  invoiceId = "inv-new",
  invoiceNumber = "INV-2026-0001",
  totalDue = 150_000,
  finalStatus = "SENT",
  paymentLinkError = null as string | null,
  xenditPaymentUrl = "https://checkout.xendit.co/web/inv-new" as string | null,
  xenditSessionId = "xnd-sess-1" as string | null,
}: {
  invoiceId?: string;
  invoiceNumber?: string;
  totalDue?: number;
  finalStatus?: string;
  paymentLinkError?: string | null;
  xenditPaymentUrl?: string | null;
  xenditSessionId?: string | null;
} = {}) {
  // nextInvoiceNumber: lock query + last-number SELECT (empty → seeds at 0001).
  txMock.$queryRaw.mockResolvedValueOnce([]); // advisory lock
  txMock.$queryRaw.mockResolvedValueOnce([]); // no prior invoice → 0001

  txMock.invoice.create.mockResolvedValueOnce({ id: invoiceId });

  return { invoiceId, invoiceNumber, totalDue, finalStatus, paymentLinkError, xenditPaymentUrl, xenditSessionId };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockReset();
  txMock.invoice.create.mockReset();
});

describe("POST /api/invoices — auth", () => {
  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentEnrollment.findFirst).not.toHaveBeenCalled();
  });

});

describe("POST /api/invoices — validation", () => {
  it("returns 400 when studentId missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({
        periodLabel: "April 2026",
        dueDate: "2026-04-30",
        lines: [{ feeComponentId: "fc-1", amount: 100_000 }],
      }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("returns 400 when lines is empty", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ ...validBody, lines: [] }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when a line amount is negative", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({
        ...validBody,
        lines: [{ feeComponentId: "fc-1", amount: -100 }],
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when dueDate format is wrong", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ ...validBody, dueDate: "30/04/2026" }) as never
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/invoices — business validation", () => {
  it("returns 400 'tidak terdaftar aktif' when student has no active enrollment", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak terdaftar aktif/i);
    // Must short-circuit before fee-component lookup or transaction.
    expect(prisma.feeComponentDef.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 'tidak valid' when a fee component is cross-tenant or disabled", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue({
      studentId: "s-1",
    } as never);

    // Body asks for fc-1 + fc-2; we return only fc-1 → simulates fc-2 being
    // owned by another tenant or disabled.
    vi.mocked(prisma.feeComponentDef.findMany).mockResolvedValue([
      { id: "fc-1", label: "SPP" },
    ] as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak valid/i);
    // Transaction must not run.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices — happy path", () => {
  it("Xendit succeeds → 201, status=SENT, xenditPaymentUrl set, totalDue computed server-side", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue({
      studentId: "s-1",
    } as never);
    vi.mocked(prisma.feeComponentDef.findMany).mockResolvedValue([
      { id: "fc-1", label: "SPP" },
      { id: "fc-2", label: "Seragam" },
    ] as never);
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue({
      parentId: "p-1",
    } as never);

    wireHappyPath();

    vi.mocked(createXenditSessionForInvoice).mockResolvedValue({
      paymentUrl: "https://checkout.xendit.co/web/inv-new",
    });

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    // The post-Xendit re-fetch returns the final shape.
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-new",
      invoiceNumber: "INV-2026-0001",
      totalDue: 150_000,
      status: "SENT",
      xenditPaymentUrl: "https://checkout.xendit.co/web/inv-new",
      xenditSessionId: "xnd-sess-1",
      paymentLinkError: null,
      lines: [
        { feeComponentId: "fc-1", labelSnapshot: "SPP", amount: 100_000, finalAmount: 100_000 },
        { feeComponentId: "fc-2", labelSnapshot: "Seragam", amount: 50_000, finalAmount: 50_000 },
      ],
    } as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.id).toBe("inv-new");
    expect(body.status).toBe("SENT");
    expect(body.xenditPaymentUrl).toBe("https://checkout.xendit.co/web/inv-new");
    expect(body.xenditError).toBeUndefined();
    expect(body.lines).toHaveLength(2);

    // The status flip update — paymentLinkError cleared, sentAt set.
    const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0]?.[0];
    expect(updateCall?.where).toEqual({ id: "inv-new" });
    expect(updateCall?.data).toMatchObject({ status: "SENT", paymentLinkError: null });
    expect(updateCall?.data?.sentAt).toBeInstanceOf(Date);

    // Server-side totalDue: assert the Decimal passed to invoice.create equals 150_000.
    // (Client-supplied total is ignored — there isn't one in validBody.)
    const createCall = txMock.invoice.create.mock.calls[0]?.[0];
    expect(Number(createCall?.data?.totalDue)).toBe(150_000);
    expect(createCall?.data?.status).toBe("PENDING_PAYMENT_LINK");
    expect(createCall?.data?.parentId).toBe("p-1");
  });
});

describe("POST /api/invoices — Xendit failure paths", () => {
  it("helper throws → 201, status=PENDING_PAYMENT_LINK, paymentLinkError set, xenditError surfaced", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue({
      studentId: "s-1",
    } as never);
    vi.mocked(prisma.feeComponentDef.findMany).mockResolvedValue([
      { id: "fc-1", label: "SPP" },
      { id: "fc-2", label: "Seragam" },
    ] as never);
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue({
      parentId: "p-1",
    } as never);

    wireHappyPath();

    vi.mocked(createXenditSessionForInvoice).mockRejectedValue(new Error("Xendit 503"));
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-new",
      invoiceNumber: "INV-2026-0001",
      totalDue: 150_000,
      status: "PENDING_PAYMENT_LINK",
      xenditPaymentUrl: null,
      xenditSessionId: null,
      paymentLinkError: "Xendit 503",
      lines: [],
    } as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.status).toBe("PENDING_PAYMENT_LINK");
    expect(body.paymentLinkError).toBe("Xendit 503");
    expect(body.xenditError).toBe("Xendit 503");

    // The failure update writes paymentLinkError; status was already
    // PENDING_PAYMENT_LINK from invoice.create, so no status flip needed.
    const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0]?.[0];
    expect(updateCall?.where).toEqual({ id: "inv-new" });
    expect(updateCall?.data).toEqual({ paymentLinkError: "Xendit 503" });
  });

  it("helper returns null → 201, status=PENDING_PAYMENT_LINK, xenditError = 'Gagal membuat sesi pembayaran'", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue({
      studentId: "s-1",
    } as never);
    vi.mocked(prisma.feeComponentDef.findMany).mockResolvedValue([
      { id: "fc-1", label: "SPP" },
      { id: "fc-2", label: "Seragam" },
    ] as never);
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue({
      parentId: "p-1",
    } as never);

    wireHappyPath();

    // Helper-returns-null branch: TOCTOU guard tripped (PAID/CANCELLED mid-flight,
    // or remaining went to 0). Should be surfaced as a diagnostic.
    vi.mocked(createXenditSessionForInvoice).mockResolvedValue(null);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-new",
      invoiceNumber: "INV-2026-0001",
      totalDue: 150_000,
      status: "PENDING_PAYMENT_LINK",
      xenditPaymentUrl: null,
      xenditSessionId: null,
      paymentLinkError: "Gagal membuat sesi pembayaran",
      lines: [],
    } as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.status).toBe("PENDING_PAYMENT_LINK");
    expect(body.xenditError).toBe("Gagal membuat sesi pembayaran");

    const updateCall = vi.mocked(prisma.invoice.update).mock.calls[0]?.[0];
    expect(updateCall?.data).toEqual({
      paymentLinkError: "Gagal membuat sesi pembayaran",
    });
  });
});
