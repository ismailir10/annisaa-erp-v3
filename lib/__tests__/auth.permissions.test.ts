import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Covers Task 1 of the super-admin-rbac-sidebar-fix cycle: `getSession()` must
 * populate `permissions` + `customRoleCode` on every resolution. Tests exercise
 * the demo-mode path because it has the same derivation logic as production
 * (both call through to derivePermissions) and is trivially mockable without a
 * Supabase fake.
 */

const prismaMock = {
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  tenant: { count: vi.fn().mockResolvedValue(1) },
  parent: { findFirst: vi.fn().mockResolvedValue(null) },
  employee: { findFirst: vi.fn().mockResolvedValue(null) },
};

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "school-erp-session" ? { value: "user-1" } : undefined,
  }),
}));

// Re-import a fresh module each test so demo-mode branch is hit predictably
// and module-scoped state (singleTenantCheckedAt) doesn't leak between cases.
async function loadAuth() {
  vi.resetModules();
  process.env.DEMO_MODE = "true";
  return import("@/lib/auth");
}

describe("getSession — permissions derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  it("SUPER_ADMIN with no customRole → delegates to getSystemRolePermissions", async () => {
    // Task 1 only wires the plumbing — Task 2 will broaden
    // getSystemRolePermissions("SUPER_ADMIN") to ALL_PERMISSIONS. This test
    // asserts whatever that helper currently returns, so it stays green
    // through the Task 2 rewrite without edits.
    const { getSession } = await loadAuth();
    const { getSystemRolePermissions } = await import("@/lib/permissions");
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "super@demo.local",
      name: "Super",
      role: "SUPER_ADMIN",
      tenantId: "t1",
      employeeId: null,
      parentId: null,
      customRoleId: null,
      customRole: null,
    });

    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session?.permissions).toEqual(
      getSystemRolePermissions("SUPER_ADMIN"),
    );
    expect(session?.customRoleCode).toBeNull();
  });

  it("SCHOOL_ADMIN with no customRole → getSystemRolePermissions defaults", async () => {
    const { getSession } = await loadAuth();
    const { getSystemRolePermissions } = await import("@/lib/permissions");
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "admin@demo.local",
      name: "Admin",
      role: "SCHOOL_ADMIN",
      tenantId: "t1",
      employeeId: null,
      parentId: null,
      customRoleId: null,
      customRole: null,
    });

    const session = await getSession();
    expect(session?.permissions).toEqual(
      getSystemRolePermissions("SCHOOL_ADMIN"),
    );
    expect(session?.customRoleCode).toBeNull();
  });

  it("TEACHER → teacher defaults", async () => {
    const { getSession } = await loadAuth();
    const { getSystemRolePermissions } = await import("@/lib/permissions");
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "teacher@demo.local",
      name: "Teacher",
      role: "TEACHER",
      tenantId: "t1",
      employeeId: "e1",
      parentId: null,
      customRoleId: null,
      customRole: null,
    });

    const session = await getSession();
    expect(session?.permissions).toEqual(getSystemRolePermissions("TEACHER"));
    expect(session?.customRoleCode).toBeNull();
  });

  it("GUARDIAN → guardian defaults", async () => {
    const { getSession } = await loadAuth();
    const { getSystemRolePermissions } = await import("@/lib/permissions");
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "parent@demo.local",
      name: "Parent",
      role: "GUARDIAN",
      tenantId: "t1",
      employeeId: null,
      parentId: "p1",
      customRoleId: null,
      customRole: null,
    });

    const session = await getSession();
    expect(session?.permissions).toEqual(getSystemRolePermissions("GUARDIAN"));
    expect(session?.customRoleCode).toBeNull();
  });

  it("customRole with valid JSON → parsed permissions win over role defaults", async () => {
    const { getSession } = await loadAuth();
    const customPerms = ["payroll.view", "employees.view"];
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "finance@demo.local",
      name: "Finance",
      role: "SCHOOL_ADMIN",
      tenantId: "t1",
      employeeId: null,
      parentId: null,
      customRoleId: "r1",
      customRole: {
        id: "r1",
        code: "FINANCE_ADMIN",
        permissions: JSON.stringify(customPerms),
      },
    });

    const session = await getSession();
    expect(session?.permissions).toEqual(customPerms);
    expect(session?.customRoleCode).toBe("FINANCE_ADMIN");
  });

  it("customRole with malformed JSON → falls back to role defaults + logs", async () => {
    const { getSession } = await loadAuth();
    const { getSystemRolePermissions } = await import("@/lib/permissions");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.user.findFirst.mockResolvedValueOnce({
      id: "user-1",
      email: "broken@demo.local",
      name: "Broken",
      role: "SCHOOL_ADMIN",
      tenantId: "t1",
      employeeId: null,
      parentId: null,
      customRoleId: "r1",
      customRole: {
        id: "r1",
        code: "BROKEN",
        permissions: "not valid json{",
      },
    });

    const session = await getSession();
    expect(session?.permissions).toEqual(
      getSystemRolePermissions("SCHOOL_ADMIN"),
    );
    // customRoleCode retained so UI can still label the user with the role
    expect(session?.customRoleCode).toBe("BROKEN");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
