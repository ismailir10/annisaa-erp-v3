/**
 * Resolved campus/program mapping for the roster import
 * (cycle 2026-07-15-roster-import-2526, per the cycle doc's Spec §
 * "Campus mapping confirmed for 11 of 13 kelas").
 *
 * Only kelas with a confirmed campus are listed here. `DC` and `KB2` are
 * deliberately NOT included — DC's campus split and KB2's existence are
 * still open questions for the owner (shanti) per the cycle doc's T1.
 * `run.ts` must skip/warn on any kelas sheet found in the workbook that
 * isn't in this mapping rather than guessing a campus for it.
 */

export type CampusCode = "TAMAN_ASTER" | "METLAND";
export type ProgramCode = "DCARE" | "KB" | "TKIT-A" | "TKIT-B";
export type AgeGroupCode = "A" | "B";

/** Matches `scripts/reseed/org.ts` `CAMPUSES[].name` — the real prod Campus rows. */
export const CAMPUS_NAME: Record<CampusCode, string> = {
  TAMAN_ASTER: "An Nisaa' Sekolahku Taman Aster",
  METLAND: "An Nisaa' Sekolahku Metland Cibitung",
};

/** Matches `scripts/reseed/org.ts` `PROGRAMS[].code`. */
export const PROGRAM_NAME: Record<ProgramCode, string> = {
  DCARE: "D'Care (Day Care)",
  KB: "Kelompok Bermain",
  "TKIT-A": "TK Islam Terpadu Kelas A",
  "TKIT-B": "TK Islam Terpadu Kelas B",
};

/**
 * The 11 of 13 kelas with a confirmed campus. Each maps to a
 * `ClassSection` created (or reused, if it already exists) under that
 * campus + the confirmed academic year.
 */
export const CAMPUS_BY_KELAS: Record<string, CampusCode> = {
  TD1: "TAMAN_ASTER",
  KB1: "TAMAN_ASTER",
  A1: "TAMAN_ASTER",
  A2: "TAMAN_ASTER",
  B1: "TAMAN_ASTER",
  B2: "TAMAN_ASTER",

  TD2: "METLAND",
  KB3: "METLAND",
  KB4: "METLAND",
  A3: "METLAND",
  A4: "METLAND",
  B3: "METLAND",
  B4: "METLAND",
};

/**
 * Program per kelas, derived from the kelas code's prefix: TD → DCARE
 * (closest existing program to "Toddler" — D'Care covers 6-36 months),
 * KB → Kelompok Bermain, A → TK A, B → TK B. Only defined for kelas that
 * also have a confirmed campus above.
 */
export const PROGRAM_BY_KELAS: Record<string, ProgramCode> = {
  TD1: "DCARE",
  TD2: "DCARE",
  KB1: "KB",
  KB3: "KB",
  KB4: "KB",
  A1: "TKIT-A",
  A2: "TKIT-A",
  A3: "TKIT-A",
  A4: "TKIT-A",
  B1: "TKIT-B",
  B2: "TKIT-B",
  B3: "TKIT-B",
  B4: "TKIT-B",
};

/**
 * `ClassSection.ageGroup` per kelas. Only TK A/B kelas have a real age
 * group in the AgeGroup enum (A | B); TD/KB sections default to "A",
 * mirroring `scripts/reseed/org.ts`'s convention ("Reseed plans default
 * ageGroup to A; admin re-classifies per [campus] as needed").
 */
export const AGE_GROUP_BY_KELAS: Record<string, AgeGroupCode> = {
  TD1: "A",
  TD2: "A",
  KB1: "A",
  KB3: "A",
  KB4: "A",
  A1: "A",
  A2: "A",
  A3: "A",
  A4: "A",
  B1: "B",
  B2: "B",
  B3: "B",
  B4: "B",
};

export const MAPPED_KELAS_CODES = Object.keys(CAMPUS_BY_KELAS);
