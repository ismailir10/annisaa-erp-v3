import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HR-1: editing a role is subject to the same subset rule as creating one —
 * including a role currently assigned to the actor (self-escalation by editing
 * one's own role instead of assigning a new one).
 */
const { getSession, roleFindUnique, roleUpdate, userFindMany, invalidateUserCache } = vi.hoisted(() => ({
  getSession: vi.fn(),
  roleFindUnique: vi.fn(),
  roleUpdate: vi.fn(),
  userFindMany: vi.fn(),
  invalidateUserCache: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    role: { findUnique: roleFindUnique, update: roleUpdate },
    user: { findMany: userFindMany },
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

const ctx = { params: Promise.resolve({ id: "r-1" }) };
const actor = {
  id: "u-admin",
  tenantId: "t-1",
  role: "SCHOOL_ADMIN",
  permissions: ["users.edit", "invoices.view", "students.view"],
};

function put(body: unknown) {
  return new NextRequest("http://localhost/api/roles/r-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const storedRole = (permissions: string[]) => ({
  id: "r-1",
  tenantId: "t-1",
  isSystem: false,
  name: "Kasir",
  permissions: JSON.stringify(permissions),
});

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(actor);
  roleFindUnique.mockResolvedValue(storedRole(["invoices.view"]));
  roleUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "r-1", ...data }));
  userFindMany.mockResolvedValue([{ email: "holder@example.com" }]);
});

describe("PUT /api/roles/[id] — escalation guard", () => {
  it("403 when the edit adds a permission the actor does not hold (own assigned role)", async () => {
    const res = await PUT(put({ permissions: ["invoices.view", "payroll.approve"] }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).missing).toEqual(["payroll.approve"]);
    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it("403 when the stored role already carries permissions beyond the actor's, even for a rename", async () => {
    roleFindUnique.mockResolvedValue(storedRole(["invoices.view", "payroll.view"]));
    const res = await PUT(put({ name: "Ganti nama" }), ctx);
    expect(res.status).toBe(403);
    expect(roleUpdate).not.toHaveBeenCalled();
  });

  it("allows narrowing to a subset and invalidates the holders' cached sessions", async () => {
    const res = await PUT(put({ permissions: ["students.view"] }), ctx);
    expect(res.status).toBe(200);
    expect(roleUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateUserCache).toHaveBeenCalledWith("holder@example.com");
  });

  it("SUPER_ADMIN may widen any role (unchanged)", async () => {
    getSession.mockResolvedValue({ id: "u-super", tenantId: "t-1", role: "SUPER_ADMIN", permissions: [] });
    roleFindUnique.mockResolvedValue(storedRole(["payroll.view"]));
    const res = await PUT(put({ permissions: ["payroll.view", "payroll.approve", "hr.view"] }), ctx);
    expect(res.status).toBe(200);
  });

  it("404 for a role in another tenant", async () => {
    roleFindUnique.mockResolvedValue({ ...storedRole([]), tenantId: "other" });
    const res = await PUT(put({ name: "x" }), ctx);
    expect(res.status).toBe(404);
  });
});
