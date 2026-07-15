/**
 * Roster xlsx parser — RA An Nisaa' student roster import
 * (cycle 2026-07-15-roster-import-2526, Task T2).
 *
 * Reads the "Data <kelas>" biodata sheet for a given kelas from the
 * workbook and extracts one `RosterRecord` per student row.
 *
 * Layout (confirmed against `Data siswa TA 2526 (REupdated).xlsx`):
 *   rows 1-6ish : title block (school name, "TAHUN AJARAN ...", etc.)
 *   header row N     : "super header" — column-group labels ("Nama
 *                       Peserta Didik", "Kelahiran", "No. NIK", "Data
 *                       Orang tua", ...). Many cells are blank because
 *                       the label only occupies the first column of a
 *                       visually-merged group.
 *   header row N+1   : sub-header — the actual per-column labels
 *                       ("NIS", " Lengkap ", "Panggilan", "Tempat",
 *                       "Tanggal", "Anak", "Ayah", "Ibu", "Nama Ayah",
 *                       "Pendidikan", ...).
 *   row N+2+         : one student per row, until a row with no name.
 *
 * Column positions are NOT fixed — the DC/TD/KB sheets are offset by 1
 * column versus the A/B sheets (no leading "No." column in col A for
 * DC/TD/KB). `detectColumns` builds a column map purely from header
 * text, scanning left-to-right and tracking which "section" (STUDENT /
 * AYAH / IBU) it is currently in, since labels like "Pendidikan",
 * "Pekerjaan", "Nama Kantor", "Alamat", "Kota/Kab.", "Penghasilan"
 * repeat once for Ayah and once for Ibu, and "Alamat" also appears once
 * for the student's own home address before either parent section
 * starts.
 */
import ExcelJS, { type CellValue, type Workbook, type Worksheet } from "exceljs";

export interface AyahIbuFields {
  nama: string | null;
  nik: string | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  namaKantor: string | null;
  alamatKantor: string | null;
  kota: string | null;
  penghasilan: string | null;
}

export interface RosterRecord {
  kelas: string;
  /** Sheet row number this record came from — diagnostics only. */
  rowNumber: number;
  no: number | null;
  /** Trimmed; blank or "-" placeholder cells normalise to null. */
  nis: string | null;
  nisn: string | null;
  namaLengkap: string;
  namaPanggilan: string | null;
  gender: "L" | "P" | null;
  birthPlace: string | null;
  /** Raw cell value — a real Date object or an Indonesian date string. */
  birthDateRaw: string | Date | null;
  nikAnak: string | null;
  kkNumber: string | null;
  /** "Anak ke-" — this student's birth-order position. */
  childOrder: number | null;
  /** Raw "Tinggal" cell text; null if the sheet has no Tinggal column
   *  (DC/TD/KB sheets don't carry it — only A/B sheets do). */
  tinggal: string | null;
  alamat: string | null;
  desaKelurahan: string | null;
  kecamatan: string | null;
  telpAyah: string | null;
  telpIbu: string | null;
  ayah: AyahIbuFields;
  ibu: AyahIbuFields;
}

type FieldKey =
  | "no"
  | "nis"
  | "nisn"
  | "namaLengkap"
  | "namaPanggilan"
  | "gender"
  | "birthPlace"
  | "birthDate"
  | "nikAnak"
  | "nikAyah"
  | "nikIbu"
  | "kkNumber"
  | "childOrder"
  | "tinggal"
  | "alamat"
  | "desaKelurahan"
  | "kecamatan"
  | "telpAyah"
  | "telpIbu"
  | "namaAyah"
  | "pendidikanAyah"
  | "pekerjaanAyah"
  | "namaKantorAyah"
  | "alamatKantorAyah"
  | "kotaAyah"
  | "penghasilanAyah"
  | "namaIbu"
  | "pendidikanIbu"
  | "pekerjaanIbu"
  | "namaKantorIbu"
  | "alamatKantorIbu"
  | "kotaIbu"
  | "penghasilanIbu";

type ColumnMap = Partial<Record<FieldKey, number>>;

// ─── Cell reading helpers (same tolerant pattern as promes-parser.ts) ───

function cellToString(value: CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join("");
    }
    if ("text" in value && value.text != null) {
      return typeof value.text === "string"
        ? value.text
        : cellToString(value.text as CellValue);
    }
    if ("result" in value && value.result != null) {
      return cellToString(value.result as CellValue);
    }
  }
  return "";
}

function cellToInt(value: CellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : null;
  }
  const s = cellToString(value).trim();
  if (!s || !/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Trims a raw cell string; "-" placeholders and blanks normalise to null. */
function normalizeOrNull(value: CellValue): string | null {
  const s = cellToString(value).trim();
  if (!s || s === "-") return null;
  return s;
}

// ─── Header detection ───────────────────────────────────────────────────

/**
 * Scans the sheet for the sub-header row and builds a field→column map
 * from that row plus the row above it (the "super header" carrying
 * section labels like "Nama Peserta Didik", "No. NIK", "Data Orang tua").
 *
 * Anchored on an exact "Lengkap" cell (trimmed from " Lengkap "), NOT on
 * "NIS" — the real workbook repeats the literal text "NIS" in BOTH the
 * super-header row and the sub-header row (e.g. row 7 col 3 = "NIS" AND
 * row 8 col 3 = "NIS"), so anchoring on "NIS" picks the wrong row. The
 * "Nama Peserta Didik" column-group label only breaks into "Lengkap" /
 * "Panggilan" sub-labels on the true sub-header row — the super-header
 * row's equivalent cells still say the full group label — making
 * "Lengkap" a reliable, unique anchor.
 */
function detectColumns(
  sheet: Worksheet,
): { colMap: ColumnMap; dataStartRow: number } | null {
  let subHeaderRow = -1;
  const maxScan = Math.min(20, sheet.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      if (cellToString(row.getCell(c).value).trim() === "Lengkap") {
        subHeaderRow = r;
        break;
      }
    }
    if (subHeaderRow > 0) break;
  }
  // Need a super-header row above it to disambiguate repeated sub-labels.
  if (subHeaderRow < 2) return null;

  const superRow = sheet.getRow(subHeaderRow - 1);
  const subRow = sheet.getRow(subHeaderRow);
  const maxCol = Math.max(superRow.cellCount, subRow.cellCount, sheet.columnCount);

  const colMap: ColumnMap = {};
  let section: "STUDENT" | "AYAH" | "IBU" = "STUDENT";

  for (let c = 1; c <= maxCol; c++) {
    const superText = cellToString(superRow.getCell(c).value).trim();
    const subText = cellToString(subRow.getCell(c).value).trim();
    if (!superText && !subText) continue;

    if (subText === "No." && !colMap.no && !colMap.nis && section === "STUDENT") {
      colMap.no = c;
      continue;
    }
    if (subText === "NIS") {
      colMap.nis = c;
      continue;
    }
    if (subText === "NISN") {
      colMap.nisn = c;
      continue;
    }
    if (subText === "Lengkap") {
      colMap.namaLengkap = c;
      continue;
    }
    if (subText === "Panggilan" && !colMap.namaPanggilan) {
      colMap.namaPanggilan = c;
      continue;
    }
    if (subText === "L/P" || superText === "L/P") {
      colMap.gender = c;
      continue;
    }
    if (subText === "Tempat" && superText.includes("Kelahiran") && !colMap.birthPlace) {
      // Guarded to the first match only: on some sheets (e.g. "Data KB4"
      // in the real workbook) the "Tempat"/"Tanggal" sub-header cells are
      // merged into one ("H8:I8"), so ExcelJS inherits the "Tempat" text
      // onto BOTH columns — without this guard, the birthDate column
      // would wrongly overwrite birthPlace on the second match.
      colMap.birthPlace = c;
      continue;
    }
    if (subText === "Tanggal" && superText.includes("Kelahiran")) {
      colMap.birthDate = c;
      continue;
    }
    if (subText === "Anak" && superText.includes("NIK")) {
      colMap.nikAnak = c;
      continue;
    }
    if (subText === "Ayah" && superText.includes("NIK")) {
      colMap.nikAyah = c;
      continue;
    }
    if (subText === "Ibu" && superText.includes("NIK")) {
      colMap.nikIbu = c;
      continue;
    }
    if (subText === "No. KK" || superText === "No. KK") {
      colMap.kkNumber = c;
      continue;
    }
    if (subText === "Anak ke-") {
      colMap.childOrder = c;
      continue;
    }
    if (subText === "Tinggal" || superText === "Tinggal") {
      colMap.tinggal = c;
      continue;
    }
    if (subText === "Nama Ayah") {
      section = "AYAH";
      colMap.namaAyah = c;
      continue;
    }
    if (subText === "Nama Ibu") {
      section = "IBU";
      colMap.namaIbu = c;
      continue;
    }
    if (subText === "Pendidikan") {
      if (section === "AYAH") colMap.pendidikanAyah = c;
      else if (section === "IBU") colMap.pendidikanIbu = c;
      continue;
    }
    if (subText === "Pekerjaan") {
      if (section === "AYAH") colMap.pekerjaanAyah = c;
      else if (section === "IBU") colMap.pekerjaanIbu = c;
      continue;
    }
    if (subText === "Nama Kantor") {
      if (section === "AYAH") colMap.namaKantorAyah = c;
      else if (section === "IBU") colMap.namaKantorIbu = c;
      continue;
    }
    if (subText === "Kota/Kab.") {
      if (section === "AYAH") colMap.kotaAyah = c;
      else if (section === "IBU") colMap.kotaIbu = c;
      continue;
    }
    if (subText === "Penghasilan") {
      if (section === "AYAH" && !colMap.penghasilanAyah) colMap.penghasilanAyah = c;
      else if (section === "IBU" && !colMap.penghasilanIbu) colMap.penghasilanIbu = c;
      continue;
    }
    if (subText === "Alamat") {
      if (section === "STUDENT" && !colMap.alamat) colMap.alamat = c;
      else if (section === "AYAH" && !colMap.alamatKantorAyah) colMap.alamatKantorAyah = c;
      else if (section === "IBU" && !colMap.alamatKantorIbu) colMap.alamatKantorIbu = c;
      continue;
    }
    if (section === "STUDENT" && (subText === "Kecamatan" || superText === "Kecamatan")) {
      colMap.kecamatan = c;
      continue;
    }
    if (
      section === "STUDENT" &&
      (subText.includes("Kelurahan") || superText.includes("Desa"))
    ) {
      colMap.desaKelurahan = c;
      continue;
    }
    if (subText === "Telp. Ayah") {
      colMap.telpAyah = c;
      continue;
    }
    if (subText === "Telp. Ibu") {
      colMap.telpIbu = c;
      continue;
    }
  }

  // Fallback: some sheets never produce a literal "Tanggal" match (the
  // merged-header quirk above hides it entirely), but "Tempat" is always
  // immediately followed by the birth-date column in every sheet in this
  // workbook — use that positional relationship rather than leaving
  // birthDate unset.
  if (colMap.birthPlace && !colMap.birthDate) {
    colMap.birthDate = colMap.birthPlace + 1;
  }

  return { colMap, dataStartRow: subHeaderRow + 1 };
}

function readAyahIbu(
  row: ExcelJS.Row,
  colMap: ColumnMap,
  role: "AYAH" | "IBU",
): AyahIbuFields {
  const prefix = role === "AYAH" ? "Ayah" : "Ibu";
  const namaKey = `nama${prefix}` as FieldKey;
  const nikKey = role === "AYAH" ? "nikAyah" : "nikIbu";
  const pendidikanKey = `pendidikan${prefix}` as FieldKey;
  const pekerjaanKey = `pekerjaan${prefix}` as FieldKey;
  const namaKantorKey = `namaKantor${prefix}` as FieldKey;
  const alamatKantorKey = `alamatKantor${prefix}` as FieldKey;
  const kotaKey = `kota${prefix}` as FieldKey;
  const penghasilanKey = `penghasilan${prefix}` as FieldKey;

  const get = (key: FieldKey): CellValue => {
    const col = colMap[key];
    return col ? row.getCell(col).value ?? null : null;
  };

  return {
    nama: normalizeOrNull(get(namaKey)),
    nik: normalizeOrNull(get(nikKey as FieldKey)),
    pendidikan: normalizeOrNull(get(pendidikanKey)),
    pekerjaan: normalizeOrNull(get(pekerjaanKey)),
    namaKantor: normalizeOrNull(get(namaKantorKey)),
    alamatKantor: normalizeOrNull(get(alamatKantorKey)),
    kota: normalizeOrNull(get(kotaKey)),
    penghasilan: normalizeOrNull(get(penghasilanKey)),
  };
}

/** Case/whitespace-tolerant match of a "Data <kelas>" worksheet name. */
export function findKelasSheet(workbook: Workbook, kelasCode: string): Worksheet | null {
  const target = `Data ${kelasCode}`.trim().toLowerCase();
  for (const ws of workbook.worksheets) {
    if (ws.name.trim().toLowerCase() === target) return ws;
  }
  return null;
}

/** Every "Data <X>" sheet present in the workbook, kelas code only. */
export function listKelasSheetCodes(workbook: Workbook): string[] {
  const codes: string[] = [];
  for (const ws of workbook.worksheets) {
    const name = ws.name.trim();
    if (/^data\s+/i.test(name)) {
      codes.push(name.replace(/^data\s+/i, "").trim());
    }
  }
  return codes;
}

/**
 * Parses every student row out of the "Data <kelasCode>" sheet. Returns an
 * empty array (rather than throwing) if the sheet doesn't exist or no
 * header row is found — callers are expected to check
 * `listKelasSheetCodes` / warn separately for genuinely missing sheets.
 */
export function parseKelasSheet(workbook: Workbook, kelasCode: string): RosterRecord[] {
  const sheet = findKelasSheet(workbook, kelasCode);
  if (!sheet) return [];

  const header = detectColumns(sheet);
  if (!header) return [];
  const { colMap, dataStartRow } = header;

  const records: RosterRecord[] = [];
  for (let r = dataStartRow; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (key: FieldKey): CellValue => {
      const col = colMap[key];
      return col ? row.getCell(col).value ?? null : null;
    };

    const namaLengkap = cellToString(get("namaLengkap")).trim();
    // Blank/spacer rows carry no name — tolerate and keep scanning rather
    // than stopping at the first gap (mirrors promes-parser's tolerance).
    if (!namaLengkap) continue;

    records.push({
      kelas: kelasCode,
      rowNumber: r,
      no: cellToInt(get("no")),
      nis: normalizeOrNull(get("nis")),
      nisn: normalizeOrNull(get("nisn")),
      namaLengkap,
      namaPanggilan: normalizeOrNull(get("namaPanggilan")),
      gender: (() => {
        const g = cellToString(get("gender")).trim().toUpperCase();
        return g === "L" || g === "P" ? (g as "L" | "P") : null;
      })(),
      birthPlace: normalizeOrNull(get("birthPlace")),
      birthDateRaw: (() => {
        const raw = get("birthDate");
        if (raw instanceof Date) return raw;
        const s = normalizeOrNull(raw);
        return s;
      })(),
      nikAnak: normalizeOrNull(get("nikAnak")),
      kkNumber: normalizeOrNull(get("kkNumber")),
      childOrder: cellToInt(get("childOrder")),
      tinggal: colMap.tinggal ? normalizeOrNull(get("tinggal")) : null,
      alamat: normalizeOrNull(get("alamat")),
      desaKelurahan: normalizeOrNull(get("desaKelurahan")),
      kecamatan: normalizeOrNull(get("kecamatan")),
      telpAyah: normalizeOrNull(get("telpAyah")),
      telpIbu: normalizeOrNull(get("telpIbu")),
      ayah: readAyahIbu(row, colMap, "AYAH"),
      ibu: readAyahIbu(row, colMap, "IBU"),
    });
  }

  return records;
}

export async function loadWorkbook(filePath: string): Promise<Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}
