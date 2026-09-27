/**
 * F-20 coverage for the dashboard "tidak hadir" stat helper.
 *
 * Rule contract (Cycle 3 T7/T8 — fixed the "Alpa" bug: a non-working
 * *today* used to fall through to the plain count and mark the whole
 * roster absent):
 *   - Weekend (past, today, or future) → 0 absent (school closed).
 *   - Holiday (past, today, or future) → 0 absent (school closed).
 *   - Working day (past, today, or future) → plain count of rows with no
 *     attendance record.
 */
import { describe, it, expect } from "vitest";
import { computeAbsentCount, isNonWorkingDay, isWeekend } from "../absent-stat";

const ROWS = [
  { attendance: { id: "a1" } }, // present
  { attendance: { id: "a2" } }, // present
  { attendance: null }, // no record → contributes to "absent" on working days
  { attendance: null }, // no record
];

describe("isWeekend", () => {
  it("returns true for Saturday", () => {
    expect(isWeekend("2026-05-02")).toBe(true); // 2026-05-02 = Saturday
  });
  it("returns true for Sunday", () => {
    expect(isWeekend("2026-05-03")).toBe(true);
  });
  it("returns false for Monday", () => {
    expect(isWeekend("2026-05-04")).toBe(false);
  });
});

describe("computeAbsentCount — F-20", () => {
  it("ignores past weekends → 0 absent", () => {
    // Saturday in the past — school closed. Should NOT count rows with no
    // attendance toward "tidak hadir".
    const out = computeAbsentCount({
      selectedDate: "2026-04-25", // Saturday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(0);
  });

  it("ignores past holidays → 0 absent", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-04-30", // Thursday but tagged as a holiday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(["2026-04-30"]),
    });
    expect(out).toBe(0);
  });

  it("counts past working-day no-records as absent", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-04-29", // Wednesday, no holiday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(2);
  });

  it("ignores TODAY when it's a weekend → 0 absent (was the Alpa bug: this used to fall through to the plain count)", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-02", // Saturday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(0);
  });

  it("ignores TODAY when it's a holiday → 0 absent", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-04", // Monday, tagged as a holiday
      today: "2026-05-04",
      data: ROWS,
      holidays: new Set(["2026-05-04"]),
    });
    expect(out).toBe(0);
  });

  it("counts TODAY when it's a working day, no holiday", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-04", // Monday, no holiday
      today: "2026-05-04",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(2);
  });

  it("ignores future weekends too → 0 absent", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-09", // future Saturday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(0);
  });

  it("counts future working days with no holiday tagged", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-11", // future Monday, no holiday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(2);
  });
});

describe("isNonWorkingDay — tenant working days", () => {
  const none = new Set<string>();
  // 2026-09-26 is a Saturday, 2026-09-27 a Sunday, 2026-09-28 a Monday.
  it("falls back to Sat/Sun when working days are unknown", () => {
    expect(isNonWorkingDay("2026-09-26", none, null)).toBe(true);
    expect(isNonWorkingDay("2026-09-28", none, [])).toBe(false);
  });
  it("treats a configured Saturday as a working day", () => {
    expect(isNonWorkingDay("2026-09-26", none, ["MON", "TUE", "WED", "THU", "FRI", "SAT"])).toBe(false);
    expect(isNonWorkingDay("2026-09-27", none, ["MON", "TUE", "WED", "THU", "FRI", "SAT"])).toBe(true);
  });
  it("treats an unconfigured weekday as closed", () => {
    expect(isNonWorkingDay("2026-09-28", none, ["TUE", "WED", "THU", "FRI"])).toBe(true);
  });
  it("a holiday is closed even on a configured working day", () => {
    expect(isNonWorkingDay("2026-09-28", new Set(["2026-09-28"]), ["MON"])).toBe(true);
  });
  it("counts no-shows on a Saturday the tenant works", () => {
    expect(
      computeAbsentCount({
        selectedDate: "2026-09-26",
        data: [{ attendance: null }, { attendance: { status: "PRESENT" } }],
        holidays: none,
        workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
      }),
    ).toBe(1);
  });
});

