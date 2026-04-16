import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    employee: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    employeeSalaryValue: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

// Mock next/cache to avoid runtime error
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function makeSession(role: SessionUser["role"]): SessionUser {
  return { id: "u1", email: "test@test.com", name: "Test", role, tenantId: "t1", employeeId: null, parentId: null };
}

describe("GET /api/employees/[id]/salary — role checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for SCHOOL_ADMIN", async () => {
    const { GET } = await import("../employees/[id]/salary/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));
    const req = new Request("http://localhost/api/employees/emp1/salary");
    const res = await GET(req as never, { params: Promise.resolve({ id: "emp1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 for SUPER_ADMIN", async () => {
    const { GET } = await import("../employees/[id]/salary/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SUPER_ADMIN"));
    const req = new Request("http://localhost/api/employees/emp1/salary");
    const res = await GET(req as never, { params: Promise.resolve({ id: "emp1" }) });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/employees — field stripping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes salary fields for SUPER_ADMIN", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      { id: "e1", nama: "Ali", bankAccountNo: "1234", bankName: "BSI", bpjsEnrolled: true, campus: { name: "A" } } as never,
    ]);
    vi.mocked(prisma.employee.count).mockResolvedValue(1);

    const { GET } = await import("../employees/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SUPER_ADMIN"));
    const req = new Request("http://localhost/api/employees");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).toHaveProperty("bankAccountNo");
    expect(body.data[0]).toHaveProperty("bankName");
    expect(body.data[0]).toHaveProperty("bpjsEnrolled");
  });

  it("strips salary fields for SCHOOL_ADMIN", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      { id: "e1", nama: "Ali", bankAccountNo: "1234", bankName: "BSI", bpjsEnrolled: true, campus: { name: "A" } } as never,
    ]);
    vi.mocked(prisma.employee.count).mockResolvedValue(1);

    const { GET } = await import("../employees/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));
    const req = new Request("http://localhost/api/employees");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0]).not.toHaveProperty("bankAccountNo");
    expect(body.data[0]).not.toHaveProperty("bankName");
    expect(body.data[0]).not.toHaveProperty("bpjsEnrolled");
  });
});
