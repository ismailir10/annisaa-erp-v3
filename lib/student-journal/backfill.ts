import { weekStart } from "@/lib/student-journal/week";

/**
 * Home-entry backfill window.
 *
 * UAT finding JOURNAL-PARENT-02 (`docs/uat/reports/2026-05-01-student-journal.md`)
 * caught a wali silently backfilling a "Di Rumah" indicator four days in the
 * past with no client or server guard — the toggle just fired and saved. The
 * report's own recommendation: "Edit-window-of-N-days is acceptable but pick
 * one — silent past-day backfill corrupts the trust artifact." The defect
 * being fixed is *silent, unbounded* backfill, not backfill itself — a
 * missed Monday should still be fixable later in the week.
 *
 * Owner decision (13 Aug 2026): the window is the current week plus the
 * previous week. This module is the single source of that arithmetic, shared
 * by the server route (`app/api/student-journal/entries/home/route.ts`) and
 * the parent `WeekGrid` wiring — it must stay pure (no clock reads) so both
 * call sites, and their tests, agree on the same floor.
 */

/**
 * Earliest date (inclusive) a "Di Rumah" entry may be edited for, given
 * `today`. Defined as the Monday of the week BEFORE the week containing
 * `today` — i.e. `weekStart(today)` minus 7 days.
 *
 * @param todayYmd - Today's date as `YYYY-MM-DD` in Asia/Jakarta.
 * @returns The window floor as `YYYY-MM-DD`.
 */
export function homeEntryEditFloor(todayYmd: string): string {
  const currentWeekStart = weekStart(todayYmd);
  const d = new Date(`${currentWeekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a "Di Rumah" entry date is inside the editable backfill window:
 * from the Monday of the previous week through today, inclusive.
 *
 * Plain `YYYY-MM-DD` strings compare lexicographically in date order, so no
 * `Date` parsing is needed here.
 *
 * @param date - Candidate entry date as `YYYY-MM-DD`.
 * @param todayYmd - Today's date as `YYYY-MM-DD` in Asia/Jakarta. Always
 *   passed in by the caller (e.g. `getTodayInTimezone("Asia/Jakarta")`) —
 *   this function never reads the clock itself, which is what keeps it pure
 *   and shareable between server and client.
 */
export function isHomeEntryDateEditable(date: string, todayYmd: string): boolean {
  const floor = homeEntryEditFloor(todayYmd);
  return floor <= date && date <= todayYmd;
}
