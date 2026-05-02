/**
 * Compare-and-swap coverage for `POST /api/payroll/[id]/approve`.
 *
 * The route used to read `status === "DRAFT"`, then update inside a
 * $transaction without serializable isolation — two concurrent approves
 * both passed the check and double-flipped the row. Now the flip is a
 * single `updateMany` with the status predicate, returning `count: 0`
 * when the row was no longer DRAFT.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const findUnique = vi.fn();
const updateMany = vi.fn();
const itemFindMany = vi.fn();
const attendanceUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: {
      findUnique,
      updateMany,
    },
    payrollItem: {
      findMany: itemFindMany,
    },
    attendanceRecord: {
      updateMany: attendanceUpdateMany,
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeSession(role: SessionUser["role"]): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
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
  itemFindMany.mockResolvedValue([]);
  attendanceUpdateMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/payroll/[id]/approve — CAS", () => {
  it("flips DRAFT → APPROVED when row is in DRAFT state", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("../payroll/[id]/approve/route");
    const res = await POST({} as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p1", status: "DRAFT" },
      data: expect.objectContaining({
        status: "APPROVED",
        approvedBy: "u1",
      }),
    });
  });

  it("returns 409 when the CAS finds count: 0 (lost the race or already-approved)", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    // Concurrent approver flipped the row before us.
    updateMany.mockResolvedValueOnce({ count: 0 });

    const { POST } = await import("../payroll/[id]/approve/route");
    const res = await POST({} as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(409);
    // Attendance lock should NOT run when the CAS lost the race.
    expect(attendanceUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when payroll belongs to another tenant", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t2", // different tenant
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });

    const { POST } = await import("../payroll/[id]/approve/route");
    const res = await POST({} as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("locks attendance after a successful flip", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    updateMany.mockResolvedValueOnce({ count: 1 });
    itemFindMany.mockResolvedValueOnce([{ employeeId: "e1" }, { employeeId: "e2" }]);

    const { POST } = await import("../payroll/[id]/approve/route");
    await POST({} as never, { params: Promise.resolve({ id: "p1" }) });

    expect(attendanceUpdateMany).toHaveBeenCalledWith({
      where: {
        employeeId: { in: ["e1", "e2"] },
        date: { gte: "2026-04-01", lte: "2026-04-30" },
      },
      data: { isLocked: true },
    });
  });
});
