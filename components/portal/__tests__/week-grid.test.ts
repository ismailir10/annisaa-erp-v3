import { describe, expect, it } from "vitest";
import { isWeekGridDateEditable } from "../week-grid";

describe("isWeekGridDateEditable", () => {
  const today = "2026-07-30";

  it("lets admin correction mode edit past dates but not future dates", () => {
    expect(isWeekGridDateEditable("2026-07-29", today, false)).toBe(true);
    expect(isWeekGridDateEditable(today, today, false)).toBe(true);
    expect(isWeekGridDateEditable("2026-07-31", today, false)).toBe(false);
  });

  it("keeps parent anti-backfill mode limited to today", () => {
    expect(isWeekGridDateEditable("2026-07-29", today, true)).toBe(false);
    expect(isWeekGridDateEditable(today, today, true)).toBe(true);
  });
});
