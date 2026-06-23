/**
 * Compute the default Tanggal value when opening the "+ Tambah Catatan" dialog.
 *
 * Rules:
 * 1. Derive Mon and Fri of the visible week from `weekParam` (ISO Monday).
 * 2. If `today` is within Mon-Fri of the visible week, return `today`.
 * 3. Otherwise return Friday of the visible week, clamped to `today` if it
 *    would exceed today (i.e. visible week is in the future).
 *
 * Pure: no `new Date()` inside; accepts `today` as a parameter for testability.
 */
export function computeDefaultNoteDate(weekParam: string, today: string): string {
  // Derive Monday of the visible week (weekParam is already the ISO Monday
  // from weekStart(), but guard against any non-Monday input).
  const anchorDate = new Date(`${weekParam}T00:00:00Z`);
  // Shift to the Monday of that ISO week: day 0=Sun,1=Mon,...,6=Sat in UTC.
  const dayOfWeek = anchorDate.getUTCDay(); // 0=Sun
  const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monDate = new Date(anchorDate);
  monDate.setUTCDate(anchorDate.getUTCDate() + daysToMon);
  const friDate = new Date(monDate);
  friDate.setUTCDate(monDate.getUTCDate() + 4);

  const mon = monDate.toISOString().slice(0, 10);
  const fri = friDate.toISOString().slice(0, 10);

  // If today falls within Mon-Fri of the visible week, use today.
  if (today >= mon && today <= fri) {
    return today;
  }

  // Otherwise use Friday of the visible week, clamped so we never exceed today.
  return fri <= today ? fri : today;
}
