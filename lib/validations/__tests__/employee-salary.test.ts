import { describe, it, expect } from "vitest";
import { updateEmployeeSalarySchema } from "@/lib/validations/employee-salary";

describe("updateEmployeeSalarySchema", () => {
  it("accepts a valid array of salary entries", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "comp-1", value: 5_000_000 },
      { componentDefId: "comp-2", value: 250_000 },
    ]);
    expect(r.success).toBe(true);
  });

  it("accepts an empty array (clearing all values)", () => {
    const r = updateEmployeeSalarySchema.safeParse([]);
    expect(r.success).toBe(true);
  });

  it("accepts value === 0", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "comp-1", value: 0 },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejects a non-array body", () => {
    const r = updateEmployeeSalarySchema.safeParse({
      componentDefId: "comp-1",
      value: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative value", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "comp-1", value: -1 },
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("value"))
      ).toBe(true);
    }
  });

  it("rejects a missing componentDefId", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { value: 100 } as unknown,
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("componentDefId"))
      ).toBe(true);
    }
  });

  it("rejects an empty-string componentDefId", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "", value: 100 },
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("componentDefId"))
      ).toBe(true);
    }
  });

  it("rejects a non-number value (string)", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "comp-1", value: "not-a-number" as unknown as number },
    ]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("value"))
      ).toBe(true);
    }
  });

  it("rejects NaN", () => {
    const r = updateEmployeeSalarySchema.safeParse([
      { componentDefId: "comp-1", value: NaN },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects null body", () => {
    const r = updateEmployeeSalarySchema.safeParse(null);
    expect(r.success).toBe(false);
  });
});
