import { describe, expect, it } from "vitest";
import {
  academicYearFor,
  academicYearStartingIn,
  activeSemesterOf,
  addDays,
  createRng,
  firstOfMonthShifted,
  isSchoolDay,
  latestSchoolDay,
  mondayOnOrAfter,
  monthLabelId,
  schoolDaysEndingAt,
  seedToday,
  termsOfSemester,
  weekdayOf,
  weeksOfSemester,
} from "../calendar";
import { allHolidays } from "../holidays";

const HOLIDAYS = new Set(allHolidays.map((h) => h.date));

/** Every calendar day of `year`-01-01 … `year+2`-12-31, sampled daily. */
function* eachDay(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

describe("seed calendar — date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows the weekday of a calendar day", () => {
    expect(weekdayOf("2026-09-29")).toBe(2); // Tuesday
    expect(weekdayOf("2026-10-03")).toBe(6); // Saturday
  });

  it("finds the Monday on or after a date", () => {
    expect(mondayOnOrAfter("2026-07-13")).toBe("2026-07-13");
    expect(mondayOnOrAfter("2026-07-10")).toBe("2026-07-13");
    expect(mondayOnOrAfter("2026-07-14")).toBe("2026-07-20");
  });

  it("shifts months without day drift and labels them in Indonesian", () => {
    expect(firstOfMonthShifted("2026-01-31", -1)).toBe("2025-12-01");
    expect(firstOfMonthShifted("2026-11-15", 3)).toBe("2027-02-01");
    expect(monthLabelId("2026-09-29")).toBe("September 2026");
  });
});

describe("seed calendar — SEED_TODAY", () => {
  it("uses the override when valid", () => {
    expect(seedToday({ SEED_TODAY: "2026-10-03" })).toBe("2026-10-03");
  });

  it("rejects a malformed override instead of seeding garbage", () => {
    expect(() => seedToday({ SEED_TODAY: "next tuesday" })).toThrow(/SEED_TODAY/);
    expect(() => seedToday({ SEED_TODAY: "2026-13-40" })).toThrow(/SEED_TODAY/);
  });

  it("resolves the Jakarta day, not the UTC day", () => {
    // 20:00 UTC on the 28th is 03:00 WIB on the 29th.
    expect(seedToday({}, new Date("2026-09-28T20:00:00Z"))).toBe("2026-09-29");
  });
});

describe("seed calendar — academic years and semesters", () => {
  it("builds 2026/2027 as contiguous, Monday-aligned spans", () => {
    const cal = academicYearStartingIn(2026);
    expect(cal.name).toBe("2026/2027");
    expect(cal.start).toBe("2026-07-13");
    expect(cal.semesters[0]).toEqual({ number: 1, start: "2026-07-13", end: "2027-01-03" });
    expect(cal.semesters[1]).toEqual({ number: 2, start: "2027-01-04", end: "2027-07-11" });
    expect(cal.end).toBe("2027-07-11");
    expect(weekdayOf(cal.start)).toBe(1);
    expect(weekdayOf(cal.semesters[1].start)).toBe(1);
  });

  it("reproduces the previous year's boundaries (2025/2026)", () => {
    const prev = academicYearStartingIn(2025);
    expect(prev.start).toBe("2025-07-14");
    expect(prev.semesters[1].start).toBe("2026-01-05");
  });

  it("puts every day of three years in exactly one semester of exactly one year", () => {
    for (const day of eachDay("2025-01-01", "2028-12-31")) {
      const cal = academicYearFor(day);
      expect(day >= cal.start && day <= cal.end).toBe(true);
      const hits = cal.semesters.filter((s) => day >= s.start && day <= s.end);
      expect(hits).toHaveLength(1);
      expect(activeSemesterOf(cal, day).number).toBe(hits[0].number);
    }
  });

  it("chains year N+1 directly onto year N", () => {
    for (const y of [2025, 2026, 2027, 2028]) {
      expect(addDays(academicYearStartingIn(y).end, 1)).toBe(academicYearStartingIn(y + 1).start);
    }
  });

  it("picks the right year on either side of the July changeover", () => {
    expect(academicYearFor("2026-07-12").name).toBe("2025/2026"); // Sunday before the new year opens
    expect(academicYearFor("2026-07-13").name).toBe("2026/2027");
    expect(academicYearFor("2026-09-29").name).toBe("2026/2027");
    expect(academicYearFor("2027-03-10").name).toBe("2026/2027");
  });
});

describe("seed calendar — weeks and terms", () => {
  it("covers a semester with whole Mon–Fri weeks inside it", () => {
    const sem = academicYearStartingIn(2026).semesters[0];
    const weeks = weeksOfSemester(sem);
    expect(weeks[0].start).toBe(sem.start);
    weeks.forEach((w, i) => {
      expect(w.number).toBe(i + 1);
      expect(weekdayOf(w.start)).toBe(1);
      expect(weekdayOf(w.end)).toBe(5);
      expect(w.end <= sem.end).toBe(true);
    });
    // Every weekday of the semester falls in a week.
    for (const day of eachDay(sem.start, sem.end)) {
      if (weekdayOf(day) === 0 || weekdayOf(day) === 6) continue;
      expect(weeks.some((w) => day >= w.start && day <= w.end)).toBe(true);
    }
  });

  it("splits a semester into two triwulan that tile it", () => {
    const sem = academicYearStartingIn(2026).semesters[0];
    const [t1, t2] = termsOfSemester(sem);
    expect(t1).toMatchObject({ number: 1, start: sem.start });
    expect(t2).toMatchObject({ number: 2, end: sem.end });
    expect(addDays(t1.end, 1)).toBe(t2.start);
  });
});

describe("seed calendar — school days", () => {
  it("skips weekends and seeded holidays", () => {
    expect(isSchoolDay("2026-09-29", HOLIDAYS)).toBe(true);
    expect(isSchoolDay("2026-10-03", HOLIDAYS)).toBe(false); // Saturday
    expect(isSchoolDay("2026-08-17", HOLIDAYS)).toBe(false); // Kemerdekaan
  });

  it("anchors a weekend on the previous Friday (weekday-independent 'today')", () => {
    expect(latestSchoolDay("2026-10-03", HOLIDAYS)).toBe("2026-10-02"); // Saturday → Friday
    expect(latestSchoolDay("2026-10-04", HOLIDAYS)).toBe("2026-10-02"); // Sunday → Friday
    expect(latestSchoolDay("2026-09-29", HOLIDAYS)).toBe("2026-09-29"); // a school day is itself
  });

  it("steps back over a holiday", () => {
    expect(latestSchoolDay("2026-08-17", HOLIDAYS)).toBe("2026-08-14"); // Monday holiday → Friday
  });

  it("returns the last N school days ascending, honoring the floor", () => {
    expect(schoolDaysEndingAt("2026-09-29", 5, HOLIDAYS)).toEqual([
      "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29",
    ]);
    expect(schoolDaysEndingAt("2026-07-15", 5, HOLIDAYS, "2026-07-13")).toEqual([
      "2026-07-13", "2026-07-14", "2026-07-15",
    ]);
  });
});

describe("seed calendar — deterministic rng", () => {
  it("repeats for the same seed and differs across seeds", () => {
    const a = createRng(20260929);
    const b = createRng(20260929);
    const c = createRng(20260930);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA).not.toEqual([c(), c(), c()]);
    seqA.forEach((n) => expect(n >= 0 && n < 1).toBe(true));
  });
});
