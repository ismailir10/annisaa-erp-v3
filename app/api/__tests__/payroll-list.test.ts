/**
 * Coverage for `GET /api/payroll` — paginated payroll-run list.
 * Verifies tenant scoping in both `findMany` + `count`, status filter
 * passthrough, empty-list shape, and the permission gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: { findMany, count },
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

function makeReq(qs = "") {
  return new Request(`http://localhost/api/payroll${qs}`);
}

describe("GET /api/payroll", () => {
  it("returns the paginated list scoped by tenant", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findMany.mockResolvedValueOnce([
      { id: "p1", tenantId: "t-1", status: "DRAFT", _count: { items: 5 } },
      { id: "p2", tenantId: "t-1", status: "APPROVED", _count: { items: 3 } },
    ]);
    count.mockResolvedValueOnce(2);

    const { GET } = await import("../payroll/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.pagination).toMatchObject({ total: 2 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1" },
      }),
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1" },
      }),
    );
  });

  it("applies status query-param into the where clause", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findMany.mockResolvedValueOnce([]);
    count.mockResolvedValueOnce(0);

    const { GET } = await import("../payroll/route");
    await GET(makeReq("?status=DRAFT") as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1", status: "DRAFT" },
      }),
    );
  });

  it("empty tenant returns 200 with data: [] and total: 0", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findMany.mockResolvedValueOnce([]);
    count.mockResolvedValueOnce(0);

    const { GET } = await import("../payroll/route");
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.pagination.total).toBe(0);
  });

  it("returns 401 when no session", async () => {
    await mockSession(null);

    const { GET } = await import("../payroll/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin (TEACHER lacks payroll.view)", async () => {
    await mockSession(makeSession("TEACHER"));

    const { GET } = await import("../payroll/route");
    const res = await GET(makeReq() as never);

    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });
});
