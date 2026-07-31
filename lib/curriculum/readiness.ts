/**
 * Curriculum readiness checks — the go/no-go gate for a content load.
 *
 * Every check here corresponds to a way the penilaian flow silently
 * degrades rather than erroring. A walas whose class has no HOMEROOM
 * assignment simply doesn't see the Pekanan card; a date outside every
 * Week bracket reads "Belum ada Pekan aktif"; an element with no
 * theme-linked indicator shows an empty picker. None of those surface as
 * a stack trace, so they need an explicit assertion.
 *
 * Pure module: takes already-fetched data, returns verdicts. The
 * `scripts/verify-curriculum-readiness.ts` wrapper does the querying.
 */

export type CheckStatus = "PASS" | "FAIL";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** Human-readable detail; on FAIL, names the offending rows. */
  detail: string;
}

export const CURRICULUM_ELEMENTS = [
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "MOTOR_SKILLS",
  "ART",
] as const;
export type CurriculumElementName = (typeof CURRICULUM_ELEMENTS)[number];

export const AGE_GROUPS = ["A", "B"] as const;
export type AgeGroupName = (typeof AGE_GROUPS)[number];

export interface SemesterInput {
  id: string;
  number: number;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  themeCount: number;
}

export interface WeekInput {
  number: number;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  semesterId: string;
}

export interface ClassSectionInput {
  id: string;
  name: string;
  homeroomCount: number;
}

export interface LinkedIndicatorInput {
  ageGroup: AgeGroupName;
  element: CurriculumElementName;
  /** Indicators that have at least one IndicatorThemeLink. */
  linkedCount: number;
}

/** Every ACTIVE semester in the year needs at least one theme. */
export function checkThemes(semesters: SemesterInput[]): CheckResult {
  const name = "Tema per semester";
  if (semesters.length === 0) {
    return { name, status: "FAIL", detail: "Tidak ada semester ACTIVE pada tahun ajaran ini." };
  }
  const empty = semesters.filter((s) => s.themeCount === 0);
  if (empty.length > 0) {
    return {
      name,
      status: "FAIL",
      detail: `Semester tanpa tema: ${empty.map((s) => `Semester ${s.number}`).join(", ")}.`,
    };
  }
  return {
    name,
    status: "PASS",
    detail: semesters
      .map((s) => `Semester ${s.number}: ${s.themeCount} tema`)
      .join(" · "),
  };
}

/**
 * Weeks must tile the semester window with no gaps. A gap is any span of
 * ≥1 day inside [start, end] covered by no Week bracket — that's a day on
 * which the walas picker 404s.
 *
 * Weekends are expected gaps (Mon–Fri brackets), so only Mon–Fri days
 * count as uncovered.
 */
export function checkWeekCoverage(
  semester: SemesterInput,
  weeks: WeekInput[],
): CheckResult {
  const name = `Cakupan pekan — Semester ${semester.number}`;
  const own = weeks.filter((w) => w.semesterId === semester.id);
  if (own.length === 0) {
    return { name, status: "FAIL", detail: "Tidak ada pekan sama sekali." };
  }

  const covered = new Set<string>();
  for (const w of own) {
    for (const day of eachDay(w.startDate, w.endDate)) covered.add(day);
  }

  const uncovered: string[] = [];
  for (const day of eachDay(semester.startDate, semester.endDate)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend — no school day expected
    if (!covered.has(day)) uncovered.push(day);
  }

  if (uncovered.length > 0) {
    return {
      name,
      status: "FAIL",
      detail: `${uncovered.length} hari sekolah tidak tercakup pekan mana pun, mulai ${uncovered[0]}${uncovered.length > 1 ? ` sampai ${uncovered[uncovered.length - 1]}` : ""}.`,
    };
  }
  return {
    name,
    status: "PASS",
    detail: `${own.length} pekan menutupi ${semester.startDate} → ${semester.endDate}.`,
  };
}

/** Exactly one HOMEROOM teaching assignment per ACTIVE class. */
export function checkHomerooms(sections: ClassSectionInput[]): CheckResult {
  const name = "Walas per kelas";
  if (sections.length === 0) {
    return { name, status: "FAIL", detail: "Tidak ada kelas ACTIVE pada tahun ajaran ini." };
  }
  const missing = sections.filter((s) => s.homeroomCount === 0);
  const multiple = sections.filter((s) => s.homeroomCount > 1);
  if (missing.length > 0 || multiple.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`tanpa walas: ${missing.map((s) => s.name).join(", ")}`);
    }
    if (multiple.length > 0) {
      parts.push(
        `walas ganda: ${multiple.map((s) => `${s.name} (${s.homeroomCount})`).join(", ")}`,
      );
    }
    return { name, status: "FAIL", detail: parts.join(" · ") };
  }
  return {
    name,
    status: "PASS",
    detail: `${sections.length} kelas, masing-masing tepat 1 walas.`,
  };
}

/**
 * Every (ageGroup × element) pair needs at least one theme-linked ACTIVE
 * indicator, else the walas picker for that element is empty all term.
 */
export function checkLinkedIndicators(
  rows: LinkedIndicatorInput[],
): CheckResult {
  const name = "Indikator terkait tema";
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.ageGroup}:${r.element}`;
    byKey.set(key, (byKey.get(key) ?? 0) + r.linkedCount);
  }
  const gaps: string[] = [];
  for (const ageGroup of AGE_GROUPS) {
    for (const element of CURRICULUM_ELEMENTS) {
      if ((byKey.get(`${ageGroup}:${element}`) ?? 0) === 0) {
        gaps.push(`TK ${ageGroup}/${element}`);
      }
    }
  }
  if (gaps.length > 0) {
    return {
      name,
      status: "FAIL",
      detail: `Tanpa indikator terkait tema: ${gaps.join(", ")}.`,
    };
  }
  const total = [...byKey.values()].reduce((a, b) => a + b, 0);
  return {
    name,
    status: "PASS",
    detail: `${total} indikator terkait tema mencakup 10 kombinasi kelompok usia × elemen.`,
  };
}

/** Holidays must exist somewhere inside the academic-year window. */
export function checkHolidays(
  holidayDates: string[],
  windowStart: string,
  windowEnd: string,
): CheckResult {
  const name = "Kalender libur";
  const inWindow = holidayDates.filter(
    (d) => d >= windowStart && d <= windowEnd,
  );
  if (inWindow.length === 0) {
    return {
      name,
      status: "FAIL",
      detail: `Tidak ada hari libur tercatat antara ${windowStart} dan ${windowEnd}.`,
    };
  }
  // Split by calendar year so a half-loaded calendar (2026 only, per the
  // known prod state) is visible rather than passing on the first half.
  const byYear = new Map<string, number>();
  for (const d of inWindow) {
    const year = d.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  const startYear = windowStart.slice(0, 4);
  const endYear = windowEnd.slice(0, 4);
  if (startYear !== endYear && !byYear.has(endYear)) {
    return {
      name,
      status: "FAIL",
      detail: `Hari libur hanya tercatat untuk ${startYear} (${byYear.get(startYear) ?? 0} hari); ${endYear} kosong.`,
    };
  }
  return {
    name,
    status: "PASS",
    detail: [...byYear.entries()]
      .sort()
      .map(([y, n]) => `${y}: ${n} hari`)
      .join(" · "),
  };
}

/** Inclusive YYYY-MM-DD day iterator. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** True when every check passed. */
export function allPassed(results: CheckResult[]): boolean {
  return results.every((r) => r.status === "PASS");
}
