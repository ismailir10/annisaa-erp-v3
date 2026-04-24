import { describe, it, expect } from "vitest";
import {
  hasPermission,
  getSystemRolePermissions,
  ALL_PERMISSIONS,
} from "@/lib/permissions";

/**
 * Task 2: Permission table — hr.view, SCHOOL_ADMIN non-HR defaults, SUPER_ADMIN
 * owner escape hatch. Covers hasPermission() and getSystemRolePermissions()
 * contract changes.
 */

describe("hasPermission", () => {
  it("SUPER_ADMIN with empty permissions → true for anything (owner escape hatch)", () => {
    expect(
      hasPermission(
        { role: "SUPER_ADMIN", permissions: [] },
        "anything.whatever",
      ),
    ).toBe(true);
    expect(
      hasPermission(
        { role: "SUPER_ADMIN", permissions: [] },
        "payroll.approve",
      ),
    ).toBe(true);
  });

  it("SCHOOL_ADMIN with no permissions key → false (short-circuit removed)", () => {
    expect(
      hasPermission({ role: "SCHOOL_ADMIN" }, "students.view"),
    ).toBe(false);
    expect(
      hasPermission({ role: "SCHOOL_ADMIN", permissions: null }, "students.view"),
    ).toBe(false);
  });

  it("SCHOOL_ADMIN defaults → hr.view is denied", () => {
    expect(
      hasPermission(
        {
          role: "SCHOOL_ADMIN",
          permissions: getSystemRolePermissions("SCHOOL_ADMIN"),
        },
        "hr.view",
      ),
    ).toBe(false);
  });

  it("SCHOOL_ADMIN defaults → payroll.view is denied", () => {
    expect(
      hasPermission(
        {
          role: "SCHOOL_ADMIN",
          permissions: getSystemRolePermissions("SCHOOL_ADMIN"),
        },
        "payroll.view",
      ),
    ).toBe(false);
  });

  it("SCHOOL_ADMIN defaults → students.view is allowed", () => {
    expect(
      hasPermission(
        {
          role: "SCHOOL_ADMIN",
          permissions: getSystemRolePermissions("SCHOOL_ADMIN"),
        },
        "students.view",
      ),
    ).toBe(true);
  });

  it("TEACHER with empty permissions → students.view denied (no short-circuit)", () => {
    expect(
      hasPermission({ role: "TEACHER", permissions: [] }, "students.view"),
    ).toBe(false);
  });

  it("TEACHER with defaults → students.view allowed", () => {
    expect(
      hasPermission(
        { role: "TEACHER", permissions: getSystemRolePermissions("TEACHER") },
        "students.view",
      ),
    ).toBe(true);
  });

  it("custom role with [payroll.view] → payroll.view true, employees.view false", () => {
    const session = { role: "SCHOOL_ADMIN", permissions: ["payroll.view"] };
    expect(hasPermission(session, "payroll.view")).toBe(true);
    expect(hasPermission(session, "employees.view")).toBe(false);
  });
});

describe("getSystemRolePermissions", () => {
  it("SUPER_ADMIN → ALL_PERMISSIONS", () => {
    expect(getSystemRolePermissions("SUPER_ADMIN")).toEqual(ALL_PERMISSIONS);
  });

  it("SCHOOL_ADMIN → excludes all hr.*, payroll.*, employees.*, attendance.*, leave.* codes", () => {
    const perms = getSystemRolePermissions("SCHOOL_ADMIN");
    const forbidden = perms.filter(
      (p) =>
        p.startsWith("hr.") ||
        p.startsWith("payroll.") ||
        p.startsWith("employees.") ||
        p.startsWith("attendance.") ||
        p.startsWith("leave."),
    );
    expect(forbidden).toEqual([]);
  });

  it("SCHOOL_ADMIN → includes core academic + finance + settings codes", () => {
    const perms = getSystemRolePermissions("SCHOOL_ADMIN");
    expect(perms).toContain("students.view");
    expect(perms).toContain("invoices.view");
    expect(perms).toContain("settings.edit");
    expect(perms).toContain("users.edit");
  });

  it("TEACHER → attendance.view + students.view only", () => {
    expect(getSystemRolePermissions("TEACHER")).toEqual([
      "attendance.view",
      "students.view",
    ]);
  });

  it("GUARDIAN → students.view + invoices.view only", () => {
    expect(getSystemRolePermissions("GUARDIAN")).toEqual([
      "students.view",
      "invoices.view",
    ]);
  });
});

describe("ALL_PERMISSIONS", () => {
  it("includes hr.view (new entry added in Task 2)", () => {
    expect(ALL_PERMISSIONS).toContain("hr.view");
  });
});
