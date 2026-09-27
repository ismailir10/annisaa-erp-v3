import { describe, it, expect } from "vitest";
import { orgConfigSchema } from "@/lib/validations/org-config";

const valid = {
  workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
  workStartTime: "07:00",
  workEndTime: "16:00",
  gracePeriodMinutes: "15",
  timezone: "Asia/Jakarta",
  payrollPeriodStartDay: "21",
  payrollPeriodEndDay: "20",
};

describe("orgConfigSchema", () => {
  it("accepts a well-formed config body, coercing numeric strings", () => {
    const res = orgConfigSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.gracePeriodMinutes).toBe(15);
      expect(res.data.payrollPeriodStartDay).toBe(21);
      expect(res.data.payrollPeriodEndDay).toBe(20);
    }
  });

  it("rejects a non-numeric grace period with an Indonesian message", () => {
    const res = orgConfigSchema.safeParse({ ...valid, gracePeriodMinutes: "abc" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Toleransi keterlambatan harus berupa angka");
    }
  });

  it("rejects a negative grace period", () => {
    expect(orgConfigSchema.safeParse({ ...valid, gracePeriodMinutes: "-1" }).success).toBe(false);
  });

  it("rejects a payroll start day outside 1-28", () => {
    expect(orgConfigSchema.safeParse({ ...valid, payrollPeriodStartDay: "29" }).success).toBe(false);
  });

  it("rejects a payroll end day outside 1-31", () => {
    expect(orgConfigSchema.safeParse({ ...valid, payrollPeriodEndDay: "32" }).success).toBe(false);
  });
});
