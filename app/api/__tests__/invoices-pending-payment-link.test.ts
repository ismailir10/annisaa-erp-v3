import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/auth` transitively imports `@/lib/db`, which throws at import time
// when DATABASE_URL is unset (vitest env). Stub the db so the auth module
// can be loaded; we override `getSession` below.
vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { GET } from "../invoices/pending-payment-link/route";

function makeReq() {
  return new Request("http://localhost:3000/api/invoices/pending-payment-link");
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/invoices/pending-payment-link — auth", () => {
  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for GUARDIAN role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "GUARDIAN" as const,
    });

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/invoices/pending-payment-link — query shape", () => {
  it("scopes to tenant + PENDING_PAYMENT_LINK status, ordered createdAt asc, capped at 1000", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.invoice.count).mockResolvedValue(0 as never);

    await GET(makeReq() as never);

    const arg = vi.mocked(prisma.invoice.findMany).mock.calls[0][0];
    expect(arg?.where).toMatchObject({
      tenantId: "tnt-1",
      status: "PENDING_PAYMENT_LINK",
    });
    expect(arg?.orderBy).toEqual({ createdAt: "asc" });
    expect(arg?.take).toBe(1000);

    // Count query uses the same where clause for the overflow flag.
    const countArg = vi.mocked(prisma.invoice.count).mock.calls[0][0];
    expect(countArg?.where).toMatchObject({
      tenantId: "tnt-1",
      status: "PENDING_PAYMENT_LINK",
    });
  });
});

describe("GET /api/invoices/pending-payment-link — happy path", () => {
  it("returns the data + total in the documented shape", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        id: "inv-1",
        periodLabel: "April 2026",
        // Prisma Decimal-like — toString returns "500000".
        totalDue: { toString: () => "500000" },
        paymentLinkError: "Xendit 503",
        student: { name: "Aisyah" },
      },
      {
        id: "inv-2",
        periodLabel: "April 2026",
        totalDue: { toString: () => "750000" },
        paymentLinkError: null,
        student: { name: "Bilal" },
      },
    ] as never);
    vi.mocked(prisma.invoice.count).mockResolvedValue(2 as never);

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(2);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "inv-1",
      studentName: "Aisyah",
      periodLabel: "April 2026",
      totalDue: "500000",
      paymentLinkError: "Xendit 503",
    });
    expect(body.data[1]).toEqual({
      id: "inv-2",
      studentName: "Bilal",
      periodLabel: "April 2026",
      totalDue: "750000",
      paymentLinkError: null,
    });
  });

  it("surfaces total > 1000 even though the data array is capped at 1000", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
    // Real count vastly exceeds the take cap — orchestrator overflow path.
    vi.mocked(prisma.invoice.count).mockResolvedValue(1234 as never);

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1234);
  });
});
