/**
 * F-20 coverage for the dashboard "tidak hadir" stat helper.
 *
 * Rule contract:
 *   - Past weekend → 0 absent (school closed).
 *   - Past holiday → 0 absent (school closed).
 *   - Past working day → plain count of rows with no attendance record.
 *   - Today → plain count regardless of weekday (admin uses it to chase
 *     no-shows mid-day).
 *   - Future date → plain count (defensive — UI doesn't normally allow
 *     future selection, but the helper shouldn't return weird values).
 */
import { describe, it, expect } from "vitest";
import { computeAbsentCount, isWeekend } from "../absent-stat";

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

  it("for TODAY, weekend/holiday short-circuit does NOT apply (live view)", () => {
    // Even if today is a Saturday, admin still wants to see who hasn't
    // clocked in (e.g. weekend events, on-call staff).
    const out = computeAbsentCount({
      selectedDate: "2026-05-02", // Saturday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(["2026-05-02"]), // even if today is also a holiday
    });
    expect(out).toBe(2);
  });

  it("for future dates, returns plain count (no weekend exclusion)", () => {
    const out = computeAbsentCount({
      selectedDate: "2026-05-09", // future Saturday
      today: "2026-05-02",
      data: ROWS,
      holidays: new Set(),
    });
    expect(out).toBe(2);
  });
});
