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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;

  const [yStr, mStr, dStr] = dob.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Construct the birth date as UTC noon to dodge any timezone DST shenanigans
  // on the boundary; we only care about Y/M/D, not the time of day.
  const birth = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const today = new Date(
    Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12, 0, 0),
  );

  if (Number.isNaN(birth.getTime())) return null;
  if (birth > today) return null; // future DOB — treat as missing

  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  let months = today.getUTCMonth() - birth.getUTCMonth();
  let days = today.getUTCDate() - birth.getUTCDate();

  if (days < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) {
    return `${months} bulan`;
  }
  if (months === 0) {
    return `${years} tahun`;
  }
  return `${years} tahun ${months} bulan`;
}
