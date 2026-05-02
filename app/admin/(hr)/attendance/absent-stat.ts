/**
 * F-20: pure helpers for the admin attendance dashboard's "tidak hadir"
 * (absent) stat. Extracted from `page.tsx` so the math can be unit-tested
 * without dragging the React tree into the test runner.
 *
 * Rule: for past dates that fell on a weekend or a holiday, the school was
 * closed — those should not contribute to the absent count. For today and
 * future dates we keep the plain "no record yet" count so admins can chase
 * down employees who haven't clocked in.
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
 * @param today ISO date of "now" — passed in so callers can stub the clock
 * @param data the `EmployeeAttendance[]` rows backing the table
 * @param holidays set of ISO date strings that are holidays for this tenant
 */
export function computeAbsentCount(args: {
  selectedDate: string;
  today: string;
  data: { attendance: unknown }[];
  holidays: Set<string>;
}): number {
  const { selectedDate, today, data, holidays } = args;
  const isPastDate = selectedDate < today;
  const isNonWorkingDay = isWeekend(selectedDate) || holidays.has(selectedDate);
  if (isPastDate && isNonWorkingDay) return 0;
  return data.filter((d) => !d.attendance).length;
}
