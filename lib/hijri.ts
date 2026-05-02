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
 * Indonesian time-of-day greeting suffix ("pagi" / "siang" / "sore" / "malam"),
 * derived from the local hour. Aligns with teacher-home pattern
 * (`app/teacher/home-client.tsx`).
 */
export function timeOfDayGreeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18) return "sore";
  return "malam";
}
