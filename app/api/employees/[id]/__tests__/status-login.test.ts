import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HR-4 (2026-09-29 full E2E): deactivating an employee left the linked User
 * ACTIVE, so the person could still sign in. Deactivate now sets the linked
 * User INACTIVE and drops its cached session; restore sets it back.
 */
const h = vi.hoisted(() => {
  const tx = {
    employee: { findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    requirePermission: vi.fn(),
    verifyTenantOwnership: vi.fn(),
    invalidateUserCache: vi.fn(),
    recordAudit: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: (cb: (tx: typeof h.tx) => unknown) => cb(h.tx) },
}));
vi.mock("@/lib/auth", () => ({ invalidateUserCache: h.invalidateUserCache }));
vi.mock("@/lib/auth-guards", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/auth-guard", () => ({ verifyTenantOwnership: h.verifyTenantOwnership }));
vi.mock("@/lib/audit", () => ({ recordAudit: h.recordAudit }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { POST as deactivate } from "../deactivate/route";
import { POST as restore } from "../restore/route";

const ctx = { params: Promise.resolve({ id: "emp-1" }) };
const req = () =>
  new NextRequest("http://localhost/api/employees/emp-1/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Resign" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({ session: { id: "u_admin", tenantId: "t-1", role: "SCHOOL_ADMIN" } });
  h.verifyTenantOwnership.mockResolvedValue(true);
  h.tx.employee.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "emp-1", ...data }));
  h.tx.employee.findUnique.mockResolvedValue({ id: "emp-1", status: "ACTIVE" });
  h.tx.user.findMany.mockResolvedValue([{ id: "u-emp", email: "guru@example.com" }]);
});

describe("POST /api/employees/[id]/deactivate — revokes login", () => {
  it("sets the linked User INACTIVE (never SUPER_ADMIN or the acting admin) and invalidates its cache", async () => {
    const res = await deactivate(req(), ctx);
    expect(res.status).toBe(200);

    const where = h.tx.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      employeeId: "emp-1",
      tenantId: "t-1",
      status: "ACTIVE",
      role: { not: "SUPER_ADMIN" },
      id: { not: "u_admin" },
    });
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-emp"] } },
      data: { status: "INACTIVE" },
    });
    expect(h.invalidateUserCache).toHaveBeenCalledWith("guru@example.com");
    expect(h.recordAudit.mock.calls[0][0].after).toMatchObject({ status: "INACTIVE" });
  });

  it("employee with no linked User: only the Employee changes", async () => {
    h.tx.user.findMany.mockResolvedValue([]);
    const res = await deactivate(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it("already-INACTIVE employee: no new audit row, but a still-ACTIVE linked User is revoked (heals pre-fix data)", async () => {
    h.tx.employee.findUnique.mockResolvedValue({ id: "emp-1", status: "INACTIVE" });
    const res = await deactivate(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.tx.employee.update).not.toHaveBeenCalled();
    expect(h.recordAudit).not.toHaveBeenCalled();
    expect(h.tx.user.updateMany).toHaveBeenCalledTimes(1);
    expect(h.invalidateUserCache).toHaveBeenCalledWith("guru@example.com");
  });

  it("404 for another tenant's employee: nothing is touched", async () => {
    h.verifyTenantOwnership.mockResolvedValue(false);
    const res = await deactivate(req(), ctx);
    expect(res.status).toBe(404);
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/employees/[id]/restore — re-enables login", () => {
  it("sets the linked User back to ACTIVE and invalidates its cache", async () => {
    h.tx.employee.findUnique.mockResolvedValue({ id: "emp-1", status: "INACTIVE" });
    const res = await restore(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-emp"] } },
      data: { status: "ACTIVE" },
    });
    expect(h.invalidateUserCache).toHaveBeenCalledWith("guru@example.com");
    expect(h.recordAudit.mock.calls[0][0].after).toMatchObject({ status: "ACTIVE" });
  });

  it("already-ACTIVE employee is a no-op", async () => {
    const res = await restore(req(), ctx);
    expect(res.status).toBe(200);
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
  });
});
