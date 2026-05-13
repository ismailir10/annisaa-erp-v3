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

const baseCreate = {
  nama: "Ismail Teacher Test",
  email: "ismail10rabbanii@gmail.com",
  jabatan: "Guru Kelas",
  campusId: "c1",
  hireDate: "2026-05-13",
};

describe("createEmployeeSchema — F-10 bank/rekening pair invariant", () => {
  it("accepts both fields empty", () => {
    expect(createEmployeeSchema.safeParse(baseCreate).success).toBe(true);
  });

  it("accepts both fields populated", () => {
    expect(
      createEmployeeSchema.safeParse({
        ...baseCreate,
        bankName: "Bank BSI",
        bankAccountNo: "1234567890",
      }).success,
    ).toBe(true);
  });

  it("rejects Bank without Rekening with field-level error on bankAccountNo", () => {
    const result = createEmployeeSchema.safeParse({
      ...baseCreate,
      bankName: "Bank BSI",
      bankAccountNo: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path.join(".") === "bankAccountNo");
    expect(issue?.message).toBe("No. Rekening wajib diisi jika bank dipilih");
  });

  it("rejects Rekening without Bank with field-level error on bankName", () => {
    const result = createEmployeeSchema.safeParse({
      ...baseCreate,
      bankName: null,
      bankAccountNo: "1234567890",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) => i.path.join(".") === "bankName");
    expect(issue?.message).toBe("Bank wajib dipilih jika No. Rekening diisi");
  });

  it("treats whitespace-only strings as empty (Bank set, Rekening blank)", () => {
    const result = createEmployeeSchema.safeParse({
      ...baseCreate,
      bankName: "Bank BSI",
      bankAccountNo: "   ",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEmployeeSchema — F-10 bank/rekening pair invariant on partial updates", () => {
  it("accepts a partial update that touches neither field", () => {
    expect(updateEmployeeSchema.safeParse({ nama: "Renamed" }).success).toBe(true);
  });

  it("accepts a partial update setting both fields together", () => {
    expect(
      updateEmployeeSchema.safeParse({
        bankName: "Bank BSI",
        bankAccountNo: "1234567890",
      }).success,
    ).toBe(true);
  });

  it("rejects a partial update setting Bank without Rekening", () => {
    expect(updateEmployeeSchema.safeParse({ bankName: "Bank BSI" }).success).toBe(false);
  });

  it("rejects a partial update setting Rekening without Bank", () => {
    expect(
      updateEmployeeSchema.safeParse({ bankAccountNo: "1234567890" }).success,
    ).toBe(false);
  });
});

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
