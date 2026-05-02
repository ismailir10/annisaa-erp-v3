/**
 * Format any Date as YYYY-MM-DD in the given timezone.
 * Avoids both UTC-drift (host running UTC, e.g. Vercel) and host-local
 * drift (`getFullYear/getMonth/getDate` reading the server's TZ rather
 * than the school's). Use this anywhere a YMD string must line up with
 * Jakarta calendar days.
 */
export function getYmdInTimezone(d: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d); // Returns "YYYY-MM-DD"
}

/**
 * Get today's date string (YYYY-MM-DD) in a specific timezone.
 * Thin wrapper around `getYmdInTimezone(new Date(), timezone)`.
 */
export function getTodayInTimezone(timezone: string): string {
  return getYmdInTimezone(new Date(), timezone);
}
