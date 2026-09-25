import { describe, expect, it } from "vitest";
import { parentAttendanceWeek } from "./attendance-week";

describe("parentAttendanceWeek", () => {
  it("uses the WIB calendar day when UTC is still Sunday", () => {
    const week = parentAttendanceWeek(new Date("2026-08-09T17:30:00Z"));
    expect(week.today).toBe("2026-08-10");
    expect(week.days).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
    ]);
    expect(week.prevWeek).toBe("2026-08-03");
    expect(week.nextWeek).toBe("2026-08-17");
  });

  it("rejects invalid week query values without shifting from the WIB week", () => {
    expect(parentAttendanceWeek(new Date("2026-08-09T17:30:00Z"), "2026-02-30").days[0])
      .toBe("2026-08-10");
  });
});
