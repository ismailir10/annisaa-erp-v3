export type AttendanceCounts = {
  hadir: number;
  sakit: number;
  alpa: number;
  izin: number;
  logged: number;
};

export type AttendanceBannerState =
  | { kind: "all-present" }
  | { kind: "attention"; tone: "warm" | "neutral"; line: string }
  | null;

/**
 * Decide whether the parent attendance week-summary banner should render and
 * which tone to use.
 *
 * - `all-present`: every weekday logged as PRESENT → celebration card.
 * - `attention` / `warm`: at least one SICK or ABSENT day → orange "istirahat" copy.
 * - `attention` / `neutral`: only PERMISSION days (no SICK/ABSENT) → sky-blue "izin" copy.
 *   This branch is the fix for UAT 2026-05-12 MAJOR-02 — PERMISSION-only weeks
 *   previously rendered no banner.
 * - `null`: nothing logged yet or only PRESENT days short of a full week.
 */
export function attendanceBannerState(counts: AttendanceCounts): AttendanceBannerState {
  const { hadir, sakit, alpa, izin, logged } = counts;
  if (logged === 5 && hadir === 5) return { kind: "all-present" };
  const hasAttention = sakit > 0 || alpa > 0 || izin > 0;
  if (!hasAttention) return null;
  const tone: "warm" | "neutral" = sakit > 0 || alpa > 0 ? "warm" : "neutral";
  const izinPart = izin > 0 ? ` · Izin ${izin}` : "";
  const line = `Hadir ${hadir} · Sakit ${sakit} · Alpa ${alpa}${izinPart}`;
  return { kind: "attention", tone, line };
}
