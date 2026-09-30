// Date-relative calendar helpers for prisma/seed.ts.
//
// The seed used to pin the school calendar to 2025/2026 while other rows were
// relative to "now", so a fresh seed a few months later had no active year,
// no current week and no recent sessions. Everything the seed needs from the
// calendar is derived here from ONE anchor date — `seedToday()` — so a seed on
// any day yields a live, current school.
//
// Pure module (no Prisma, no I/O) so vitest can pin it down. All dates are
// `YYYY-MM-DD` strings on the Asia/Jakarta calendar; arithmetic is done on UTC
// midnight instants so DST-free Jakarta never drops or doubles a day.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format an instant as the Asia/Jakarta calendar day. */
export function jakartaYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * The seed's notion of "today" (Jakarta calendar day).
 *
 * `SEED_TODAY=YYYY-MM-DD` overrides the clock so a run can be rehearsed for any
 * date — e.g. a Saturday, to prove nothing here depends on the weekday. The
 * app itself always reads the real clock; the override only shifts what the
 * SEED believes about the calendar.
 */
export function seedToday(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): string {
  const override = env.SEED_TODAY;
  if (override) {
    if (!YMD_RE.test(override) || Number.isNaN(Date.parse(`${override}T00:00:00Z`))) {
      throw new Error(`SEED_TODAY must be YYYY-MM-DD, got "${override}"`);
    }
    return override;
  }
  return jakartaYmd(now);
}

function toUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  return fromUtc(new Date(toUtc(ymd).getTime() + n * MS_PER_DAY));
}

/** 0 = Sunday … 6 = Saturday, of the calendar day itself. */
export function weekdayOf(ymd: string): number {
  return toUtc(ymd).getUTCDay();
}

export function isWeekend(ymd: string): boolean {
  const dow = weekdayOf(ymd);
  return dow === 0 || dow === 6;
}

/** Monday of the week containing `ymd` (Sunday belongs to the week before). */
export function mondayOf(ymd: string): string {
  const dow = weekdayOf(ymd);
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

/** `ymd` itself when it is a Monday, otherwise the next Monday. */
export function mondayOnOrAfter(ymd: string): string {
  const dow = weekdayOf(ymd);
  return dow === 1 ? ymd : addDays(ymd, (8 - dow) % 7);
}

/** First day of the month `n` months away from `ymd`'s month. */
export function firstOfMonthShifted(ymd: string, n: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "September 2026" — the periodLabel convention used by invoices. */
export function monthLabelId(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${MONTHS_ID[m - 1]} ${y}`;
}

/** Instant for a Jakarta wall-clock time, e.g. `jakartaInstant("2026-09-29", "09:15")`. */
export function jakartaInstant(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00+07:00`);
}

// ── Academic calendar ───────────────────────────────────────────────────────

export type SemesterSpan = { number: 1 | 2; start: string; end: string };
export type AcademicCalendar = {
  /** "2026/2027" */
  name: string;
  start: string;
  end: string;
  semesters: [SemesterSpan, SemesterSpan];
};

/** First Monday on/after 10 July — the school year opens mid-July. */
function yearStartOf(startYear: number): string {
  return mondayOnOrAfter(`${startYear}-07-10`);
}

/**
 * The academic year that begins in `startYear`.
 *
 * Years and semesters are CONTIGUOUS and Monday-aligned: year N+1 starts the
 * day after year N ends, and Semester 2 starts the first Monday of January.
 * That guarantees every calendar day belongs to exactly one semester, so a
 * seed run at any date — mid-term, over the year-end break, in the July
 * changeover — has exactly one semester containing "today". Every Mon–Fri
 * week then lies wholly inside one semester.
 */
export function academicYearStartingIn(startYear: number): AcademicCalendar {
  const start = yearStartOf(startYear);
  const s2Start = mondayOnOrAfter(`${startYear + 1}-01-01`);
  const end = addDays(yearStartOf(startYear + 1), -1);
  return {
    name: `${startYear}/${startYear + 1}`,
    start,
    end,
    semesters: [
      { number: 1, start, end: addDays(s2Start, -1) },
      { number: 2, start: s2Start, end },
    ],
  };
}

/** The academic year containing `todayYmd`. */
export function academicYearFor(todayYmd: string): AcademicCalendar {
  const year = Number(todayYmd.slice(0, 4));
  const startYear = todayYmd >= yearStartOf(year) ? year : year - 1;
  return academicYearStartingIn(startYear);
}

export function activeSemesterOf(cal: AcademicCalendar, todayYmd: string): SemesterSpan {
  const sem = cal.semesters.find((s) => todayYmd >= s.start && todayYmd <= s.end);
  if (!sem) throw new Error(`no semester of ${cal.name} contains ${todayYmd}`);
  return sem;
}

/** Mon–Fri weeks covering a semester, in order, with 1-based numbers. */
export function weeksOfSemester(sem: SemesterSpan): { number: number; start: string; end: string }[] {
  const weeks: { number: number; start: string; end: string }[] = [];
  for (let monday = mondayOnOrAfter(sem.start); monday <= sem.end; monday = addDays(monday, 7)) {
    weeks.push({ number: weeks.length + 1, start: monday, end: addDays(monday, 4) });
  }
  return weeks;
}

/**
 * Two triwulan windows for a semester, split at the middle Monday. Term 1 runs
 * from the semester start, Term 2 finishes on the semester end.
 */
export function termsOfSemester(sem: SemesterSpan): { number: 1 | 2; start: string; end: string }[] {
  const weeks = weeksOfSemester(sem);
  const mid = weeks[Math.floor(weeks.length / 2)].start;
  return [
    { number: 1, start: sem.start, end: addDays(mid, -1) },
    { number: 2, start: mid, end: sem.end },
  ];
}

// ── School days ─────────────────────────────────────────────────────────────

export function isSchoolDay(ymd: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(ymd) && !holidays.has(ymd);
}

/**
 * The most recent school day on or before `ymd` — `ymd` itself on a normal
 * weekday, the previous Friday on a Saturday/Sunday, the day before on a
 * holiday. Anything a spec needs "today" for must anchor here so results never
 * depend on the weekday the suite happens to run on.
 */
export function latestSchoolDay(ymd: string, holidays: ReadonlySet<string>, floor?: string): string {
  let d = ymd;
  for (let i = 0; i < 60; i++) {
    if (isSchoolDay(d, holidays) && (!floor || d >= floor)) return d;
    d = addDays(d, -1);
  }
  throw new Error(`no school day found within 60 days before ${ymd}`);
}

/** The `count` school days ending at (and including) `endYmd`, ascending. */
export function schoolDaysEndingAt(
  endYmd: string,
  count: number,
  holidays: ReadonlySet<string>,
  floor?: string,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < 120 && out.length < count; i++) {
    const d = addDays(endYmd, -i);
    if (floor && d < floor) break;
    if (isSchoolDay(d, holidays)) out.push(d);
  }
  return out.reverse();
}

// ── Deterministic randomness ────────────────────────────────────────────────

/** mulberry32 — tiny seeded PRNG so two seeds on the same date are identical. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
