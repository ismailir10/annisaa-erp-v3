export type YearLike = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
};

const ymd = (s: string | Date): string =>
  (typeof s === "string" ? new Date(s) : s).toISOString().slice(0, 10);

/**
 * Pick the academic year a year-scoped page (e.g. /admin/classes) should default
 * to. Prefers the ACTIVE year whose `[startDate, endDate]` covers `today`; if
 * none cover today, the most-recently-started ACTIVE year; else the first year
 * in the list.
 *
 * Replaces a naive `years.find(y => y.status === "ACTIVE")` which picked the
 * *first* ACTIVE year in API order (`/api/academic-years` returns
 * `orderBy startDate desc`, so a future test/planning year that happened to be
 * ACTIVE won the pick) — landing the page on an empty year. With the
 * single-active-year invariant now enforced this is belt-and-suspenders, but it
 * also handles the legitimate "between terms" gap gracefully.
 */
export function pickDefaultYear<T extends YearLike>(
  years: T[],
  today: Date,
): T | undefined {
  const actives = years.filter((y) => y.status === "ACTIVE");
  const t = ymd(today);

  const covering = actives.find((y) => ymd(y.startDate) <= t && t <= ymd(y.endDate));
  if (covering) return covering;

  if (actives.length > 0) {
    return [...actives].sort((a, b) => ymd(b.startDate).localeCompare(ymd(a.startDate)))[0];
  }

  return years[0];
}
