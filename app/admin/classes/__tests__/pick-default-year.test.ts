import { describe, it, expect } from "vitest";
import { pickDefaultYear, type YearLike } from "../pick-default-year";

const y = (id: string, status: string, startDate: string, endDate: string): YearLike => ({
  id,
  status,
  startDate,
  endDate,
});

const TODAY = new Date("2026-06-05T08:00:00.000Z");

describe("pickDefaultYear", () => {
  it("prefers the ACTIVE year whose date range covers today over other ACTIVE years", () => {
    const years = [
      y("future", "ACTIVE", "2030-07-01", "2031-06-30"), // ACTIVE but future (the old bug: API returns this first)
      y("current", "ACTIVE", "2025-07-14", "2026-06-20"), // covers today
      y("planning", "PLANNING", "2026-07-01", "2027-06-30"),
    ];
    expect(pickDefaultYear(years, TODAY)?.id).toBe("current");
  });

  it("ignores non-ACTIVE years even if their range covers today", () => {
    const years = [
      y("planning-now", "PLANNING", "2025-07-14", "2026-06-20"),
      y("active-future", "ACTIVE", "2030-07-01", "2031-06-30"),
    ];
    expect(pickDefaultYear(years, TODAY)?.id).toBe("active-future");
  });

  it("falls back to the most-recently-started ACTIVE year when none cover today (between terms)", () => {
    const years = [
      y("older", "ACTIVE", "2024-07-01", "2025-06-30"),
      y("newer", "ACTIVE", "2025-07-01", "2026-01-31"), // ended before today
    ];
    expect(pickDefaultYear(years, TODAY)?.id).toBe("newer");
  });

  it("falls back to the first year when none are ACTIVE", () => {
    const years = [
      y("a", "PLANNING", "2026-07-01", "2027-06-30"),
      y("b", "ARCHIVED", "2024-07-01", "2025-06-30"),
    ];
    expect(pickDefaultYear(years, TODAY)?.id).toBe("a");
  });

  it("returns undefined for an empty list", () => {
    expect(pickDefaultYear([], TODAY)).toBeUndefined();
  });

  it("treats the end day inclusively (today == endDate)", () => {
    const years = [y("ends-today", "ACTIVE", "2025-07-01", "2026-06-05")];
    expect(pickDefaultYear(years, TODAY)?.id).toBe("ends-today");
  });
});
