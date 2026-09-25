import { describe, it, expect } from "vitest";
import { summarizeJournalWeek, shiftWeek } from "@/lib/student/journal-week";

const DATES = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"];

const CATEGORIES = [
  { indicators: [{ id: "i1" }, { id: "i2" }] },
  { indicators: [{ id: "i3" }] },
];

describe("summarizeJournalWeek", () => {
  it("returns an all-zero week when nothing is filled", () => {
    const s = summarizeJournalWeek(CATEGORIES, [], DATES);
    expect(s.indicatorCount).toBe(3);
    expect(s.dayCount).toBe(5);
    expect(s.filledDays).toBe(0);
    expect(s.checkedCount).toBe(0);
    expect(s.perDay).toEqual(DATES.map((date) => ({ date, checked: 0 })));
  });

  it("counts checked entries per day and how many days are filled", () => {
    const s = summarizeJournalWeek(
      CATEGORIES,
      [
        { indicatorId: "i1", date: DATES[0], checked: true },
        { indicatorId: "i2", date: DATES[0], checked: true },
        { indicatorId: "i1", date: DATES[2], checked: true },
      ],
      DATES,
    );
    expect(s.checkedCount).toBe(3);
    expect(s.filledDays).toBe(2);
    expect(s.perDay[0].checked).toBe(2);
    expect(s.perDay[1].checked).toBe(0);
    expect(s.perDay[2].checked).toBe(1);
  });

  it("ignores unchecked entries", () => {
    const s = summarizeJournalWeek(
      CATEGORIES,
      [
        { indicatorId: "i1", date: DATES[0], checked: false },
        { indicatorId: "i2", date: DATES[0], checked: false },
      ],
      DATES,
    );
    expect(s.checkedCount).toBe(0);
    expect(s.filledDays).toBe(0);
  });

  it("ignores entries against an indicator no longer in the template", () => {
    const s = summarizeJournalWeek(
      CATEGORIES,
      [
        { indicatorId: "retired", date: DATES[0], checked: true },
        { indicatorId: "i1", date: DATES[1], checked: true },
      ],
      DATES,
    );
    expect(s.checkedCount).toBe(1);
    expect(s.filledDays).toBe(1);
    expect(s.perDay[0].checked).toBe(0);
  });

  it("ignores an entry dated outside the requested week", () => {
    const s = summarizeJournalWeek(
      CATEGORIES,
      [{ indicatorId: "i1", date: "2026-08-24", checked: true }],
      DATES,
    );
    expect(s.checkedCount).toBe(0);
    expect(s.perDay).toHaveLength(5);
  });

  it("reports zero indicators when the tenant has no template categories", () => {
    const s = summarizeJournalWeek([], [], DATES);
    expect(s.indicatorCount).toBe(0);
    expect(s.filledDays).toBe(0);
  });
});

describe("shiftWeek", () => {
  it("steps back a week", () => {
    expect(shiftWeek("2026-08-17", -1)).toBe("2026-08-10");
  });

  it("steps forward a week", () => {
    expect(shiftWeek("2026-08-17", 1)).toBe("2026-08-24");
  });

  it("crosses a month boundary", () => {
    expect(shiftWeek("2026-08-31", 1)).toBe("2026-09-07");
  });

  it("crosses a year boundary", () => {
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("is a no-op at delta 0", () => {
    expect(shiftWeek("2026-08-17", 0)).toBe("2026-08-17");
  });
});
