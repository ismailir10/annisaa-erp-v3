import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HR-1 (2026-09-29 full E2E): a SCHOOL_ADMIN could POST a role carrying
 * payroll/HR permissions and then assign it to themselves. A non-SUPER_ADMIN
 * may only create a role whose permissions they hold themselves.
 */
const { getSession, roleFindUnique, roleCreate } = vi.hoisted(() => ({
  getSession: vi.fn(),
  roleFindUnique: vi.fn(),
  roleCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { role: { findUnique: roleFindUnique, create: roleCreate } },
}));
vi.mock("@/lib/auth", () => ({
  getSession,
  isAdminRole: (r: string) => r === "SUPER_ADMIN" || r === "SCHOOL_ADMIN",
  invalidateUserCache: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "../route";
import { getSystemRolePermissions } from "@/lib/permissions";

const schoolAdmin = {
  id: "u_school_admin",
  tenantId: "t-1",
  role: "SCHOOL_ADMIN",
  permissions: getSystemRolePermissions("SCHOOL_ADMIN"),
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(schoolAdmin);
  roleFindUnique.mockResolvedValue(null);
  roleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "r-new", ...data }));
});

describe("POST /api/roles — escalation guard", () => {
  it("403 when a SCHOOL_ADMIN includes permissions they do not hold (payroll/hr)", async () => {
    const res = await POST(post({ name: "Eskalasi", code: "ESC", permissions: ["hr.view", "payroll.view", "users.edit"] }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("izin yang tidak Anda miliki");
    expect(body.missing).toEqual(["hr.view", "payroll.view"]);
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it("allows a role whose permissions are a subset of the actor's", async () => {
    const res = await POST(post({ name: "Kasir", code: "KASIR", permissions: ["invoices.view", "payments.record"] }));
    expect(res.status).toBe(201);
    expect(roleCreate).toHaveBeenCalledTimes(1);
  });

  it("uses the session's effective (custom-role) permissions, not the enum role", async () => {
    getSession.mockResolvedValue({ ...schoolAdmin, permissions: ["users.edit", "invoices.view"] });
    const res = await POST(post({ name: "Lebar", code: "LEBAR", permissions: ["students.view"] }));
    expect(res.status).toBe(403);
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it("403 for an admin whose custom role lacks users.edit", async () => {
    getSession.mockResolvedValue({ ...schoolAdmin, permissions: ["students.view"] });
    const res = await POST(post({ name: "X", code: "X", permissions: [] }));
    expect(res.status).toBe(403);
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN may grant any permission (unchanged)", async () => {
    getSession.mockResolvedValue({ id: "u_super_admin", tenantId: "t-1", role: "SUPER_ADMIN", permissions: [] });
    const res = await POST(post({ name: "HR", code: "HR", permissions: ["hr.view", "payroll.view", "payroll.approve"] }));
    expect(res.status).toBe(201);
  });

  it("still 400s on an unknown permission code before the escalation check", async () => {
    const res = await POST(post({ name: "Ngawur", code: "NGAWUR", permissions: ["nope.nope"] }));
    expect(res.status).toBe(400);
  });
});
