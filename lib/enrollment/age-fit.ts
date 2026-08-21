import { ageInMonthsAt } from "@/lib/admission/age";

/**
 * Advisory verdict for a child's age against a program's `ageMin`/`ageMax`
 * band. Never a hard block — `evaluateAgeFit` only classifies; the caller
 * decides what to do with an out-of-range result (warn, require an override
 * reason, etc).
 */
export type AgeFitStatus = "OK" | "BELOW_MIN" | "ABOVE_MAX" | "UNKNOWN";

const INDO_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Format a YYYY-MM-DD string as "14 Juli 2025" without constructing a
 * `Date` — the string's Y/M/D components are the only thing that matters,
 * and parsing through `Date` risks a timezone-driven off-by-one day.
 */
function formatReferenceDate(referenceDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate);
  if (!match) return referenceDate;
  const [, yStr, mStr, dStr] = match;
  const monthName = INDO_MONTHS[Number(mStr) - 1];
  const day = Number(dStr);
  if (!monthName || !day) return referenceDate;
  return `${day} ${monthName} ${yStr}`;
}

/**
 * Human-readable age, e.g. "2 tahun 6 bulan (30 bulan)". Below one year,
 * the raw month count already reads naturally so it is not duplicated.
 */
function formatAgeDisplay(ageMonths: number): string {
  if (ageMonths < 12) return `${ageMonths} bulan`;

  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  const human = months === 0 ? `${years} tahun` : `${years} tahun ${months} bulan`;
  return `${human} (${ageMonths} bulan)`;
}

/**
 * Human-readable band, using only the bounds that are actually set — an
 * `ageMax`-only program (the dead-branch bug this module fixes) should
 * never render a phantom "0" minimum.
 */
function formatBand(ageMin: number | null, ageMax: number | null): string {
  if (ageMin != null && ageMax != null) return `${ageMin}–${ageMax} bulan`;
  if (ageMin != null) return `min. ${ageMin} bulan`;
  if (ageMax != null) return `maks. ${ageMax} bulan`;
  return "";
}

export function evaluateAgeFit(params: {
  dob: string | null | undefined;
  /** The target class's AcademicYear.startDate, YYYY-MM-DD. */
  referenceDate: string;
  /** Minimum age in months, or null if the program has no floor. */
  ageMin: number | null;
  /** Maximum age in months, or null if the program has no ceiling. */
  ageMax: number | null;
  programName: string;
}): { ageMonths: number | null; status: AgeFitStatus; message: string | null } {
  const { dob, referenceDate, ageMin, ageMax, programName } = params;

  const ageMonths = ageInMonthsAt(dob, referenceDate);
  if (ageMonths == null) {
    return { ageMonths: null, status: "UNKNOWN", message: null };
  }

  // Independent checks — an ageMax-only program must still be evaluated
  // even though ageMin is null. Do not gate one bound on the other.
  let status: AgeFitStatus = "OK";
  if (ageMin != null && ageMonths < ageMin) {
    status = "BELOW_MIN";
  } else if (ageMax != null && ageMonths > ageMax) {
    status = "ABOVE_MAX";
  }

  if (status === "OK") {
    return { ageMonths, status, message: null };
  }

  const ageDisplay = formatAgeDisplay(ageMonths);
  const band = formatBand(ageMin, ageMax);
  const refDisplay = formatReferenceDate(referenceDate);
  const direction = status === "BELOW_MIN" ? "di bawah batas usia minimum" : "di atas batas usia maksimum";

  const message = `Usia anak ${ageDisplay} ${direction} program ${programName} (${band}), per awal tahun ajaran ${refDisplay}.`;

  return { ageMonths, status, message };
}
