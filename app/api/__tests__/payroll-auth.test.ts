import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../payroll/route";

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeReq() {
  return new Request("http://localhost:3000/api/payroll");
}

function makeSession(role: string) {
  return { id: "u1", email: "test@test.com", name: "Test", role, tenantId: "t1", employeeId: null, parentId: null };
}

describe("GET /api/payroll — role checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for SCHOOL_ADMIN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 for TEACHER", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
  });

  it("returns 403 for GUARDIAN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
  });

  it("returns 200 for SUPER_ADMIN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SUPER_ADMIN"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
  });

  it("returns 403 when session is null", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
  });
});
