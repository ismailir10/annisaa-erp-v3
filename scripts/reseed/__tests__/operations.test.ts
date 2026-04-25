import { describe, it, expect } from "vitest";
import { enumerateSchoolDays, applyDensityRule } from "../operations";

describe("enumerateSchoolDays", () => {
  it("excludes weekends", () => {
    // 2025-07-14 is Mon; 2025-07-20 is Sun.
    const days = enumerateSchoolDays({ start: "2025-07-14", end: "2025-07-20" });
    expect(days).toEqual([
      "2025-07-14",
      "2025-07-15",
      "2025-07-16",
      "2025-07-17",
      "2025-07-18",
    ]);
  });

  it("excludes holidays", () => {
    const days = enumerateSchoolDays({
      start: "2026-01-01",
      end: "2026-01-05",
      holidayDates: new Set(["2026-01-01"]),
    });
    expect(days).not.toContain("2026-01-01");
    expect(days).toContain("2026-01-02");
  });

  it("returns empty when start > end", () => {
    expect(
      enumerateSchoolDays({ start: "2025-07-20", end: "2025-07-14" }),
    ).toEqual([]);
  });
});

describe("applyDensityRule", () => {
  // Build a one-month dense list: every Mon-Fri date in 2026-04.
  const days = enumerateSchoolDays({
    start: "2026-03-01",
    end: "2026-04-25",
  });

  it("keeps every day inside the full-density window", () => {
    const filtered = applyDensityRule(days, "2026-04-25", 30);
    const recent = days.filter((d) => d >= "2026-03-26");
    expect(recent.every((d) => filtered.includes(d))).toBe(true);
  });

  it("samples Mon/Wed/Fri only outside the window", () => {
    const filtered = applyDensityRule(days, "2026-04-25", 30);
    const old = filtered.filter((d) => d < "2026-03-26");
    for (const d of old) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect([1, 3, 5]).toContain(dow);
    }
  });

  it("with windowDays=0 samples every date Mon/Wed/Fri", () => {
    const filtered = applyDensityRule(days, "2026-04-25", 0);
    for (const d of filtered) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect([1, 3, 5]).toContain(dow);
    }
  });
});
