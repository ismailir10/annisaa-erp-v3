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
        r.error.issues.some((i) => i.message.includes("<= periodEnd"))
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
