import { describe, it, expect } from "vitest";
import {
  checkThemes,
  checkWeekCoverage,
  checkHomerooms,
  checkLinkedIndicators,
  checkHolidays,
  eachDay,
  allPassed,
  CURRICULUM_ELEMENTS,
  AGE_GROUPS,
  type SemesterInput,
  type WeekInput,
  type LinkedIndicatorInput,
} from "../readiness";

const semester: SemesterInput = {
  id: "sem-1",
  number: 1,
  startDate: "2026-07-13",
  endDate: "2026-07-24",
  themeCount: 2,
};

/** Two Mon–Fri weeks that exactly tile the semester above. */
const fullWeeks: WeekInput[] = [
  {
    number: 1,
    startDate: "2026-07-13",
    endDate: "2026-07-17",
    semesterId: "sem-1",
  },
  {
    number: 2,
    startDate: "2026-07-20",
    endDate: "2026-07-24",
    semesterId: "sem-1",
  },
];

/** Every ageGroup × element combination linked. */
function fullIndicators(): LinkedIndicatorInput[] {
  const out: LinkedIndicatorInput[] = [];
  for (const ageGroup of AGE_GROUPS) {
    for (const element of CURRICULUM_ELEMENTS) {
      out.push({ ageGroup, element, linkedCount: 3 });
    }
  }
  return out;
}

describe("eachDay", () => {
  it("is inclusive of both ends", () => {
    expect(eachDay("2026-07-13", "2026-07-15")).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(eachDay("2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("checkThemes", () => {
  it("passes when every semester has themes", () => {
    expect(checkThemes([semester]).status).toBe("PASS");
  });

  it("fails when there are no active semesters", () => {
    const r = checkThemes([]);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/Tidak ada semester ACTIVE/);
  });

  it("fails and names semesters with zero themes", () => {
    const r = checkThemes([{ ...semester, themeCount: 0 }]);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/Semester 1/);
  });
});

describe("checkWeekCoverage", () => {
  it("passes when weeks tile every school day", () => {
    const r = checkWeekCoverage(semester, fullWeeks);
    expect(r.status).toBe("PASS");
  });

  it("ignores weekends when looking for gaps", () => {
    // The Sat/Sun between the two weeks is uncovered but must not fail.
    const r = checkWeekCoverage(semester, fullWeeks);
    expect(r.detail).not.toMatch(/tidak tercakup/);
  });

  it("fails when a whole week is missing", () => {
    const r = checkWeekCoverage(semester, [fullWeeks[0]]);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/2026-07-20/);
  });

  it("fails when the semester has no weeks at all", () => {
    const r = checkWeekCoverage(semester, []);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/Tidak ada pekan/);
  });

  it("ignores weeks belonging to another semester", () => {
    const r = checkWeekCoverage(semester, [
      { ...fullWeeks[0], semesterId: "sem-2" },
      fullWeeks[1],
    ]);
    expect(r.status).toBe("FAIL");
  });
});

describe("checkHomerooms", () => {
  it("passes when every class has exactly one walas", () => {
    const r = checkHomerooms([
      { id: "c1", name: "TKIT A", homeroomCount: 1 },
      { id: "c2", name: "TKIT B", homeroomCount: 1 },
    ]);
    expect(r.status).toBe("PASS");
  });

  it("fails and names classes with no walas", () => {
    const r = checkHomerooms([
      { id: "c1", name: "TKIT A", homeroomCount: 0 },
      { id: "c2", name: "TKIT B", homeroomCount: 1 },
    ]);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/tanpa walas: TKIT A/);
  });

  it("fails and names classes with more than one walas", () => {
    const r = checkHomerooms([{ id: "c1", name: "KB Aster", homeroomCount: 2 }]);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/walas ganda: KB Aster \(2\)/);
  });

  it("fails when there are no active classes", () => {
    expect(checkHomerooms([]).status).toBe("FAIL");
  });
});

describe("checkLinkedIndicators", () => {
  it("passes when all 10 ageGroup × element pairs are covered", () => {
    const r = checkLinkedIndicators(fullIndicators());
    expect(r.status).toBe("PASS");
    expect(r.detail).toMatch(/30 indikator/);
  });

  it("fails and names the missing pairs", () => {
    const rows = fullIndicators().filter(
      (r) => !(r.ageGroup === "B" && r.element === "ART"),
    );
    const r = checkLinkedIndicators(rows);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/TK B\/ART/);
  });

  it("treats a zero linkedCount as missing", () => {
    const rows = fullIndicators().map((r) =>
      r.ageGroup === "A" && r.element === "STEAM" ? { ...r, linkedCount: 0 } : r,
    );
    const r = checkLinkedIndicators(rows);
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/TK A\/STEAM/);
  });

  it("fails on an empty input", () => {
    expect(checkLinkedIndicators([]).status).toBe("FAIL");
  });
});

describe("checkHolidays", () => {
  it("passes when both calendar years of the window have holidays", () => {
    const r = checkHolidays(
      ["2026-08-17", "2027-01-01"],
      "2026-07-01",
      "2027-06-30",
    );
    expect(r.status).toBe("PASS");
  });

  it("fails when the window has no holidays at all", () => {
    const r = checkHolidays([], "2026-07-01", "2027-06-30");
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/Tidak ada hari libur/);
  });

  it("fails when only the first calendar year is loaded", () => {
    // The known prod state: holidays.ts is calendar-2026 only, so the
    // Jan–Jun 2027 half of the academic year has none.
    const r = checkHolidays(["2026-08-17"], "2026-07-01", "2027-06-30");
    expect(r.status).toBe("FAIL");
    expect(r.detail).toMatch(/2027 kosong/);
  });

  it("ignores holidays outside the window", () => {
    const r = checkHolidays(["2025-12-25"], "2026-07-01", "2027-06-30");
    expect(r.status).toBe("FAIL");
  });
});

describe("allPassed", () => {
  it("is true only when every check passed", () => {
    expect(
      allPassed([{ name: "a", status: "PASS", detail: "" }]),
    ).toBe(true);
    expect(
      allPassed([
        { name: "a", status: "PASS", detail: "" },
        { name: "b", status: "FAIL", detail: "" },
      ]),
    ).toBe(false);
  });
});
