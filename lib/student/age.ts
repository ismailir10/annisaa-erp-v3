/**
 * Age formatting for the student dossier header and summary rail.
 *
 * Early-years placement is decided in months, not years — "4 thn 11 bln" and
 * "5 thn 1 bln" land in different programs — so the short form always carries
 * the month component.
 *
 * `dateOfBirth` is a `YYYY-MM-DD` string column, not a Date. It is parsed as a
 * plain calendar date (no timezone applied): a birthday is a wall-clock fact,
 * and running it through UTC would shift Jakarta dates back a day.
 */

export type AgeParts = { years: number; months: number };

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** null for a missing, malformed, or future date of birth. */
export function ageParts(
  dateOfBirth: string | null | undefined,
  reference: Date = new Date(),
): AgeParts | null {
  if (!dateOfBirth) return null;
  const m = YMD.exec(dateOfBirth.trim());
  if (!m) return null;

  const birthYear = Number(m[1]);
  const birthMonth = Number(m[2]);
  const birthDay = Number(m[3]);
  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) return null;

  const refYear = reference.getFullYear();
  const refMonth = reference.getMonth() + 1;
  const refDay = reference.getDate();

  let months = (refYear - birthYear) * 12 + (refMonth - birthMonth);
  // Not yet reached the day-of-month → the current month has not completed.
  if (refDay < birthDay) months -= 1;
  if (months < 0) return null;

  return { years: Math.floor(months / 12), months: months % 12 };
}

/** "5 thn 2 bln", or "7 bln" under a year. null when the DOB is unusable. */
export function formatAgeShort(
  dateOfBirth: string | null | undefined,
  reference: Date = new Date(),
): string | null {
  const parts = ageParts(dateOfBirth, reference);
  if (!parts) return null;
  if (parts.years === 0) return `${parts.months} bln`;
  return `${parts.years} thn ${parts.months} bln`;
}
