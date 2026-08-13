import { describe, it, expect } from "vitest";
import {
  homeEntryEditFloor,
  isHomeEntryDateEditable,
} from "@/lib/student-journal/backfill";

describe("homeEntryEditFloor", () => {
  it("returns the Monday of the week before today's week (Thursday today)", () => {
    // 2026-08-13 is a Thursday; its own week starts 2026-08-10 (Monday);
    // one week back is 2026-08-03 (Monday).
    expect(homeEntryEditFloor("2026-08-13")).toBe("2026-08-03");
  });

  it("edge case: today IS a Monday — floor is exactly 7 days back", () => {
    // 2026-08-10 is itself a Monday, so weekStart(today) === today.
    expect(homeEntryEditFloor("2026-08-10")).toBe("2026-08-03");
  });

  it("edge case: today is a Sunday — weekStart maps it to the PRECEDING Monday", () => {
    // 2026-08-16 is a Sunday. week.ts maps Sunday (dow === 0) back to the
    // Monday that started its own week (2026-08-10), not forward to the
    // next Monday. One week back from there is 2026-08-03.
    expect(homeEntryEditFloor("2026-08-16")).toBe("2026-08-03");
  });

  it("handles a month boundary (today in September, floor in August)", () => {
    // 2026-09-03 is a Thursday; its week starts 2026-08-31 (Monday);
    // one week back is 2026-08-24 (Monday) — crosses the month rollover.
    expect(homeEntryEditFloor("2026-09-03")).toBe("2026-08-24");
  });

  it("handles a year boundary (today in January, floor in December)", () => {
    // 2027-01-04 is a Monday; one week back is 2026-12-28 (Monday) —
    // crosses the year rollover.
    expect(homeEntryEditFloor("2027-01-04")).toBe("2026-12-28");
  });
});

describe("isHomeEntryDateEditable", () => {
  const today = "2026-08-13"; // Thursday; floor is 2026-08-03 (Monday)

  it("today itself is editable", () => {
    expect(isHomeEntryDateEditable("2026-08-13", today)).toBe(true);
  });

  it("yesterday is editable", () => {
    expect(isHomeEntryDateEditable("2026-08-12", today)).toBe(true);
  });

  it("the Monday of the previous week is editable (exact floor)", () => {
    expect(isHomeEntryDateEditable("2026-08-03", today)).toBe(true);
  });

  it("the Sunday immediately before the floor is NOT editable", () => {
    expect(isHomeEntryDateEditable("2026-08-02", today)).toBe(false);
  });

  it("tomorrow is NOT editable", () => {
    expect(isHomeEntryDateEditable("2026-08-14", today)).toBe(false);
  });

  it("edge case: today is a Monday — the previous Monday is still editable", () => {
    const mondayToday = "2026-08-10";
    // Floor is exactly 7 days back.
    expect(isHomeEntryDateEditable("2026-08-03", mondayToday)).toBe(true);
    // One day further back is out of the window.
    expect(isHomeEntryDateEditable("2026-08-02", mondayToday)).toBe(false);
  });

  it("edge case: today is a Sunday — floor still anchors to the Monday two weeks back from the next week", () => {
    const sundayToday = "2026-08-16";
    expect(homeEntryEditFloor(sundayToday)).toBe("2026-08-03");
    expect(isHomeEntryDateEditable("2026-08-03", sundayToday)).toBe(true);
    expect(isHomeEntryDateEditable("2026-08-02", sundayToday)).toBe(false);
    expect(isHomeEntryDateEditable(sundayToday, sundayToday)).toBe(true);
  });

  it("respects a month-boundary window", () => {
    const septToday = "2026-09-03";
    expect(isHomeEntryDateEditable("2026-08-24", septToday)).toBe(true);
    expect(isHomeEntryDateEditable("2026-08-23", septToday)).toBe(false);
  });

  it("respects a year-boundary window", () => {
    const janToday = "2027-01-04";
    expect(isHomeEntryDateEditable("2026-12-28", janToday)).toBe(true);
    expect(isHomeEntryDateEditable("2026-12-27", janToday)).toBe(false);
  });
});
