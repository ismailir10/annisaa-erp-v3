import { describe, it, expect } from "vitest";
import { generatePayrollSchema } from "@/lib/validations/payroll";

describe("generatePayrollSchema", () => {
  it("accepts a valid one-month range", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed periodStart ('foo')", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "foo",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("periodStart"))).toBe(true);
    }
  });

  it("rejects reversed range", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026-12-01",
      periodEnd: "2026-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.includes("sebelum atau sama dengan"))
      ).toBe(true);
    }
  });

  it("rejects a 60-day range (over the 45-day cap)", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026-01-01",
      periodEnd: "2026-03-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("periodEnd"))).toBe(true);
    }
  });

  it("rejects empty body", () => {
    const r = generatePayrollSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects non-ISO format like '2026/04/01'", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026/04/01",
      periodEnd: "2026/04/30",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a single-day range (start == end)", () => {
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026-04-15",
      periodEnd: "2026-04-15",
    });
    expect(r.success).toBe(true);
  });

  it("accepts the exact 45-day boundary", () => {
    // 2026-01-01..2026-02-14 inclusive = 45 days
    const r = generatePayrollSchema.safeParse({
      periodStart: "2026-01-01",
      periodEnd: "2026-02-14",
    });
    expect(r.success).toBe(true);
  });
});

import { adjustPayrollLineSchema } from "@/lib/validations/payroll";

describe("adjustPayrollLineSchema", () => {
  it("accepts a valid adjustment", () => {
    const r = adjustPayrollLineSchema.safeParse({ adjustmentAmount: 50000, adjustmentNote: "Lembur" });
    expect(r.success).toBe(true);
  });

  it("accepts zero (clears a previous adjustment)", () => {
    const r = adjustPayrollLineSchema.safeParse({ adjustmentAmount: 0, adjustmentNote: "Reset" });
    expect(r.success).toBe(true);
  });

  it("rejects missing or blank note", () => {
    expect(adjustPayrollLineSchema.safeParse({ adjustmentAmount: 1000 }).success).toBe(false);
    expect(adjustPayrollLineSchema.safeParse({ adjustmentAmount: 1000, adjustmentNote: "  " }).success).toBe(false);
  });

  it("rejects non-numeric and non-finite amounts", () => {
    expect(adjustPayrollLineSchema.safeParse({ adjustmentAmount: "abc", adjustmentNote: "x" }).success).toBe(false);
    expect(adjustPayrollLineSchema.safeParse({ adjustmentAmount: NaN, adjustmentNote: "x" }).success).toBe(false);
    expect(adjustPayrollLineSchema.safeParse({ adjustmentAmount: Infinity, adjustmentNote: "x" }).success).toBe(false);
  });
});

import { adjustPayrollLineFormSchema, payrollVariablesSchema } from "@/lib/validations/payroll";

describe("adjustPayrollLineFormSchema", () => {
  it("coerces a string amount from <Input type=number>", () => {
    const r = adjustPayrollLineFormSchema.safeParse({ adjustmentAmount: "50000", adjustmentNote: "Lembur" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adjustmentAmount).toBe(50000);
  });

  it("coerces a blank amount to 0, matching the prior parseFloat(...) || 0 fallback", () => {
    const r = adjustPayrollLineFormSchema.safeParse({ adjustmentAmount: "", adjustmentNote: "Reset" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adjustmentAmount).toBe(0);
  });

  it("still requires a non-blank note", () => {
    expect(adjustPayrollLineFormSchema.safeParse({ adjustmentAmount: "1000", adjustmentNote: "" }).success).toBe(false);
  });

  it("rejects a non-numeric amount with an Indonesian message", () => {
    const r = adjustPayrollLineFormSchema.safeParse({ adjustmentAmount: "abc", adjustmentNote: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Jumlah penyesuaian harus berupa angka")).toBe(true);
    }
  });
});

describe("payrollVariablesSchema", () => {
  const valid = { overtimeHours: "2.5", outdoorDays: "1", holidayWorkedDays: "0", dcDays: "0" };

  it("coerces string inputs to numbers", () => {
    const r = payrollVariablesSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ overtimeHours: 2.5, outdoorDays: 1, holidayWorkedDays: 0, dcDays: 0 });
    }
  });

  it("coerces blank inputs to 0 (default-with-no-asterisk fields)", () => {
    const r = payrollVariablesSchema.safeParse({ overtimeHours: "", outdoorDays: "", holidayWorkedDays: "", dcDays: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ overtimeHours: 0, outdoorDays: 0, holidayWorkedDays: 0, dcDays: 0 });
    }
  });

  it("defaults a missing field to 0, matching the route's own `?? 0` and partial-body callers", () => {
    const r = payrollVariablesSchema.safeParse({ overtimeHours: 5 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ overtimeHours: 5, outdoorDays: 0, holidayWorkedDays: 0, dcDays: 0 });
    }
  });

  it("rejects a negative value with an Indonesian message", () => {
    const r = payrollVariablesSchema.safeParse({ ...valid, outdoorDays: "-1" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("outdoorDays") && i.message === "Hari outdoor tidak boleh negatif")).toBe(true);
    }
  });

  it("rejects a non-integer day count", () => {
    const r = payrollVariablesSchema.safeParse({ ...valid, dcDays: "1.5" });
    expect(r.success).toBe(false);
  });

  it("rejects overtimeHours above the Decimal(5,2) column bound", () => {
    const r = payrollVariablesSchema.safeParse({ ...valid, overtimeHours: "1000" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-numeric value with an Indonesian message, not a default Zod one", () => {
    const r = payrollVariablesSchema.safeParse({ ...valid, dcDays: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Hari DC harus berupa angka")).toBe(true);
    }
  });
});
