/**
 * Per-student overrides for cycle 2026-07-15-roster-import-2526, resolved
 * directly with the owner (shanti) via WhatsApp — see the cycle doc's Spec
 * § "Blank-NIS rows resolved for 5 of 6". These are one-off facts about
 * specific children, not general import rules, so they live here rather
 * than in `config.ts` (which holds only the reusable campus/program
 * mapping).
 */
import type { RosterRecord } from "./parse-xlsx";
import { normalizeParentName } from "./dedupe";

/** `${kelas}::${normalized name}` key, shared by all three lookups below. */
function studentKey(kelas: string, name: string): string {
  return `${kelas}::${normalizeParentName(name)}`;
}

/**
 * Never attended, or belongs to a future academic year — must not be
 * imported at all in this cycle.
 *  - Fahreza Arkha Bima (A1): "cuti dari awal ... masuk di tahun ajaran
 *    2026/2027 ini" — hasn't attended, enters next year's cohort.
 *  - Sholeh Nabil Razzaaq (B1): "belum pernah sekolah dan mengundurkan
 *    diri" — never enrolled, withdrew before starting.
 */
const EXCLUDED_STUDENTS: ReadonlySet<string> = new Set([
  studentKey("A1", "Fahreza Arkha Bima"),
  studentKey("B1", "Sholeh Nabil Razzaaq"),
]);

/**
 * Attended, then withdrew — import as `Student.status: "WITHDRAWN"` and
 * `StudentEnrollment.status: "WITHDRAWN"` instead of the default ACTIVE.
 *  - Muhammad Ghaisan Keenandra Ramadhika (B1): "pernah sekolah bbrp
 *    bulan, kemudian cuti dan mengundurkan diri" — has normal biodata in
 *    the xlsx (guardians included), just needs the status override.
 */
const WITHDRAWN_STUDENTS: ReadonlySet<string> = new Set([
  studentKey("B1", "Muhammad Ghaisan Keenandra Ramadhika"),
  studentKey("TD1", "Muhammad Shaqeel Abil Muksin"),
]);

export function isExcluded(record: Pick<RosterRecord, "kelas" | "namaLengkap">): boolean {
  return EXCLUDED_STUDENTS.has(studentKey(record.kelas, record.namaLengkap));
}

export function isWithdrawn(record: Pick<RosterRecord, "kelas" | "namaLengkap">): boolean {
  return WITHDRAWN_STUDENTS.has(studentKey(record.kelas, record.namaLengkap));
}

/**
 * TD1 has no `Data TD1` biodata sheet in the source workbook — only the
 * attendance-only `TD1` sheet, which `parse-xlsx.ts` doesn't read (it only
 * reads `Data <kelas>` sheets). So this one student is entirely absent
 * from `parseKelasSheet`'s output and must be injected manually.
 *
 * Per shanti: only 1 student ever in TD1, withdrew after ~3 months
 * (pindah domisili luar kota) with intentionally incomplete data — name,
 * NIS, and gender only, no guardians, no address, no birth date. This is
 * the one record in the whole import allowed to have zero guardian links
 * (see `run.ts`'s `noGuardianOk` check) — every other record with zero
 * AYAH/IBU names is still treated as a data problem, not silently
 * imported guardian-less.
 */
export const TD1_MANUAL_RECORD: RosterRecord = {
  kelas: "TD1",
  rowNumber: 7, // TD1 sheet, row 7 (attendance-sheet row, not a Data-sheet row)
  no: 1,
  nis: "252632629",
  nisn: null,
  namaLengkap: "Muhammad Shaqeel Abil Muksin",
  namaPanggilan: null,
  gender: "L",
  birthPlace: null,
  birthDateRaw: null,
  nikAnak: null,
  kkNumber: null,
  childOrder: null,
  tinggal: null,
  alamat: null,
  desaKelurahan: null,
  kecamatan: null,
  telpAyah: null,
  telpIbu: null,
  ayah: {
    nama: null,
    nik: null,
    pendidikan: null,
    pekerjaan: null,
    namaKantor: null,
    alamatKantor: null,
    kota: null,
    penghasilan: null,
  },
  ibu: {
    nama: null,
    nik: null,
    pendidikan: null,
    pekerjaan: null,
    namaKantor: null,
    alamatKantor: null,
    kota: null,
    penghasilan: null,
  },
};

export function noGuardianOk(record: Pick<RosterRecord, "kelas" | "namaLengkap">): boolean {
  return studentKey(record.kelas, record.namaLengkap) === studentKey("TD1", "Muhammad Shaqeel Abil Muksin");
}
