/**
 * Derive a human-readable academic period string for the given date.
 *
 * Convention used across the ERP (see seed + StudentAssessment.period):
 *   "Semester 1 YYYY/YYYY+1" for Jul–Dec (months 7–12)
 *   "Semester 2 YYYY-1/YYYY" for Jan–Jun (months 1–6)
 *
 * An Nisaa' academic year starts in July. The second semester (Jan–Jun)
 * still belongs to the academic year that started the previous July.
 *
 * NOTE: this is a calendar-only fallback. Prefer `getCurrentPeriodFromDb`
 * (in lib/academic-period-db.ts) — it reads the authoritative `Semester`
 * + `AcademicYear` rows and correctly handles schools whose actual term
 * dates don't match the Jul–Dec / Jan–Jun convention (e.g. mid-year
 * academic-year starts). F-7 surfaced when a tenant's Semester 1 ran
 * May–Dec but this helper still said "Semester 2" because May < 7.
 *
 * Kept in this file (no prisma import) so it stays usable from tests +
 * pure date utilities without dragging in the DB client.
 */
export function getCurrentPeriod(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 7) {
    return `Semester 1 ${year}/${year + 1}`;
  }
  return `Semester 2 ${year - 1}/${year}`;
}
