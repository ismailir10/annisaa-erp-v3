/**
 * Pure field-mapping functions for the roster import
 * (cycle 2026-07-15-roster-import-2526, Task T2).
 *
 * No DB access, no xlsx parsing — these take already-extracted cell
 * values (see `parse-xlsx.ts`) and map them onto `Student`/`Parent`
 * shapes per `prisma/schema.prisma`.
 */
import type { AyahIbuFields } from "./parse-xlsx";

const INDONESIAN_MONTHS: Record<string, string> = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
};

/**
 * Normalises a birth date cell to YYYY-MM-DD.
 *
 * Handles both shapes seen in the source workbook:
 *  - a real Excel date cell, which exceljs surfaces as a `Date` whose
 *    UTC Y/M/D components are the intended calendar day (read via the
 *    UTC getters, not local-timezone getters, to avoid an off-by-one
 *    shift depending on the machine's timezone);
 *  - an Indonesian date string, e.g. "27 Agustus 2020".
 *
 * Throws on unrecognised input — callers should catch and treat the
 * birth date as missing for that row rather than importing a wrong date.
 */
export function parseIndonesianBirthDate(raw: string | Date): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new Error("parseIndonesianBirthDate: invalid Date");
    }
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) {
    throw new Error(`parseIndonesianBirthDate: unrecognized format "${raw}"`);
  }
  const [, dayStr, monthName, yearStr] = match;
  const month = INDONESIAN_MONTHS[monthName.toLowerCase()];
  if (!month) {
    throw new Error(`parseIndonesianBirthDate: unknown Indonesian month "${monthName}"`);
  }
  const day = dayStr.padStart(2, "0");
  return `${yearStr}-${month}-${day}`;
}

/**
 * Concatenates the student's address parts into `Student.address`.
 * Skips empty/placeholder ("-") parts; joins the rest with ", ".
 */
export function buildAddress(
  alamat: string | null | undefined,
  desa: string | null | undefined,
  kecamatan: string | null | undefined,
): string {
  return [alamat, desa, kecamatan]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part && part !== "-")
    .join(", ");
}

/**
 * Maps the source "Tinggal" cell onto `Student.livingWith`'s
 * `ORANG_TUA | WALI | LAINNYA` convention.
 *
 * Source values observed: "Orang Tua" (the only value seen in the
 * sample workbook). Blank/"-"/missing (the DC/TD/KB sheets don't carry
 * a Tinggal column at all) maps to "" so callers can distinguish
 * "unknown" (leave `livingWith` unset) from an explicit value.
 */
export function mapLivingWith(tinggal: string | null | undefined): string {
  const normalized = (tinggal ?? "").trim().toUpperCase();
  if (!normalized || normalized === "-") return "";
  if (normalized.includes("ORANG TUA") || normalized.includes("ORANGTUA")) {
    return "ORANG_TUA";
  }
  if (normalized.includes("WALI")) return "WALI";
  return "LAINNYA";
}

export interface MappedParentFields {
  name: string;
  nik: string | null;
  education: string | null;
  occupation: string | null;
  employer: string | null;
  employerAddress: string | null;
  employerCity: string | null;
  incomeRange: string | null;
}

/**
 * Maps one parent's raw ayah/ibu columns onto `Parent` model fields.
 *
 * `incomeRange` is passed through as the source text verbatim (e.g.
 * "Rp. 5.000.000 s/d Rp. 10.000.000") rather than normalised into the
 * schema comment's illustrative bucket labels ("5-10jt") — the column
 * is a free-text `String?` in the DB, not a real enum, and the task
 * only specifies mapping the field, not renormalising its values.
 */
export function buildParentRecord(fields: AyahIbuFields): MappedParentFields {
  return {
    name: (fields.nama ?? "").trim(),
    nik: normalizeOrNull(fields.nik),
    education: normalizeOrNull(fields.pendidikan),
    occupation: normalizeOrNull(fields.pekerjaan),
    employer: normalizeOrNull(fields.namaKantor),
    employerAddress: normalizeOrNull(fields.alamatKantor),
    employerCity: normalizeOrNull(fields.kota),
    incomeRange: normalizeOrNull(fields.penghasilan),
  };
}

function normalizeOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  if (!t || t === "-") return null;
  return t;
}
