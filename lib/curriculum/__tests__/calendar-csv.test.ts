import { describe, it, expect } from "vitest";
import {
  splitCsvLine,
  parseCalendarCsv,
  buildCalendarPlan,
  CALENDAR_CSV_HEADER,
  type CalendarRow,
} from "../calendar-csv";

const HEADER = CALENDAR_CSV_HEADER.join(",");

/** Two contiguous Mon–Fri weeks in the same sub-theme. */
const GOOD_CSV = [
  HEADER,
  "1,Diriku,1,Tubuhku,1,2026-07-13,2026-07-17",
  "1,Diriku,1,Tubuhku,2,2026-07-20,2026-07-24",
  "1,Diriku,2,Panca Indera,3,2026-07-27,2026-07-31",
  "2,Lingkunganku,1,Rumahku,4,2026-08-03,2026-08-07",
].join("\n");

function row(overrides: Partial<CalendarRow> = {}): CalendarRow {
  return {
    themeOrder: 1,
    themeName: "Diriku",
    subThemeOrder: 1,
    subThemeName: "Tubuhku",
    weekNumber: 1,
    startDate: "2026-07-13",
    endDate: "2026-07-17",
    ...overrides,
  };
}

describe("splitCsvLine", () => {
  it("splits plain fields and trims", () => {
    expect(splitCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("honours quoted fields containing commas", () => {
    expect(splitCsvLine('1,"Diriku, Tubuhku",2')).toEqual([
      "1",
      "Diriku, Tubuhku",
      "2",
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(splitCsvLine('1,"Tema ""Aku""",2')).toEqual(["1", 'Tema "Aku"', "2"]);
  });
});

describe("parseCalendarCsv", () => {
  it("parses a well-formed calendar", () => {
    const { rows, issues } = parseCalendarCsv(GOOD_CSV);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      themeOrder: 1,
      themeName: "Diriku",
      subThemeOrder: 1,
      subThemeName: "Tubuhku",
      weekNumber: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-17",
    });
  });

  it("rejects an empty file", () => {
    const { issues } = parseCalendarCsv("");
    expect(issues[0].message).toMatch(/kosong/i);
  });

  it("rejects a wrong header and stops", () => {
    const { rows, issues } = parseCalendarCsv(
      ["theme,subtheme,week", "1,Diriku,1"].join("\n"),
    );
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(1);
    expect(issues[0].message).toMatch(/Header CSV harus persis/);
  });

  it("reports the line number for a wrong column count", () => {
    const { rows, issues } = parseCalendarCsv(
      [HEADER, "1,Diriku,1,Tubuhku,1,2026-07-13"].join("\n"),
    );
    expect(rows).toEqual([]);
    expect(issues[0].line).toBe(2);
    expect(issues[0].message).toMatch(/Butuh 7 kolom, ditemukan 6/);
  });

  it("rejects non-integer and zero ordinals", () => {
    const { issues } = parseCalendarCsv(
      [HEADER, "0,Diriku,1,Tubuhku,1.5,2026-07-13,2026-07-17"].join("\n"),
    );
    expect(issues.map((i) => i.message).join(" ")).toMatch(/theme_order/);
    expect(issues.map((i) => i.message).join(" ")).toMatch(/week_number/);
  });

  it("rejects a malformed date and an impossible date", () => {
    const { issues } = parseCalendarCsv(
      [
        HEADER,
        "1,Diriku,1,Tubuhku,1,13-07-2026,2026-07-17",
        "1,Diriku,1,Tubuhku,2,2026-02-30,2026-02-28",
      ].join("\n"),
    );
    expect(issues.some((i) => i.message.includes("13-07-2026"))).toBe(true);
    expect(issues.some((i) => i.message.includes("2026-02-30"))).toBe(true);
  });

  it("ignores blank lines and trailing newline", () => {
    const { rows, issues } = parseCalendarCsv(`${GOOD_CSV}\n\n`);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(4);
  });
});

describe("buildCalendarPlan", () => {
  it("groups a valid calendar into themes → sub-themes → weeks", () => {
    const { rows } = parseCalendarCsv(GOOD_CSV);
    const { plan, issues } = buildCalendarPlan(rows);
    expect(issues).toEqual([]);
    expect(plan.weekCount).toBe(4);
    expect(plan.themes.map((t) => t.name)).toEqual(["Diriku", "Lingkunganku"]);
    expect(plan.themes[0].subThemes.map((s) => s.name)).toEqual([
      "Tubuhku",
      "Panca Indera",
    ]);
    expect(plan.themes[0].subThemes[0].weeks.map((w) => w.number)).toEqual([
      1, 2,
    ]);
  });

  it("flags overlapping week brackets", () => {
    const { issues } = buildCalendarPlan([
      row({ weekNumber: 1, startDate: "2026-07-13", endDate: "2026-07-17" }),
      // Starts before the previous week ends.
      row({ weekNumber: 2, startDate: "2026-07-16", endDate: "2026-07-24" }),
    ]);
    expect(issues.some((i) => /bertabrakan/.test(i.message))).toBe(true);
  });

  it("flags a gap in week numbering", () => {
    const { issues } = buildCalendarPlan([
      row({ weekNumber: 1 }),
      row({
        weekNumber: 3,
        startDate: "2026-07-20",
        endDate: "2026-07-24",
      }),
    ]);
    expect(issues.some((i) => /berurutan mulai dari 1/.test(i.message))).toBe(
      true,
    );
  });

  it("flags a duplicate week number", () => {
    const { issues } = buildCalendarPlan([
      row({ weekNumber: 1 }),
      row({ weekNumber: 1, startDate: "2026-07-20", endDate: "2026-07-24" }),
    ]);
    expect(issues.some((i) => /muncul 2 kali/.test(i.message))).toBe(true);
  });

  it("flags a non-Monday start and non-Friday end", () => {
    const { issues } = buildCalendarPlan([
      // 2026-07-14 is a Tuesday, 2026-07-18 a Saturday.
      row({ startDate: "2026-07-14", endDate: "2026-07-18" }),
    ]);
    expect(issues.some((i) => /bukan hari Senin/.test(i.message))).toBe(true);
    expect(issues.some((i) => /bukan hari Jumat/.test(i.message))).toBe(true);
  });

  it("allows a non-Mon-Fri week when requireMonFri is off", () => {
    const { issues } = buildCalendarPlan(
      [row({ startDate: "2026-07-14", endDate: "2026-07-18" })],
      { requireMonFri: false },
    );
    expect(issues).toEqual([]);
  });

  it("flags start_date after end_date", () => {
    const { issues } = buildCalendarPlan(
      [row({ startDate: "2026-07-17", endDate: "2026-07-13" })],
      { requireMonFri: false },
    );
    expect(issues.some((i) => /melewati end_date/.test(i.message))).toBe(true);
  });

  it("flags weeks outside the semester window", () => {
    const { rows } = parseCalendarCsv(GOOD_CSV);
    const { issues } = buildCalendarPlan(rows, {
      semesterStart: "2026-07-20",
      semesterEnd: "2026-07-31",
    });
    expect(issues.some((i) => /sebelum awal semester/.test(i.message))).toBe(
      true,
    );
    expect(issues.some((i) => /setelah akhir semester/.test(i.message))).toBe(
      true,
    );
  });

  it("flags a theme name carrying two different orders", () => {
    const { issues } = buildCalendarPlan([
      row({ weekNumber: 1, themeOrder: 1 }),
      row({
        weekNumber: 2,
        themeOrder: 2,
        startDate: "2026-07-20",
        endDate: "2026-07-24",
      }),
    ]);
    expect(issues.some((i) => /theme_order berbeda/.test(i.message))).toBe(true);
  });

  it("flags an empty row set", () => {
    const { issues } = buildCalendarPlan([]);
    expect(issues[0].message).toMatch(/Tidak ada baris pekan/);
  });
});
