/**
 * F-13: `updateEmployeeSchema` must NOT accept `status`. Sending
 * `{status:"ACTIVE"}` to `PUT /api/employees/[id]` was the silent
 * re-activation bug; the field is removed and Zod's default `.strip()`
 * mode drops the unknown key without erroring (so `editForm`-style
 * payloads with extra fields still validate).
 */
import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeStatusReasonSchema,
} from "@/lib/validations/employee";

describe("updateEmployeeSchema — F-13 status guard", () => {
  it("strips a `status` field from the parsed output", () => {
    const r = updateEmployeeSchema.safeParse({
      nama: "Ali",
      status: "ACTIVE",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).status).toBeUndefined();
      expect(r.data.nama).toBe("Ali");
    }
  });

  it("strips `status: INACTIVE` too (not a one-off for ACTIVE)", () => {
    const r = updateEmployeeSchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as Record<string, unknown>).status).toBeUndefined();
    }
  });

  it("does not list `status` as a valid key on the schema shape", () => {
    // Defensive: catches a future re-introduction via `.extend({ status })`
    // before tests that exercise it would even fail.
    expect(Object.keys(updateEmployeeSchema.shape)).not.toContain("status");
  });

  it("accepts a normal partial update without status", () => {
    const r = updateEmployeeSchema.safeParse({
      nama: "Ali Updated",
      jabatan: "Guru",
    });
    expect(r.success).toBe(true);
  });
});

describe("createEmployeeSchema — sanity", () => {
  it("requires nama, email, jabatan, campusId, hireDate", () => {
    const r = createEmployeeSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("F-26: role defaults to TEACHER when omitted (back-compat with seed)", () => {
    const r = createEmployeeSchema.safeParse({
      nama: "Ali",
      email: "ali@x.com",
      jabatan: "Guru",
      campusId: "c1",
      hireDate: "2026-01-01",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("TEACHER");
  });

  it("F-26: role accepts SCHOOL_ADMIN", () => {
    const r = createEmployeeSchema.safeParse({
      nama: "Bu Admin",
      email: "admin@x.com",
      jabatan: "Admin Tata Usaha",
      campusId: "c1",
      hireDate: "2026-01-01",
      role: "SCHOOL_ADMIN",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("SCHOOL_ADMIN");
  });

  it("F-26: rejects GUARDIAN and SUPER_ADMIN — only TEACHER/SCHOOL_ADMIN allowed", () => {
    expect(
      createEmployeeSchema.safeParse({
        nama: "X",
        email: "x@x.com",
        jabatan: "G",
        campusId: "c1",
        hireDate: "2026-01-01",
        role: "GUARDIAN",
      }).success,
    ).toBe(false);
    expect(
      createEmployeeSchema.safeParse({
        nama: "X",
        email: "x@x.com",
        jabatan: "G",
        campusId: "c1",
        hireDate: "2026-01-01",
        role: "SUPER_ADMIN",
      }).success,
    ).toBe(false);
  });
});

describe("employeeStatusReasonSchema", () => {
  it("accepts an empty body", () => {
    expect(employeeStatusReasonSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a reason string", () => {
    const r = employeeStatusReasonSchema.safeParse({ reason: "Pensiun" });
    expect(r.success).toBe(true);
  });

  it("rejects reasons longer than 500 characters", () => {
    const r = employeeStatusReasonSchema.safeParse({
      reason: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});
