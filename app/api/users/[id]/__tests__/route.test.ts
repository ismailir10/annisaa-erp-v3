import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HR-1: a non-SUPER_ADMIN must not change their own role/status, must not
 * touch a SUPER_ADMIN account, and must not assign a role holding permissions
 * they lack. SUPER_ADMIN behaviour is unchanged.
 */
const { getSession, userFindUnique, userUpdate, roleFindUnique, invalidateUserCache } = vi.hoisted(() => ({
  getSession: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  roleFindUnique: vi.fn(),
  invalidateUserCache: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: userFindUnique, update: userUpdate },
    role: { findUnique: roleFindUnique },
  },
}));
vi.mock("@/lib/auth", () => ({
  getSession,
  isAdminRole: (r: string) => r === "SUPER_ADMIN" || r === "SCHOOL_ADMIN",
  invalidateUserCache,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { PUT } from "../route";
import { getSystemRolePermissions } from "@/lib/permissions";

const actor = {
  id: "u_school_admin",
  tenantId: "t-1",
  role: "SCHOOL_ADMIN",
  permissions: getSystemRolePermissions("SCHOOL_ADMIN"),
};

const user = (over: Record<string, unknown> = {}) => ({
  id: "u-target",
  email: "target@example.com",
  tenantId: "t-1",
  role: "TEACHER",
  status: "ACTIVE",
  customRoleId: null,
  ...over,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function put(body: unknown, id = "u-target") {
  return {
    req: new NextRequest(`http://localhost/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx: ctx(id),
  };
}
const call = (body: unknown, id?: string) => {
  const p = put(body, id);
  return PUT(p.req, p.ctx);
};

const payrollRole = {
  id: "r-payroll",
  tenantId: "t-1",
  permissions: JSON.stringify(["hr.view", "payroll.view", "payroll.approve"]),
};
const kasirRole = { id: "r-kasir", tenantId: "t-1", permissions: JSON.stringify(["invoices.view"]) };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(actor);
  userFindUnique.mockResolvedValue(user());
  roleFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "r-payroll" ? payrollRole : where.id === "r-kasir" ? kasirRole : null,
  );
  userUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...user(), ...data }));
});

describe("PUT /api/users/[id] — escalation guard", () => {
  it("403 when a SCHOOL_ADMIN assigns themselves a role with payroll permissions (the HR-1 repro)", async () => {
    userFindUnique.mockResolvedValue(user({ id: "u_school_admin", role: "SCHOOL_ADMIN", email: "admin@example.com" }));
    const res = await call({ customRoleId: "r-payroll" }, "u_school_admin");
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("403 when a SCHOOL_ADMIN changes their own role even to a role they could otherwise assign", async () => {
    userFindUnique.mockResolvedValue(user({ id: "u_school_admin", role: "SCHOOL_ADMIN" }));
    const res = await call({ customRoleId: "r-kasir" }, "u_school_admin");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("sendiri");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows a no-op self edit (unchanged role and status)", async () => {
    userFindUnique.mockResolvedValue(user({ id: "u_school_admin", role: "SCHOOL_ADMIN", customRoleId: "r-kasir" }));
    const res = await call({ customRoleId: "r-kasir", status: "ACTIVE" }, "u_school_admin");
    expect(res.status).toBe(200);
  });

  it("403 when touching a SUPER_ADMIN account (deactivate, reassign)", async () => {
    userFindUnique.mockResolvedValue(user({ id: "u_super_admin", role: "SUPER_ADMIN" }));
    for (const body of [{ status: "INACTIVE" }, { customRoleId: "r-kasir" }, { customRoleId: null }]) {
      const res = await call(body, "u_super_admin");
      expect(res.status).toBe(403);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("403 when assigning another user a role holding permissions the actor lacks", async () => {
    const res = await call({ customRoleId: "r-payroll" });
    expect(res.status).toBe(403);
    expect((await res.json()).missing).toEqual(["hr.view", "payroll.view", "payroll.approve"]);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("403 when clearing a custom role would grant enum defaults the actor lacks", async () => {
    getSession.mockResolvedValue({ ...actor, permissions: ["users.edit"] });
    userFindUnique.mockResolvedValue(user({ customRoleId: "r-kasir" }));
    const res = await call({ customRoleId: null });
    expect(res.status).toBe(403);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows assigning a role within the actor's permissions and invalidates the session cache", async () => {
    const res = await call({ customRoleId: "r-kasir", status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateUserCache).toHaveBeenCalledWith("target@example.com", "target@example.com");
  });

  it("allows a SCHOOL_ADMIN to deactivate an ordinary user", async () => {
    const res = await call({ status: "INACTIVE" });
    expect(res.status).toBe(200);
    expect(userUpdate.mock.calls[0][0].data).toEqual({ status: "INACTIVE" });
    expect(invalidateUserCache).toHaveBeenCalled();
  });

  it("403 for an admin whose role lacks users.edit", async () => {
    getSession.mockResolvedValue({ ...actor, permissions: ["students.view"] });
    const res = await call({ status: "INACTIVE" });
    expect(res.status).toBe(403);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN may assign payroll roles and edit other super admins (unchanged)", async () => {
    getSession.mockResolvedValue({ id: "u_super_admin", tenantId: "t-1", role: "SUPER_ADMIN", permissions: [] });
    let res = await call({ customRoleId: "r-payroll" });
    expect(res.status).toBe(200);
    userFindUnique.mockResolvedValue(user({ id: "u-other-super", role: "SUPER_ADMIN" }));
    res = await call({ status: "INACTIVE" }, "u-other-super");
    expect(res.status).toBe(200);
  });

  it("still refuses a SUPER_ADMIN deactivating their own account", async () => {
    getSession.mockResolvedValue({ id: "u_super_admin", tenantId: "t-1", role: "SUPER_ADMIN", permissions: [] });
    userFindUnique.mockResolvedValue(user({ id: "u_super_admin", role: "SUPER_ADMIN" }));
    const res = await call({ status: "INACTIVE" }, "u_super_admin");
    expect(res.status).toBe(400);
  });
});
