import { describe, it, expect } from "vitest";
import { buildPayrollPeriods } from "../payroll";

describe("buildPayrollPeriods", () => {
  const periods = buildPayrollPeriods();

  it("produces exactly 22 monthly runs from 2024-07 to 2026-04", () => {
    expect(periods).toHaveLength(22);
    expect(periods[0].periodStart).toBe("2024-07-01");
    expect(periods[periods.length - 1].periodStart).toBe("2026-04-01");
  });

  it("marks every run APPROVED except the current month", () => {
    const drafts = periods.filter((p) => p.status === "DRAFT");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].periodStart).toBe("2026-04-01");
  });

  it("uses the last day of each month as periodEnd", () => {
    const feb25 = periods.find((p) => p.periodStart === "2025-02-01");
    expect(feb25?.periodEnd).toBe("2025-02-28");
    const dec24 = periods.find((p) => p.periodStart === "2024-12-01");
    expect(dec24?.periodEnd).toBe("2024-12-31");
  });
});
