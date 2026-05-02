/**
 * Derive a human-readable academic period string for the given date.
 *
 * Convention used across the ERP (see seed + StudentAssessment.period):
 *   "Semester 1 YYYY/YYYY+1" for Jul–Dec (months 7–12)
 *   "Semester 2 YYYY-1/YYYY" for Jan–Jun (months 1–6)
 *
 * An Nisaa' academic year starts in July. The second semester (Jan–Jun)
 * still belongs to the academic year that started the previous July.
 */
export function getCurrentPeriod(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 7) {
    return `Semester 1 ${year}/${year + 1}`;
  }
  return `Semester 2 ${year - 1}/${year}`;
}
