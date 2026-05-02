/**
 * F-05 integration coverage for `PUT /api/employees/[id]/salary`.
 *
 * Three guarantees:
 *   1. `payroll.view`-only callers get 403 (writes require `payroll.edit`).
 *   2. A valid call writes both `EmployeeSalaryValue` AND an `AuditLog` row,
 *      and both happen inside the same `prisma.$transaction`. The audit row
 *      captures the FULL prior state (all components) and the new state.
 *   3. Validation kicks in before reaching the DB (negative value → 400).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const salaryUpsert = vi.fn();
const salaryFindMany = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    employeeSalaryValue: {
      upsert: salaryUpsert,
      findMany: salaryFindMany,
    },
    auditLog: {
      create: auditCreate,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

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

/**
 * Build a session that has only `payroll.view` (no `.create`). Uses
 * SCHOOL_ADMIN as the base role and overrides the permissions array so
 * `hasPermission` sees exactly one HR perm — the read perm.
 */
function viewOnlySession(): SessionUser {
  return {
    ...makeSession("SCHOOL_ADMIN"),
    permissions: ["payroll.view"],
  };
}

async function mockSession(s: SessionUser | null) {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(s);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction runs the callback immediately with a tx client
  // wired to the same mocks the route would use directly.
  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      employeeSalaryValue: {
        upsert: salaryUpsert,
        findMany: salaryFindMany,
      },
      auditLog: { create: auditCreate },
    })
  );
  salaryFindMany.mockResolvedValue([]);
  salaryUpsert.mockResolvedValue({});
  auditCreate.mockResolvedValue({});
});

describe("PUT /api/employees/[id]/salary — F-05", () => {
  it("403 when caller has only payroll.view (writes require payroll.edit)", async () => {
    await mockSession(viewOnlySession());

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: JSON.stringify([{ componentDefId: "comp-1", value: 1000 }]),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("payroll.edit");
    expect(salaryUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("writes both EmployeeSalaryValue rows AND an AuditLog row when caller has payroll.create", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: JSON.stringify([
        { componentDefId: "comp-1", value: 5_000_000 },
        { componentDefId: "comp-2", value: 250_000 },
      ]),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);

    // Both upserts ran (one per component).
    expect(salaryUpsert).toHaveBeenCalledTimes(2);
    expect(salaryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId_componentDefId: {
            employeeId: "emp-1",
            componentDefId: "comp-1",
          },
        },
        update: { value: 5_000_000 },
      })
    );

    // Audit row written via the transaction client. Empty `before` because
    // salaryFindMany defaults to []; `after` reflects the submitted items.
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        actorId: "u1",
        entity: "EmployeeSalaryValue",
        entityId: "emp-1",
        action: "update",
        before: [],
        after: [
          { componentDefId: "comp-1", value: 5_000_000 },
          { componentDefId: "comp-2", value: 250_000 },
        ],
      }),
    });

    // Whole batch went through one $transaction call.
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("audit `before` snapshot covers ALL prior salary values, not only those mutated", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));

    // 3 prior rows; submit only updates 1 of them.
    salaryFindMany.mockResolvedValueOnce([
      { componentDefId: "comp-1", value: "5000000" },
      { componentDefId: "comp-2", value: "250000" },
      { componentDefId: "comp-3", value: "100000" },
    ]);

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: JSON.stringify([{ componentDefId: "comp-1", value: 6_000_000 }]),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);

    // The findMany must NOT filter by the touched componentIds —
    // auditors need the full prior state.
    expect(salaryFindMany).toHaveBeenCalledWith({
      where: { employeeId: "emp-1" },
      select: { componentDefId: true, value: true },
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: [
          { componentDefId: "comp-1", value: 5_000_000 },
          { componentDefId: "comp-2", value: 250_000 },
          { componentDefId: "comp-3", value: 100_000 },
        ],
        after: [{ componentDefId: "comp-1", value: 6_000_000 }],
      }),
    });
  });

  it("400 when body is not an array", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: JSON.stringify({ componentDefId: "comp-1", value: 100 }),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
    expect(salaryUpsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("400 when a value is negative", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: JSON.stringify([{ componentDefId: "comp-1", value: -1 }]),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("400 when body is unparseable JSON", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));

    const { PUT } = await import("../employees/[id]/salary/route");
    const req = new Request("http://localhost/api/employees/emp-1/salary", {
      method: "PUT",
      body: "not json {",
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});
