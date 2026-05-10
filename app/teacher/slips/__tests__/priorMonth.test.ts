import { describe, it, expect } from "vitest";
import { priorMonthLabel, hasSlipInMonth } from "../page";

describe("priorMonthLabel", () => {
  it("returns April 2026 when today is May 2026", () => {
    const result = priorMonthLabel(new Date(2026, 4, 3)); // month index 4 = May
    expect(result.year).toBe(2026);
    expect(result.month).toBe(4);
    expect(result.label).toBe("April 2026");
  });

  it("handles year rollback: returns Desember 2025 when today is January 2026", () => {
    const result = priorMonthLabel(new Date(2026, 0, 15)); // month index 0 = January
    expect(result.year).toBe(2025);
    expect(result.month).toBe(12);
    expect(result.label).toBe("Desember 2025");
  });
});

describe("hasSlipInMonth", () => {
  it("returns true when a slip's periodStart matches the given year and month", () => {
    const slips = [
      { payrollRun: { periodStart: "2026-04-01", periodEnd: "2026-04-30", status: "APPROVED" } },
    ];
    expect(hasSlipInMonth(slips, 2026, 4)).toBe(true);
  });

  it("returns false when no slip matches the given year and month", () => {
    const slips = [
      { payrollRun: { periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "APPROVED" } },
    ];
    expect(hasSlipInMonth(slips, 2026, 4)).toBe(false);
  });

  it("returns false when the slip list is empty", () => {
    expect(hasSlipInMonth([], 2026, 4)).toBe(false);
  });

  it("handles ISO strings with timezone offset correctly (date-only parsing)", () => {
    const slips = [
      {
        payrollRun: {
          periodStart: "2026-04-01T00:00:00.000Z",
          periodEnd: "2026-04-30T00:00:00.000Z",
          status: "APPROVED",
        },
      },
    ];
    expect(hasSlipInMonth(slips, 2026, 4)).toBe(true);
  });

  it("does not false-positive on same month but different year", () => {
    const slips = [
      { payrollRun: { periodStart: "2025-04-01", periodEnd: "2025-04-30", status: "APPROVED" } },
    ];
    expect(hasSlipInMonth(slips, 2026, 4)).toBe(false);
  });
});
