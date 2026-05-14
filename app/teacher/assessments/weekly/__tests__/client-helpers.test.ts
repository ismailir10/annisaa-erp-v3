import { describe, it, expect } from "vitest";
import { weekDays, pickInitialDay } from "../client";

const week = {
  id: "wk1",
  number: 3,
  startDate: "2026-05-11",
  endDate: "2026-05-15",
  subTheme: { id: "st1", name: "Sub" },
  theme: { id: "th1", name: "Theme" },
};

describe("weekDays", () => {
  it("returns 5 ymd strings Mon..Fri", () => {
    expect(weekDays(week)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
  });
});

describe("pickInitialDay", () => {
  it("picks today when today is within the week", () => {
    expect(pickInitialDay(week, "2026-05-13")).toBe("2026-05-13");
  });

  it("falls back to Monday when today is outside the week", () => {
    expect(pickInitialDay(week, "2026-05-16")).toBe("2026-05-11");
  });

  it("falls back to Monday when ymd is before the week", () => {
    expect(pickInitialDay(week, "2026-05-04")).toBe("2026-05-11");
  });
});
