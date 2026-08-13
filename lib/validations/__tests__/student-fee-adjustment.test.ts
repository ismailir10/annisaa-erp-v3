import { describe, expect, it } from "vitest";
import {
  createStudentFeeAdjustmentSchema,
  updateStudentFeeAdjustmentSchema,
} from "../student-fee-adjustment";

const validCreate = {
  studentId: "student-1",
  academicYearId: "year-1",
  feeComponentId: "component-1",
  type: "DISCOUNT",
  mode: "PERCENT",
  value: 20,
  reason: "Diskon anak kedua",
};

describe("createStudentFeeAdjustmentSchema", () => {
  it("accepts a valid happy-path payload", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse(validCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.value).toBe(20);
      expect(r.data.type).toBe("DISCOUNT");
      expect(r.data.mode).toBe("PERCENT");
    }
  });

  it.each([
    "studentId",
    "academicYearId",
    "feeComponentId",
    "type",
    "mode",
    "value",
    "reason",
  ])("rejects a payload missing required field %s", (field) => {
    const payload = { ...validCreate } as Record<string, unknown>;
    delete payload[field];
    const r = createStudentFeeAdjustmentSchema.safeParse(payload);
    expect(r.success).toBe(false);
  });

  it("rejects an unknown type", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      type: "REBATE",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown mode", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      mode: "ABSOLUTE",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a zero value", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      value: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative value", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      value: -10,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a value over 100 when mode is PERCENT", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      mode: "PERCENT",
      value: 150,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("value"))).toBe(true);
    }
  });

  it("accepts a value over 100 when mode is FIXED", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      mode: "FIXED",
      value: 500000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed validFrom date", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      validFrom: "13/08/2026",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed validTo date", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      validTo: "2026-8-1",
    });
    expect(r.success).toBe(false);
  });

  it("rejects validTo earlier than validFrom", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      validFrom: "2026-08-01",
      validTo: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("accepts equal validFrom and validTo dates", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      validFrom: "2026-08-01",
      validTo: "2026-08-01",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty reason", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      reason: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    const r = createStudentFeeAdjustmentSchema.safeParse({
      ...validCreate,
      reason: "   ",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateStudentFeeAdjustmentSchema", () => {
  it("accepts a lone status toggle", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(updateStudentFeeAdjustmentSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({ status: "DELETED" });
    expect(r.success).toBe(false);
  });

  it("rejects a value over 100 when mode PERCENT is resent in the same payload", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({
      mode: "PERCENT",
      value: 120,
    });
    expect(r.success).toBe(false);
  });

  it("locally accepts a value-only update over 100 (mode omitted — route must re-check stored mode)", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({ value: 120 });
    expect(r.success).toBe(true);
  });

  it("rejects a zero or negative value when provided", () => {
    expect(updateStudentFeeAdjustmentSchema.safeParse({ value: 0 }).success).toBe(false);
    expect(updateStudentFeeAdjustmentSchema.safeParse({ value: -5 }).success).toBe(false);
  });

  it("rejects validTo earlier than validFrom", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({
      validFrom: "2026-08-01",
      validTo: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty reason when provided", () => {
    const r = updateStudentFeeAdjustmentSchema.safeParse({ reason: "   " });
    expect(r.success).toBe(false);
  });
});
