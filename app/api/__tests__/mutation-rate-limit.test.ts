import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    salaryComponentDef: {
      create: vi.fn().mockResolvedValue({ id: "sc1" }),
    },
    invoice: {
      findUnique: vi.fn().mockResolvedValue({
        id: "inv1",
        tenantId: "t-rate-test",
        status: "DRAFT",
        totalDue: "100000",
        totalPaid: "0",
        sentAt: null,
        xenditPaymentUrl: null,
      }),
      findFirst: vi.fn().mockResolvedValue({ id: "inv1" }),
      update: vi.fn().mockResolvedValue({ id: "inv1" }),
    },
    employeeSalaryValue: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        $queryRaw: vi.fn().mockResolvedValue([]),
        invoice: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv1",
            tenantId: "t-rate-test",
            status: "DRAFT",
            totalDue: "100000",
            totalPaid: "0",
          }),
          update: vi.fn().mockResolvedValue({ id: "inv1" }),
        },
        payment: {
          create: vi.fn().mockResolvedValue({ id: "pay1" }),
          findMany: vi.fn().mockResolvedValue([{ amount: "1000" }]),
        },
        // Employee salary PUT (F-05) wraps upsert + audit in $transaction; the
        // rate-limit smoke fires 12 requests with empty arrays so findMany
        // returns [] and no upsert calls happen — only the audit row writes.
        employeeSalaryValue: {
          upsert: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      })
    ),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Use a real, but reset, in-memory rate limiter (do NOT mock it — the test
// is asserting that the actual middleware fires).
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  return await importOriginal<typeof import("@/lib/rate-limit")>();
});

const adminSession = {
  id: "u1",
  email: "a@a",
  name: "A",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-rate-test",
  employeeId: null,
  parentId: null,
  permissions: [],
  customRoleCode: null,
};

describe("Rate limit: POST /api/salary-components", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 after exceeding the limit (10 req/min)", async () => {
    const { POST } = await import("../salary-components/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const makeReq = () =>
      new Request("http://localhost/api/salary-components", {
        method: "POST",
        headers: { "x-forwarded-for": "10.10.10.10" },
        body: JSON.stringify({
          code: "BASE",
          label: "Base",
          category: "EARNING",
          calcType: "FIXED",
        }),
      });

    let lastStatus = 0;
    // Fire 12 requests; the limiter allows 10, blocks the rest.
    for (let i = 0; i < 12; i++) {
      const res = await POST(makeReq() as never);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("Rate limit: PUT /api/employees/[id]/salary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 after exceeding the limit (10 req/min)", async () => {
    const { PUT } = await import("../employees/[id]/salary/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const makeReq = () =>
      new Request("http://localhost/api/employees/emp1/salary", {
        method: "PUT",
        headers: { "x-forwarded-for": "10.10.10.13" },
        body: JSON.stringify([]),
      });
    const params = Promise.resolve({ id: "emp1" });

    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await PUT(makeReq() as never, { params } as never);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
