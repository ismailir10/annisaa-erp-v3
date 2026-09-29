import { describe, it, expect } from "vitest";
import { findNegativeNet, isFuturePayrollPeriod } from "../generation-guards";

describe("isFuturePayrollPeriod", () => {
  it("is true only when the period starts after today", () => {
    expect(isFuturePayrollPeriod("2026-11-21", "2026-09-29")).toBe(true);
    expect(isFuturePayrollPeriod("2026-09-30", "2026-09-29")).toBe(true);
    expect(isFuturePayrollPeriod("2026-09-29", "2026-09-29")).toBe(false);
    expect(isFuturePayrollPeriod("2026-08-21", "2026-09-29")).toBe(false);
  });
});

describe("findNegativeNet", () => {
  it("returns only rows below zero (zero and NaN are not negative)", () => {
    const rows = [
      { id: "a", netAmount: 100 },
      { id: "b", netAmount: 0 },
      { id: "c", netAmount: -50000 },
      { id: "d", netAmount: Number.NaN },
    ];
    expect(findNegativeNet(rows).map((r) => r.id)).toEqual(["c"]);
  });
});
