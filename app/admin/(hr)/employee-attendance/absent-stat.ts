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
 *
 * "Weekend" means a day outside the tenant's `OrgConfig.workingDays` (a school
 * can run on Saturday); Sat/Sun is only the fallback when that is unset or
 * hasn't loaded.
 */

export function isWeekend(isoDate: string): boolean {
  // `new Date('YYYY-MM-DD')` parses as UTC midnight; reading via UTC keeps
  // the weekday stable across the user's local timezone (Asia/Jakarta is
  // UTC+7 — local-day reads would shift Sunday→Saturday for early-AM views).
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * A day nobody is expected in: a holiday, or a weekday outside the tenant's
 * configured working days (Sat/Sun when none are configured).
 */
export function isNonWorkingDay(
  isoDate: string,
  holidays: Set<string>,
  workingDays?: string[] | null,
): boolean {
  if (holidays.has(isoDate)) return true;
  if (!workingDays || workingDays.length === 0) return isWeekend(isoDate);
  const day = DAY_CODES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return !workingDays.includes(day);
}

/**
 * Compute the absent ("Alpa") count for the dashboard: explicit ABSENT records
 * plus, on a working day, employees with no record at all.
 *
 * @param selectedDate ISO date currently displayed (`YYYY-MM-DD`)
 * @param data the `EmployeeAttendance[]` rows backing the table
 * @param holidays set of ISO date strings that are holidays for this tenant
 * @param workingDays the tenant's `OrgConfig.workingDays` day codes, if known
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
  workingDays?: string[] | null;
}): number {
  const { selectedDate, data, holidays, workingDays } = args;
  // An explicit ABSENT record is "Alpa" in the table on any day, so it always
  // counts (HR-6: the card read 0 while a row said Alpa). Rows with *no*
  // record only count as absent on a day the school was open.
  const explicitAbsent = data.filter((d) => recordStatus(d.attendance) === "ABSENT").length;
  if (isNonWorkingDay(selectedDate, holidays, workingDays)) return explicitAbsent;
  const noRecord = data.filter((d) => !d.attendance).length;
  return explicitAbsent + noRecord;
}

function recordStatus(attendance: unknown): string | null {
  if (attendance && typeof attendance === "object" && "status" in attendance) {
    const status = (attendance as { status?: unknown }).status;
    return typeof status === "string" ? status : null;
  }
  return null;
}

/** Statuses the "Izin" card counts — every excused-absence status, not just LEAVE. */
const EXCUSED_STATUSES = new Set(["LEAVE", "SICK", "PERMISSION"]);

/** Count of rows whose record is an excused absence (izin / sakit / cuti). */
export function computeExcusedCount(data: { attendance: unknown }[]): number {
  return data.filter((d) => EXCUSED_STATUSES.has(recordStatus(d.attendance) ?? "")).length;
}
