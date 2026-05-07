// Vitest — assertPortalAccess matrix per cycle p2-portal-shell-sidebar AC4.
// Covers each portal × {valid-role, mismatched-role, unauthed} = 6 cases.

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted lifts the spies to module-evaluation time so the vi.mock
// factory (which itself is hoisted above every import) can reference them
// without "Cannot access before initialization".
const { redirect, getSession } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ getSession }));

import { assertPortalAccess, ALLOWED_ROLES } from "../portal-guard";
import type { SessionContext } from "@/lib/auth/session";

function fakeSession(role: SessionContext["role"]): SessionContext {
  return {
    userId: "u1",
    supabaseUserId: "supa1",
    tenantId: "t1",
    email: "x@y.z",
    role,
    currentTermId: "term1",
  } as SessionContext;
}

describe("assertPortalAccess", () => {
  beforeEach(() => {
    redirect.mockClear();
    getSession.mockReset();
  });

  it("admin portal — admin role passes", async () => {
    getSession.mockResolvedValue(fakeSession("admin"));
    const session = await assertPortalAccess("admin");
    expect(session.role).toBe("admin");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("admin portal — finance_officer role passes (in allowed set)", async () => {
    getSession.mockResolvedValue(fakeSession("finance_officer"));
    const session = await assertPortalAccess("admin");
    expect(session.role).toBe("finance_officer");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("teacher portal — homeroom_teacher passes", async () => {
    getSession.mockResolvedValue(fakeSession("homeroom_teacher"));
    const session = await assertPortalAccess("teacher");
    expect(session.role).toBe("homeroom_teacher");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("admin portal — parent role is rejected → redirect('/')", async () => {
    getSession.mockResolvedValue(fakeSession("parent"));
    await expect(assertPortalAccess("admin")).rejects.toThrow(/NEXT_REDIRECT:\//);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("parent portal — admin role is rejected → redirect('/')", async () => {
    getSession.mockResolvedValue(fakeSession("admin"));
    await expect(assertPortalAccess("parent")).rejects.toThrow(/NEXT_REDIRECT:\//);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("any portal — no session → redirect('/')", async () => {
    getSession.mockResolvedValue(null);
    await expect(assertPortalAccess("admin")).rejects.toThrow(/NEXT_REDIRECT:\//);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("ALLOWED_ROLES is frozen + covers all 8 ROLE_CODES across portals", () => {
    expect(Object.isFrozen(ALLOWED_ROLES)).toBe(true);
    const union = new Set<string>([
      ...ALLOWED_ROLES.admin,
      ...ALLOWED_ROLES.teacher,
      ...ALLOWED_ROLES.parent,
    ]);
    expect(union.size).toBe(8);
  });
});
