/**
 * Glanceable roll-up of one Buku Penghubung week, for surfaces that show the
 * week without owning it — currently the admin student dossier, which embeds a
 * read-only `WeekGrid` and needs a one-line answer above it ("has anyone
 * actually filled this in?") before the admin decides to look closer.
 *
 * Pure and shape-driven: it takes what
 * `GET /api/student-journal/admin/students/[id]/week` already returns, so no
 * caller re-derives day counts from the grid's own lookup map.
 */

export type JournalWeekIndicator = { id: string };
export type JournalWeekCategory = { indicators: JournalWeekIndicator[] };
export type JournalWeekEntry = { indicatorId: string; date: string; checked: boolean };

export type JournalWeekSummary = {
  /** Active indicators in the template for this scope. */
  indicatorCount: number;
  /** School days in the week — 5, from the route's `dates`. */
  dayCount: number;
  /** Days with at least one checked indicator. */
  filledDays: number;
  /** Checked entries across the week. */
  checkedCount: number;
  /** Per-date checked count, in the order `dates` was given. */
  perDay: { date: string; checked: number }[];
};

export function summarizeJournalWeek(
  categories: readonly JournalWeekCategory[],
  entries: readonly JournalWeekEntry[],
  dates: readonly string[],
): JournalWeekSummary {
  const indicatorCount = categories.reduce((n, c) => n + c.indicators.length, 0);

  // Only indicators still active in the template count. An entry against an
  // archived indicator is real history, but showing "6/5 terisi" because a
  // retired indicator is still checked reads as a bug.
  const activeIndicatorIds = new Set<string>();
  for (const c of categories) for (const i of c.indicators) activeIndicatorIds.add(i.id);

  const countByDate = new Map<string, number>();
  for (const e of entries) {
    if (!e.checked) continue;
    if (!activeIndicatorIds.has(e.indicatorId)) continue;
    countByDate.set(e.date, (countByDate.get(e.date) ?? 0) + 1);
  }

  const perDay = dates.map((date) => ({ date, checked: countByDate.get(date) ?? 0 }));

  return {
    indicatorCount,
    dayCount: dates.length,
    filledDays: perDay.filter((d) => d.checked > 0).length,
    checkedCount: perDay.reduce((n, d) => n + d.checked, 0),
    perDay,
  };
}

/**
 * `YYYY-MM-DD` ± n weeks, as a plain UTC calendar shift. Mirrors the admin
 * journal page's own `addWeeks`, which is local to that file; the dossier
 * needs the same arithmetic for its prev/next buttons.
 */
export function shiftWeek(weekStartYmd: string, deltaWeeks: number): string {
  const d = new Date(`${weekStartYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}
