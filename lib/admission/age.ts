/**
 * Parse a YYYY-MM-DD string into a UTC-noon Date, or `null` if malformed.
 * UTC noon dodges any timezone DST shenanigans on the boundary — we only
 * care about Y/M/D, not the time of day.
 */
function parseIsoDateAtNoon(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [yStr, mStr, dStr] = value.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Calendar-correct Y/M borrow arithmetic between two UTC-noon dates.
 * Shared by `formatAgeFromDob` and `ageInMonthsAt` so the borrow logic
 * — and the "never approximate a month" rule — exists exactly once.
 */
function diffYearsMonths(birth: Date, reference: Date): { years: number; months: number } | null {
  if (birth > reference) return null; // future DOB — treat as missing

  let years = reference.getUTCFullYear() - birth.getUTCFullYear();
  let months = reference.getUTCMonth() - birth.getUTCMonth();
  const days = reference.getUTCDate() - birth.getUTCDate();

  if (days < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months };
}

/**
 * Derive a human-readable age string from a YYYY-MM-DD date-of-birth.
 *
 * Indonesian formatting:
 *   - "5 tahun"           — 5 full years, exact month-of-year match
 *   - "5 tahun 3 bulan"   — 5 full years + 3 months past birthday
 *   - "8 bulan"           — less than 1 year old
 *   - "0 bulan"           — same month as birth (don't render in UI; treat as edge case)
 *
 * Returns `null` for missing / malformed input so callers can render an
 * em-dash placeholder cleanly.
 *
 * Why this shape: v1 admin form previously had a free-text `childAge`
 * field ("4 tahun") that drifted out of sync with `dateOfBirth`. Auto-
 * deriving from DOB removes the manual upkeep + an inconsistent-data
 * class of bug.
 */
export function formatAgeFromDob(
  dob: string | null | undefined,
  reference: Date = new Date(),
): string | null {
  if (!dob || typeof dob !== "string") return null;

  const birth = parseIsoDateAtNoon(dob);
  if (!birth) return null;

  const today = new Date(
    Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12, 0, 0),
  );

  const diff = diffYearsMonths(birth, today);
  if (!diff) return null;
  const { years, months } = diff;

  if (years <= 0) {
    return `${months} bulan`;
  }
  if (months === 0) {
    return `${years} tahun`;
  }
  return `${years} tahun ${months} bulan`;
}

/**
 * Age in whole months at a given reference point — the same calendar-correct
 * Y/M/D arithmetic as `formatAgeFromDob`, collapsed into a single count for
 * numeric comparisons against a program's `ageMin`/`ageMax` band. Never
 * approximates a month as 30.44 days; the borrow arithmetic is exact.
 *
 * `reference` accepts a `Date` or a `YYYY-MM-DD` string, since callers
 * typically pass an `AcademicYear.startDate` that may arrive as either.
 */
export function ageInMonthsAt(
  dob: string | null | undefined,
  reference: Date | string,
): number | null {
  if (!dob || typeof dob !== "string") return null;

  const birth = parseIsoDateAtNoon(dob);
  if (!birth) return null;

  let refPoint: Date | null;
  if (typeof reference === "string") {
    refPoint = parseIsoDateAtNoon(reference);
  } else {
    refPoint = new Date(
      Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12, 0, 0),
    );
    if (Number.isNaN(refPoint.getTime())) refPoint = null;
  }
  if (!refPoint) return null;

  const diff = diffYearsMonths(birth, refPoint);
  if (!diff) return null;

  return diff.years * 12 + diff.months;
}
