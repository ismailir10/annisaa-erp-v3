import { describe, it, expect } from "vitest";
import { INCOME_RANGES, isIncomeRangeKey, formatIncomeRange } from "../income";

describe("INCOME_RANGES", () => {
  it("has exactly 5 canonical keys", () => {
    expect(Object.keys(INCOME_RANGES)).toEqual(["LT_1M", "R_1_3M", "R_3_5M", "R_5_10M", "GT_10M"]);
  });

  it("renders Indonesian labels with Rp prefix and Juta suffix", () => {
    expect(INCOME_RANGES.LT_1M).toBe("< Rp 1 Juta");
    expect(INCOME_RANGES.R_5_10M).toBe("Rp 5 - 10 Juta");
    expect(INCOME_RANGES.GT_10M).toBe("> Rp 10 Juta");
  });
});

describe("isIncomeRangeKey", () => {
  it("accepts canonical keys", () => {
    expect(isIncomeRangeKey("LT_1M")).toBe(true);
    expect(isIncomeRangeKey("R_3_5M")).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isIncomeRangeKey("FOO")).toBe(false);
    expect(isIncomeRangeKey("")).toBe(false);
    expect(isIncomeRangeKey(null)).toBe(false);
  });
});

describe("formatIncomeRange", () => {
  it("returns the label for a known key", () => {
    expect(formatIncomeRange("R_3_5M")).toBe("Rp 3 - 5 Juta");
  });
  it("returns null for unknown input", () => {
    expect(formatIncomeRange(null)).toBe(null);
    expect(formatIncomeRange("FOO")).toBe(null);
  });
});
