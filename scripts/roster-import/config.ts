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
export type ProgramCode = "DCARE" | "KB" | "TKIT";
export type AgeGroupCode = "A" | "B";

/**
 * Verified 2026-07-15 directly against prod `Campus` rows (SQL, project
 * vxwywmvpxetdgnxejjgk) — no "An Nisaa' Sekolahku" prefix in the actual
 * `name` column, unlike an earlier assumed value here.
 */
export const CAMPUS_NAME: Record<CampusCode, string> = {
  TAMAN_ASTER: "Taman Aster",
  METLAND: "Metland Cibitung",
};

/**
 * Verified 2026-07-15 directly against prod `Program` rows (SQL, project
 * vxwywmvpxetdgnxejjgk). Only ONE `TK Islam Terpadu` program exists — TK A
 * vs TK B is `ClassSection.ageGroup`, not a separate Program row. An
 * earlier assumed "TKIT-A"/"TKIT-B" split here was wrong and would have
 * thrown "Program not found" at commit time (caught before any write, via
 * the admin UI's own Program dropdown, not silently).
 */
export const PROGRAM_NAME: Record<ProgramCode, string> = {
  DCARE: "Day Care",
  KB: "Kelompok Bermain",
  TKIT: "TK Islam Terpadu",
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
 * Program per kelas, derived from the kelas code's prefix: TD → Day Care
 * (closest existing program to "Toddler"), KB → Kelompok Bermain, A/B →
 * TK Islam Terpadu (the single TKIT program — A vs B is `AGE_GROUP_BY_KELAS`
 * below, not a separate Program). Only defined for kelas that also have a
 * confirmed campus above.
 */
export const PROGRAM_BY_KELAS: Record<string, ProgramCode> = {
  TD1: "DCARE",
  TD2: "DCARE",
  KB1: "KB",
  KB3: "KB",
  KB4: "KB",
  A1: "TKIT",
  A2: "TKIT",
  A3: "TKIT",
  A4: "TKIT",
  B1: "TKIT",
  B2: "TKIT",
  B3: "TKIT",
  B4: "TKIT",
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
