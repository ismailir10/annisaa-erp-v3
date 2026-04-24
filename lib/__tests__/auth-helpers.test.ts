import { describe, it, expect, vi } from "vitest";

// lib/auth.ts imports prisma and supabase at module level — mock them to avoid DB connection
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { isSuperAdmin, isAdminRole } from "@/lib/auth";

describe("isSuperAdmin", () => {
  it("returns true for SUPER_ADMIN", () => expect(isSuperAdmin("SUPER_ADMIN")).toBe(true));
  it("returns false for SCHOOL_ADMIN", () => expect(isSuperAdmin("SCHOOL_ADMIN")).toBe(false));
  it("returns false for TEACHER", () => expect(isSuperAdmin("TEACHER")).toBe(false));
  it("returns false for GUARDIAN", () => expect(isSuperAdmin("GUARDIAN")).toBe(false));
});

describe("isAdminRole", () => {
  it("returns true for SUPER_ADMIN", () => expect(isAdminRole("SUPER_ADMIN")).toBe(true));
  it("returns true for SCHOOL_ADMIN", () => expect(isAdminRole("SCHOOL_ADMIN")).toBe(true));
  it("returns false for TEACHER", () => expect(isAdminRole("TEACHER")).toBe(false));
  it("returns false for GUARDIAN", () => expect(isAdminRole("GUARDIAN")).toBe(false));
});

// canViewSalary was removed — salary-gated routes now use
// `requirePermission("payroll.view")`. Coverage lives in the per-route
// permission-gate tests and in `permissions.test.ts`.
