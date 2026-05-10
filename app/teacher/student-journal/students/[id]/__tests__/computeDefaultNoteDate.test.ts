import { describe, it, expect } from "vitest";
import { computeDefaultNoteDate } from "../page";

describe("computeDefaultNoteDate", () => {
  // Visible week: Mon 2026-04-27 → Fri 2026-05-01
  const weekParam = "2026-04-27";

  it("returns today when today is a weekday within the visible week (Wednesday)", () => {
    expect(computeDefaultNoteDate(weekParam, "2026-04-29")).toBe("2026-04-29");
  });

  it("returns today when today is Monday of the visible week", () => {
    expect(computeDefaultNoteDate(weekParam, "2026-04-27")).toBe("2026-04-27");
  });

  it("returns Friday of visible week when today is Saturday of that week", () => {
    // today = 2026-05-02 (Saturday after the visible Fri 2026-05-01)
    expect(computeDefaultNoteDate(weekParam, "2026-05-02")).toBe("2026-05-01");
  });

  it("returns Friday of visible week when today is Sunday after the visible week", () => {
    // today = 2026-05-03 (Sunday), visible Fri = 2026-05-01
    expect(computeDefaultNoteDate(weekParam, "2026-05-03")).toBe("2026-05-01");
  });

  it("returns Friday of visible week when today is much later (week is past)", () => {
    // today = 2026-06-15, well past visible Fri 2026-05-01
    expect(computeDefaultNoteDate(weekParam, "2026-06-15")).toBe("2026-05-01");
  });

  it("clamps to today when visible week is in the future (Friday > today)", () => {
    // visible week Mon 2026-05-11–Fri 2026-05-15, but today = 2026-05-06 (outside range, before Mon)
    const futureWeek = "2026-05-11";
    expect(computeDefaultNoteDate(futureWeek, "2026-05-06")).toBe("2026-05-06");
  });
});
