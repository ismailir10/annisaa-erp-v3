import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../payroll/route";
import type { SessionUser } from "@/lib/auth";

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

function makeSession(role: SessionUser["role"]): SessionUser {
  return { id: "u1", email: "test@test.com", name: "Test", role, tenantId: "t1", employeeId: null, parentId: null, permissions: [], customRoleCode: null };
}

// TEACHER 403, SUPER_ADMIN 200, and null-session 401 were dropped from here
// — all three are already covered in payroll-list.test.ts (which also
// checks pagination/tenant-scoping behavior alongside the status codes).
// SCHOOL_ADMIN and GUARDIAN are role-specific rejections payroll-list.test.ts
// never exercises, so they stay.
describe("GET /api/payroll — role checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for SCHOOL_ADMIN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.missing).toBe("payroll.view");
  });

  it("returns 403 for GUARDIAN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
  });
});
