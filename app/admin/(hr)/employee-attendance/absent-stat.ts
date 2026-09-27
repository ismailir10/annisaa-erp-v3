/**
 * F-20: pure helpers for the admin attendance dashboard's "tidak hadir"
 * (absent) stat. Extracted from `page.tsx` so the math can be unit-tested
 * without dragging the React tree into the test runner.
 *
 * Rule (Cycle 3 T7/T8 — fixed the "Alpa" bug): a weekend or a holiday is a
 * non-working day regardless of whether it's in the past, today, or the
 * future — the school is closed on it either way, so nobody who has no
 * attendance record on it is "absent". `TODAY_ISO` used to be frozen at
 * module load, which made every non-working *today* render its whole roster
 * as Alpa the moment midnight passed without a redeploy; the caller now
 * passes "today" computed per render (see `page.tsx`).
 */

export function isWeekend(isoDate: string): boolean {
  // `new Date('YYYY-MM-DD')` parses as UTC midnight; reading via UTC keeps
  // the weekday stable across the user's local timezone (Asia/Jakarta is
  // UTC+7 — local-day reads would shift Sunday→Saturday for early-AM views).
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

/**
 * Compute the absent count for the dashboard.
 *
 * @param selectedDate ISO date currently displayed (`YYYY-MM-DD`)
 * @param data the `EmployeeAttendance[]` rows backing the table
 * @param holidays set of ISO date strings that are holidays for this tenant
 *
 * `today` is no longer part of the rule (Cycle 3 — the past-only exception
 * was the bug: a non-working *today* rendered its whole roster as "Alpa"
 * mid-day). It stays an accepted, ignored field on the args object so every
 * existing call site (which still has a "today" value handy) doesn't need
 * an unrelated edit just to drop it.
 */
export function computeAbsentCount(args: {
  selectedDate: string;
  today?: string;
  data: { attendance: unknown }[];
  holidays: Set<string>;
}): number {
  const { selectedDate, data, holidays } = args;
  const isNonWorkingDay = isWeekend(selectedDate) || holidays.has(selectedDate);
  if (isNonWorkingDay) return 0;
  return data.filter((d) => !d.attendance).length;
}
