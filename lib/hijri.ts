/**
 * Format a date as a Hijri (Islamic Umm al-Qura) calendar string.
 *
 * Returns Indonesian-localized Hijri date like "5 Zulkaidah 1447 H".
 * Used by the parent portal greeting on /parent home (Cycle 4 spec G6).
 *
 * Built on `Intl.DateTimeFormat` with the `islamic-umalqura` calendar —
 * available in all modern Node + browser runtimes via Intl. No npm
 * dependency required (Cycle 4 hard constraint).
 *
 * Returns empty string on failure (older runtimes without islamic-umalqura
 * support); callers should treat empty as "render nothing" gracefully.
 */
export function formatHijri(date: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat("id-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return fmt.format(date);
  } catch {
    return "";
  }
}

/**
 * Indonesian time-of-day greeting suffix ("pagi" / "siang" / "sore" / "malam").
 *
 * Pass `timezone` from any **server** component — `date.getHours()` reads the
 * host clock, which on Vercel is UTC, so an un-pinned call greets a parent
 * opening the app at 18:05 WIB with "siang". Client components may omit it and
 * get the browser's local hour, matching `app/teacher/home-client.tsx`.
 */
export function timeOfDayGreeting(
  date: Date = new Date(),
  timezone?: string,
): string {
  const h = timezone ? hourInTimezone(date, timezone) : date.getHours();
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18) return "sore";
  return "malam";
}

/**
 * Hour-of-day (0-23) for `date` as observed in `timezone`.
 *
 * `en-GB` + `hour12: false` renders midnight as "24"; normalised back to 0.
 */
function hourInTimezone(date: Date, timezone: string): number {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const h = Number.parseInt(raw, 10);
  if (Number.isNaN(h)) return date.getHours();
  return h % 24;
}
