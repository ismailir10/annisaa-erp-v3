/**
 * Coverage for `GET /api/leave/balance` — teacher self-service leave balance.
 *
 * Contract:
 *   - Requires session with both employeeId AND tenantId; returns 401 (body
 *     `null`) otherwise. Note: route does NOT role-gate on TEACHER — any
 *     authenticated employee with an employeeId can read their own balance.
 *   - Defense-in-depth: looks up the employee via findFirst with
 *     `{ id: session.employeeId, tenantId: session.tenantId }`.
 *   - Sums APPROVED ANNUAL + SICK leave days for the current year via
 *     two parallel `aggregate({ _sum: { days: true } })` calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const employeeFindFirst = vi.fn();
const leaveAggregate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    employee: { findFirst: employeeFindFirst },
    leaveRequest: { aggregate: leaveAggregate },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

function teacherSession(overrides: Partial<{
  employeeId: string | null;
  tenantId: string | null;
  role: "TEACHER" | "SUPER_ADMIN" | "GUARDIAN" | "SCHOOL_ADMIN";
}> = {}) {
  return {
    id: "u-1",
    email: "t@t.com",
    name: "T",
    role: overrides.role ?? "TEACHER",
    tenantId: overrides.tenantId === undefined ? "t-1" : overrides.tenantId,
    employeeId: overrides.employeeId === undefined ? "emp-1" : overrides.employeeId,
    parentId: null,
    permissions: [] as string[],
    customRoleCode: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leave/balance", () => {
  it("returns annual + sick balance shape with used days summed", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacherSession());
    employeeFindFirst.mockResolvedValueOnce({
      leaveBalanceAnnual: 12,
      leaveBalanceSick: 6,
    });
    // Two aggregate calls fire in parallel — order matches the route's
    // [annualAgg, sickAgg] destructure.
    leaveAggregate
      .mockResolvedValueOnce({ _sum: { days: 3 } }) // annual
      .mockResolvedValueOnce({ _sum: { days: 2 } }); // sick

    const { GET } = await import("../leave/balance/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      annual: { total: 12, used: 3, remaining: 9 },
      sick: { total: 6, used: 2, remaining: 4 },
    });
    // Defense-in-depth scope: findFirst must include tenantId.
    expect(employeeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "emp-1", tenantId: "t-1" },
      }),
    );
  });

  it("treats null _sum.days as 0 used", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacherSession());
    employeeFindFirst.mockResolvedValueOnce({
      leaveBalanceAnnual: 12,
      leaveBalanceSick: 6,
    });
    leaveAggregate
      .mockResolvedValueOnce({ _sum: { days: null } })
      .mockResolvedValueOnce({ _sum: { days: null } });

    const { GET } = await import("../leave/balance/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.annual).toEqual({ total: 12, used: 0, remaining: 12 });
    expect(json.sick).toEqual({ total: 6, used: 0, remaining: 6 });
  });

  it("401 when session has no employeeId (parent / admin without emp record)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacherSession({ employeeId: null }));

    const { GET } = await import("../leave/balance/route");
    const res = await GET();

    expect(res.status).toBe(401);
    expect(employeeFindFirst).not.toHaveBeenCalled();
  });

  it("401 when no session at all", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);

    const { GET } = await import("../leave/balance/route");
    const res = await GET();

    expect(res.status).toBe(401);
    expect(employeeFindFirst).not.toHaveBeenCalled();
  });

  it("404 when employeeId belongs to a different tenant (defense-in-depth)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacherSession());
    // findFirst returns null because the where clause demands tenantId match.
    employeeFindFirst.mockResolvedValueOnce(null);

    const { GET } = await import("../leave/balance/route");
    const res = await GET();

    expect(res.status).toBe(404);
    expect(leaveAggregate).not.toHaveBeenCalled();
  });
});
