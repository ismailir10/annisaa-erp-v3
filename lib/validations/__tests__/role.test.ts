import { describe, it, expect } from "vitest";
import { createRoleSchema, updateRoleSchema, roleFormSchema } from "@/lib/validations/role";

describe("createRoleSchema", () => {
  it("accepts a well-formed role body", () => {
    const res = createRoleSchema.safeParse({
      name: "Admin Keuangan",
      code: "FINANCE_ADMIN",
      description: "Mengelola keuangan",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty name with a per-field message", () => {
    const res = createRoleSchema.safeParse({ name: "", code: "FINANCE_ADMIN" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === "name" && i.message === "Nama peran wajib diisi")).toBe(true);
    }
  });

  it("rejects a missing code with a per-field message", () => {
    const res = createRoleSchema.safeParse({ name: "Admin Keuangan" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === "code" && i.message === "Kode wajib diisi")).toBe(true);
    }
  });

  it("trims name and code", () => {
    const res = createRoleSchema.safeParse({ name: "  Admin Keuangan  ", code: "  FINANCE_ADMIN  " });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe("Admin Keuangan");
      expect(res.data.code).toBe("FINANCE_ADMIN");
    }
  });

  it("rejects a code outside the uppercase/digit/underscore format", () => {
    const res = createRoleSchema.safeParse({ name: "Admin Keuangan", code: "finance-admin!" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/^Kode harus huruf kapital/);
    }
  });
});

describe("updateRoleSchema", () => {
  it("accepts an empty partial body", () => {
    expect(updateRoleSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a blank name (the route silently ignores it)", () => {
    expect(updateRoleSchema.safeParse({ name: "" }).success).toBe(true);
  });
});

describe("roleFormSchema", () => {
  it("defaults permissions to an empty array", () => {
    const res = roleFormSchema.safeParse({ name: "Admin Keuangan", code: "FINANCE_ADMIN" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.permissions).toEqual([]);
  });

  it("accepts a permissions list", () => {
    const res = roleFormSchema.safeParse({
      name: "Admin Keuangan",
      code: "FINANCE_ADMIN",
      permissions: ["students.view", "fees.view"],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.permissions).toEqual(["students.view", "fees.view"]);
  });
});
