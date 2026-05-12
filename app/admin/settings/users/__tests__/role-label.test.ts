import { describe, it, expect } from "vitest";
import { ROLE_LABELS, getRoleLabel } from "../role-labels";

describe("ROLE_LABELS", () => {
  it("renders SUPER_ADMIN as 'Super Admin' (UAT 2026-05-12 M5 fix)", () => {
    expect(ROLE_LABELS.SUPER_ADMIN).toBe("Super Admin");
  });

  it("covers all four built-in role enums", () => {
    expect(ROLE_LABELS.SUPER_ADMIN).toBeDefined();
    expect(ROLE_LABELS.SCHOOL_ADMIN).toBeDefined();
    expect(ROLE_LABELS.TEACHER).toBeDefined();
    expect(ROLE_LABELS.GUARDIAN).toBeDefined();
  });
});

describe("getRoleLabel", () => {
  it("returns custom role name when present", () => {
    expect(
      getRoleLabel({
        role: "TEACHER",
        customRole: { name: "Wali Kelas" },
      }),
    ).toBe("Wali Kelas");
  });

  it("returns label from ROLE_LABELS when no custom role", () => {
    expect(getRoleLabel({ role: "SUPER_ADMIN", customRole: null })).toBe("Super Admin");
    expect(getRoleLabel({ role: "SCHOOL_ADMIN", customRole: null })).toBe("Admin");
    expect(getRoleLabel({ role: "TEACHER", customRole: null })).toBe("Guru");
    expect(getRoleLabel({ role: "GUARDIAN", customRole: null })).toBe("Wali Murid");
  });

  it("falls back to raw role string for unknown enums", () => {
    expect(getRoleLabel({ role: "UNKNOWN_ROLE", customRole: null })).toBe("UNKNOWN_ROLE");
  });
});
