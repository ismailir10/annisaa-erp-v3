/**
 * F-21 coverage for `GET /api/leave/stats`.
 *
 * Contract:
 *   - Single `prisma.leaveRequest.groupBy` call (no triple-list pattern).
 *   - Tenant-scoped via the related employee's `tenantId`.
 *   - Missing status buckets default to 0.
 *   - 403 for sessions without `leave.view`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const leaveGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    leaveRequest: { groupBy: leaveGroupBy },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeSession(role: SessionUser["role"]): SessionUser {
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

describe("GET /api/leave/stats — F-21", () => {
  it("returns aggregate counts and scopes the groupBy via employee.tenantId", async () => {
    leaveGroupBy.mockResolvedValue([
      { status: "PENDING", _count: { status: 4 } },
      { status: "APPROVED", _count: { status: 7 } },
      { status: "REJECTED", _count: { status: 2 } },
    ]);
    await mockSession(makeSession("SUPER_ADMIN"));

    const { GET } = await import("../leave/stats/route");
    const res = await GET(new Request("http://localhost/api/leave/stats") as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ total: 13, pending: 4, approved: 7, rejected: 2 });
    expect(leaveGroupBy).toHaveBeenCalledTimes(1);
    expect(leaveGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status"],
        where: { employee: { tenantId: "t-1" } },
      }),
    );
  });

  it("missing status buckets default to 0", async () => {
    leaveGroupBy.mockResolvedValue([
      { status: "APPROVED", _count: { status: 3 } },
    ]);
    await mockSession(makeSession("SUPER_ADMIN"));

    const { GET } = await import("../leave/stats/route");
    const res = await GET(new Request("http://localhost/api/leave/stats") as never);
    const json = await res.json();

    expect(json).toEqual({ total: 3, pending: 0, approved: 3, rejected: 0 });
  });

  it("403 when session lacks leave.view permission", async () => {
    await mockSession({
      ...makeSession("SCHOOL_ADMIN"),
      permissions: ["hr.view"], // explicitly no leave.view
    });

    const { GET } = await import("../leave/stats/route");
    const res = await GET(new Request("http://localhost/api/leave/stats") as never);

    expect(res.status).toBe(403);
    expect(leaveGroupBy).not.toHaveBeenCalled();
  });
});
