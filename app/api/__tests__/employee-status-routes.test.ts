/**
 * F-13 coverage for `POST /api/employees/[id]/deactivate` and `/restore`.
 *
 * Guarantees:
 *   1. Each writes the new status atomically with an audit row inside the
 *      same `prisma.$transaction` (audit re-throws abort the status flip).
 *   2. Idempotency: a second call to the same endpoint while the row is
 *      already in the target state is a 200 no-op AND skips the audit
 *      write (avoids audit noise from retries/UI double-clicks).
 *   3. Cross-tenant access returns 404 (verifyTenantOwnership gate).
 *   4. Optional `{reason}` body lands in the audit `after` payload.
 *   5. Permission gate: a session lacking `employees.edit` gets 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const employeeFindUnique = vi.fn();
const employeeUpdate = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    employee: {
      findUnique: employeeFindUnique,
      update: employeeUpdate,
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

const verifyTenantOwnership = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: (...args: unknown[]) => verifyTenantOwnership(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
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

async function mockSession(s: SessionUser | null) {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(s);
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyTenantOwnership.mockResolvedValue(true);
  // Default $transaction wires the same mocks onto the tx client so route
  // code that uses `tx.employee.findUnique`/`tx.employee.update`/
  // `tx.auditLog.create` exercises the same spies.
  transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      employee: {
        findUnique: employeeFindUnique,
        update: employeeUpdate,
      },
      auditLog: { create: auditCreate },
    }),
  );
  employeeUpdate.mockResolvedValue({ id: "emp-1", status: "INACTIVE" });
  auditCreate.mockResolvedValue({});
});

describe("POST /api/employees/[id]/deactivate — F-13", () => {
  it("flips status ACTIVE → INACTIVE and writes the audit row in the same transaction", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    employeeFindUnique.mockResolvedValueOnce({ status: "ACTIVE" });

    const { POST } = await import("../employees/[id]/deactivate/route");
    const req = new Request("http://localhost/api/employees/emp-1/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Pensiun" }),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    expect(employeeUpdate).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { status: "INACTIVE" },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        actorId: "u1",
        entity: "Employee",
        entityId: "emp-1",
        action: "deactivate",
        before: { status: "ACTIVE" },
        after: { status: "INACTIVE", reason: "Pensiun" },
      }),
    });
  });

  it("idempotent — second call on already-INACTIVE returns 200 with no audit row", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    employeeFindUnique
      // tx prelude check
      .mockResolvedValueOnce({ status: "INACTIVE" })
      // post-update re-fetch returns same row
      .mockResolvedValueOnce({ id: "emp-1", status: "INACTIVE" });

    const { POST } = await import("../employees/[id]/deactivate/route");
    const req = new Request("http://localhost/api/employees/emp-1/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);
    expect(employeeUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("404 when the employee belongs to a different tenant", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    verifyTenantOwnership.mockResolvedValueOnce(false);

    const { POST } = await import("../employees/[id]/deactivate/route");
    const req = new Request("http://localhost/api/employees/emp-1/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
    expect(employeeUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("403 when the session lacks employees.edit", async () => {
    await mockSession({
      ...makeSession("SCHOOL_ADMIN"),
      // hr.view alone — explicitly no employees.edit
      permissions: ["hr.view"],
    });

    const { POST } = await import("../employees/[id]/deactivate/route");
    const req = new Request("http://localhost/api/employees/emp-1/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("employees.edit");
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/employees/[id]/restore — F-13", () => {
  it("flips status INACTIVE → ACTIVE and writes the audit row in the same transaction", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    employeeFindUnique.mockResolvedValueOnce({ status: "INACTIVE" });
    employeeUpdate.mockResolvedValueOnce({ id: "emp-1", status: "ACTIVE" });

    const { POST } = await import("../employees/[id]/restore/route");
    const req = new Request("http://localhost/api/employees/emp-1/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Kembali aktif" }),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);
    expect(employeeUpdate).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { status: "ACTIVE" },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "Employee",
        entityId: "emp-1",
        action: "restore",
        before: { status: "INACTIVE" },
        after: { status: "ACTIVE", reason: "Kembali aktif" },
      }),
    });
  });

  it("idempotent — restoring an already-ACTIVE employee is a no-op", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    employeeFindUnique
      .mockResolvedValueOnce({ status: "ACTIVE" })
      .mockResolvedValueOnce({ id: "emp-1", status: "ACTIVE" });

    const { POST } = await import("../employees/[id]/restore/route");
    const req = new Request("http://localhost/api/employees/emp-1/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(200);
    expect(employeeUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("404 across tenants on restore as well", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    verifyTenantOwnership.mockResolvedValueOnce(false);

    const { POST } = await import("../employees/[id]/restore/route");
    const req = new Request("http://localhost/api/employees/emp-1/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "emp-1" }),
    });

    expect(res.status).toBe(404);
    expect(employeeUpdate).not.toHaveBeenCalled();
  });
});
