import { describe, it, expect } from "vitest";
import { swapClassSessionTeacherFormSchema, swapClassSessionTeacherSchema } from "../class-session";

describe("swapClassSessionTeacherSchema", () => {
  it("accepts a non-null teacherId with a substituteReason", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: "emp1",
      substituteReason: "wali kelas sedang cuti",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null teacherId (clearing the effective teacher)", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a missing substituteReason (optional)", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: "emp1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty-string teacherId (min(1))", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an undefined teacherId (required key, nullable not optional)", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      substituteReason: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a substituteReason over 300 chars", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: "emp1",
      substituteReason: "x".repeat(301),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string substituteReason", () => {
    const result = swapClassSessionTeacherSchema.safeParse({
      teacherId: "emp1",
      substituteReason: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe("swapClassSessionTeacherFormSchema", () => {
  it("accepts the Select's empty-string 'no substitute' sentinel when it matches defaultTeacherId (no substitution, no reason needed)", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "",
      defaultTeacherId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a real teacherId equal to defaultTeacherId (a no-op 'swap') with no reason", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "emp1",
      defaultTeacherId: "emp1",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a real substitution with a reason", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "emp1",
      substituteReason: "wali kelas sedang cuti",
      defaultTeacherId: "emp-homeroom",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a genuine substitution (teacherId differs from defaultTeacherId) with no reason, issue on substituteReason", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "emp2",
      defaultTeacherId: "emp1",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join(".") === "substituteReason")).toBe(true);
  });

  it("rejects clearing to no-substitute ('') when the homeroom teacher exists, with no reason", () => {
    // teacherId="" -> effective null, which differs from a non-null
    // defaultTeacherId — clearing the effective teacher is itself a
    // substitution and still needs a reason.
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "",
      defaultTeacherId: "emp1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only reason on a genuine substitution", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "emp2",
      substituteReason: "   ",
      defaultTeacherId: "emp1",
    });
    expect(result.success).toBe(false);
  });

  it("still rejects a substituteReason over 300 chars", () => {
    const result = swapClassSessionTeacherFormSchema.safeParse({
      teacherId: "",
      defaultTeacherId: null,
      substituteReason: "x".repeat(301),
    });
    expect(result.success).toBe(false);
  });
});
