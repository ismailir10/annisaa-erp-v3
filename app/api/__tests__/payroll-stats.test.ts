/**
 * Coverage for `GET /api/payroll/stats` — aggregate counts for the payroll
 * dashboard cards. Replaces three pageSize=1 list calls with a single
 * groupBy. Verifies the tenant-scoped where clause + permission gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const groupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: { groupBy },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return {
    id: "u1",
    email: "a@a",
    name: "A",
    role,
    tenantId: "t-1",
    employeeId: null,
    parentId: null,
    permissions: getSystemRolePermissions(role),
    customRoleCode: null,
  };
}

async function mockSession(s: SessionUser | null) {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(s);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq() {
  return new Request("http://localhost/api/payroll/stats");
}

describe("GET /api/payroll/stats", () => {
  it("returns aggregate shape and scopes the groupBy by tenantId", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    groupBy.mockResolvedValue([
      { status: "DRAFT", _count: { status: 4 } },
      { status: "APPROVED", _count: { status: 2 } },
      { status: "SLIPS_SENT", _count: { status: 1 } },
    ]);

    const { GET } = await import("../payroll/stats/route");
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ total: 7, draft: 4, approved: 2, slipsSent: 1 });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status"],
        where: { tenantId: "t-1" },
      }),
    );
  });

  it("empty tenant returns zeroed shape", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    groupBy.mockResolvedValue([]);

    const { GET } = await import("../payroll/stats/route");
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ total: 0, draft: 0, approved: 0, slipsSent: 0 });
  });

  it("returns 401 when no session", async () => {
    await mockSession(null);

    const { GET } = await import("../payroll/stats/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(401);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin (TEACHER lacks payroll.view)", async () => {
    await mockSession(makeSession("TEACHER"));

    const { GET } = await import("../payroll/stats/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(403);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("returns 403 for SCHOOL_ADMIN (payroll.view is SUPER_ADMIN-only)", async () => {
    await mockSession(makeSession("SCHOOL_ADMIN"));

    const { GET } = await import("../payroll/stats/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(403);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
