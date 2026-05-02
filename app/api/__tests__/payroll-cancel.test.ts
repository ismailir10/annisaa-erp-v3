/**
 * F-28 coverage for `POST /api/payroll/[id]/cancel`.
 *
 * The cancel handler reverses a DRAFT payroll run via:
 *   1. Compare-and-swap on `status: DRAFT` (handles concurrent cancel/approve).
 *   2. Cascade-style delete of `payrollItemLine` then `payrollItem`.
 *   3. Best-effort audit row.
 *
 * Tests below cover the happy path (DRAFT → cancelled with cascading deletes),
 * the not-DRAFT guard (APPROVED → 409), the CAS race (both readers see DRAFT,
 * second updateMany returns count: 0 → 409), tenant isolation (404), and
 * audit emission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const findUnique = vi.fn();
const updateMany = vi.fn();
const itemDeleteMany = vi.fn();
const lineDeleteMany = vi.fn();
const auditCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: {
      findUnique,
      updateMany,
    },
    payrollItem: {
      deleteMany: itemDeleteMany,
    },
    payrollItemLine: {
      deleteMany: lineDeleteMany,
    },
    auditLog: {
      create: auditCreate,
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
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
  itemDeleteMany.mockResolvedValue({ count: 3 });
  lineDeleteMany.mockResolvedValue({ count: 9 });
  auditCreate.mockResolvedValue({});
});

function cancelReq(): Request {
  return new Request("http://localhost/api/payroll/p1/cancel", {
    method: "POST",
  });
}

describe("POST /api/payroll/[id]/cancel — F-28", () => {
  it("DRAFT → 200 + cascading deletes (lines first, then items)", async () => {
    await mockSession(makeSession());
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("../payroll/[id]/cancel/route");
    const res = await POST(cancelReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p1", status: "DRAFT" },
      data: { status: "CANCELLED" },
    });
    expect(lineDeleteMany).toHaveBeenCalledWith({
      where: { payrollItem: { payrollRunId: "p1" } },
    });
    expect(itemDeleteMany).toHaveBeenCalledWith({
      where: { payrollRunId: "p1" },
    });
  });

  it("APPROVED → 409 (CAS lost the race or wrong status)", async () => {
    await mockSession(makeSession());
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "APPROVED", // not DRAFT
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    updateMany.mockResolvedValueOnce({ count: 0 });

    const { POST } = await import("../payroll/[id]/cancel/route");
    const res = await POST(cancelReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(409);
    // No deletes when CAS fails.
    expect(itemDeleteMany).not.toHaveBeenCalled();
    expect(lineDeleteMany).not.toHaveBeenCalled();
  });

  it("concurrent cancel race: two cancels, only the first succeeds", async () => {
    // Both callers see DRAFT in their findUnique, but only one updateMany
    // sees count: 1; the loser reports count: 0 and gets 409.
    await mockSession(makeSession());
    const draftRow = {
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    };
    findUnique.mockResolvedValueOnce(draftRow).mockResolvedValueOnce(draftRow);
    updateMany
      .mockResolvedValueOnce({ count: 1 }) // first writer wins
      .mockResolvedValueOnce({ count: 0 }); // second writer loses

    const { POST } = await import("../payroll/[id]/cancel/route");
    const [first, second] = await Promise.all([
      POST(cancelReq() as never, { params: Promise.resolve({ id: "p1" }) }),
      POST(cancelReq() as never, { params: Promise.resolve({ id: "p1" }) }),
    ]);

    const codes = [first.status, second.status].sort();
    expect(codes).toEqual([200, 409]);
  });

  it("cross-tenant → 404", async () => {
    await mockSession(makeSession()); // tenantId: t1
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t2", // different tenant
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });

    const { POST } = await import("../payroll/[id]/cancel/route");
    const res = await POST(cancelReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("audit row written on successful cancel", async () => {
    await mockSession(makeSession());
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    const { POST } = await import("../payroll/[id]/cancel/route");
    await POST(cancelReq() as never, { params: Promise.resolve({ id: "p1" }) });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          actorId: "u1",
          entity: "PayrollRun",
          entityId: "p1",
          action: "cancel",
        }),
      })
    );
  });
});
