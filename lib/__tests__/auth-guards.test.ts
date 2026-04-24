import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

/**
 * Covers Task 3 of the super-admin-rbac-sidebar-fix cycle: `requirePermission`
 * (API) and `assertPermission` (pages). We mock `getSession` from @/lib/auth
 * and `redirect` from next/navigation so we can assert on bounce targets
 * without a real Next.js request context.
 */

const getSessionMock = vi.fn();
// Mock the entire module without importActual — pulling the real module
// loads lib/db.ts which requires DATABASE_URL. We only need getSession at
// runtime; SessionUser is a type-only import.
vi.mock("@/lib/auth", () => ({
  getSession: getSessionMock,
}));

vi.mock("next/navigation", () => ({
  // Throw so control flow aborts like the real redirect (which throws
  // NEXT_REDIRECT internally). Tests assert on the thrown message.
  redirect: vi.fn((url: string) => {
    throw new Error("REDIRECT:" + url);
  }),
}));

function makeSession(partial: Partial<SessionUser>): SessionUser {
  return {
    id: "u1",
    email: "u1@demo.local",
    role: "SCHOOL_ADMIN",
    name: "User 1",
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
    ...partial,
  };
}

describe("requirePermission", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("returns 401 Response when no session", async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    getSessionMock.mockResolvedValue(null);

    const result = await requirePermission("hr.view");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
      const body = await result.error.json();
      expect(body).toEqual({ error: "unauthorized" });
    }
  });

  it("returns 403 Response when SCHOOL_ADMIN lacks hr.view", async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    getSessionMock.mockResolvedValue(
      makeSession({
        role: "SCHOOL_ADMIN",
        permissions: ["students.view", "invoices.view"],
      }),
    );

    const result = await requirePermission("hr.view");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body).toEqual({ error: "forbidden", missing: "hr.view" });
    }
  });

  it("passes for SUPER_ADMIN via owner escape hatch even with empty permissions", async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    const session = makeSession({ role: "SUPER_ADMIN", permissions: [] });
    getSessionMock.mockResolvedValue(session);

    const result = await requirePermission("hr.view");
    expect("session" in result).toBe(true);
    if ("session" in result) {
      expect(result.session).toBe(session);
    }
  });

  it("returns 403 for SCHOOL_ADMIN with null/undefined permissions (defense-in-depth)", async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    // Simulates a malformed session with null permissions — hasPermission
    // returns false (no short-circuit), guard must emit 403 not let through.
    getSessionMock.mockResolvedValue(
      makeSession({
        role: "SCHOOL_ADMIN",
        permissions: null as unknown as string[],
      }),
    );

    const result = await requirePermission("students.view");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });

  it("passes for SCHOOL_ADMIN with the granted permission", async () => {
    const { requirePermission } = await import("@/lib/auth-guards");
    const session = makeSession({
      role: "SCHOOL_ADMIN",
      permissions: ["students.view"],
    });
    getSessionMock.mockResolvedValue(session);

    const result = await requirePermission("students.view");
    expect("session" in result).toBe(true);
    if ("session" in result) {
      expect(result.session).toBe(session);
    }
  });
});

describe("assertPermission", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  it("redirects to / when no session", async () => {
    const { assertPermission } = await import("@/lib/auth-guards");
    getSessionMock.mockResolvedValue(null);

    await expect(assertPermission("hr.view")).rejects.toThrow("REDIRECT:/");
  });

  it("redirects to /admin when SCHOOL_ADMIN lacks the permission", async () => {
    const { assertPermission } = await import("@/lib/auth-guards");
    getSessionMock.mockResolvedValue(
      makeSession({
        role: "SCHOOL_ADMIN",
        permissions: ["students.view"],
      }),
    );

    await expect(assertPermission("hr.view")).rejects.toThrow(
      "REDIRECT:/admin",
    );
  });

  it("returns the session for SUPER_ADMIN", async () => {
    const { assertPermission } = await import("@/lib/auth-guards");
    const session = makeSession({ role: "SUPER_ADMIN", permissions: [] });
    getSessionMock.mockResolvedValue(session);

    const result = await assertPermission("hr.view");
    expect(result).toBe(session);
  });
});
