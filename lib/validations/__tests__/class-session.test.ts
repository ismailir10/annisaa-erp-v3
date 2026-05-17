import { describe, it, expect } from "vitest";
import { swapClassSessionTeacherSchema } from "../class-session";

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
