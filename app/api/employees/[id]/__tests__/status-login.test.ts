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

describe("linked admin logins need the same authority as the users page", () => {
  const linkedUsers = [
    { id: "u-t", email: "guru@example.com", role: "TEACHER" },
    { id: "u-a", email: "admin@example.com", role: "SCHOOL_ADMIN" },
    { id: "u-s", email: "owner@example.com", role: "SUPER_ADMIN" },
  ];
  const touchedIds = () => h.tx.user.updateMany.mock.calls[0][0].where.id.in;
  const asActor = (session: Record<string, unknown>) =>
    h.requirePermission.mockResolvedValue({ session: { tenantId: "t-1", ...session } });

  describe("restore", () => {
    beforeEach(() => {
      h.tx.employee.findUnique.mockResolvedValue({ id: "emp-1", status: "INACTIVE" });
      h.tx.user.findMany.mockResolvedValue(linkedUsers);
    });

    it("employees.edit alone re-enables the teacher login, never an admin or super-admin login", async () => {
      asActor({ id: "u_hr", role: "SCHOOL_ADMIN", permissions: ["employees.edit"] });
      expect((await restore(req(), ctx)).status).toBe(200);
      expect(touchedIds()).toEqual(["u-t"]);
      expect(h.invalidateUserCache).toHaveBeenCalledTimes(1);
      expect(h.invalidateUserCache).toHaveBeenCalledWith("guru@example.com");
    });

    it("users.edit also re-enables a SCHOOL_ADMIN login, still never a SUPER_ADMIN one", async () => {
      asActor({ id: "u_adm", role: "SCHOOL_ADMIN", permissions: ["employees.edit", "users.edit"] });
      await restore(req(), ctx);
      expect(touchedIds()).toEqual(["u-t", "u-a"]);
    });

    it("a SUPER_ADMIN actor re-enables every linked login", async () => {
      asActor({ id: "u_own", role: "SUPER_ADMIN" });
      await restore(req(), ctx);
      expect(touchedIds()).toEqual(["u-t", "u-a", "u-s"]);
    });

    it("nothing to re-enable: the employee is still restored, no user write", async () => {
      asActor({ id: "u_hr", role: "SCHOOL_ADMIN", permissions: ["employees.edit"] });
      h.tx.user.findMany.mockResolvedValue([linkedUsers[2]]);
      expect((await restore(req(), ctx)).status).toBe(200);
      expect(h.tx.employee.update).toHaveBeenCalled();
      expect(h.tx.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("deactivate", () => {
    beforeEach(() => {
      // SUPER_ADMIN is already excluded by the query itself.
      h.tx.user.findMany.mockResolvedValue(linkedUsers.slice(0, 2));
    });

    it("employees.edit alone revokes the teacher login but leaves a SCHOOL_ADMIN login alone", async () => {
      asActor({ id: "u_hr", role: "SCHOOL_ADMIN", permissions: ["employees.edit"] });
      expect((await deactivate(req(), ctx)).status).toBe(200);
      expect(touchedIds()).toEqual(["u-t"]);
    });

    it("users.edit also revokes a SCHOOL_ADMIN login", async () => {
      asActor({ id: "u_adm", role: "SCHOOL_ADMIN", permissions: ["employees.edit", "users.edit"] });
      await deactivate(req(), ctx);
      expect(touchedIds()).toEqual(["u-t", "u-a"]);
    });
  });
});
