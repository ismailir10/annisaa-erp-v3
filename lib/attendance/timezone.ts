/**
 * Get today's date string (YYYY-MM-DD) in a specific timezone.
 * Avoids the UTC/local timezone mismatch bug where a teacher
 * checking in at 06:45 Jakarta time gets yesterday's UTC date.
 */
export function getTodayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // Returns "YYYY-MM-DD"
}
