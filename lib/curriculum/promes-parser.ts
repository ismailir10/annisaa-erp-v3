/**
 * PROMES xlsx parser.
 *
 * Reads a `PROMES TK <A|B> SMT <1|2>.xlsx` workbook and extracts the
 * 5 curriculum elements × LearningObjective × AchievementIndicator
 * tree the school authors. Pure function — no DB access. The C2 commit
 * path (T5) calls this, validates each row through Zod, then writes
 * inside one `prisma.$transaction`.
 *
 * Layout the parser expects (mirrors `scripts/build-promes-fixtures.ts`
 * which is also the synthetic test corpus):
 *
 *   row N    : single cell at col A carrying an element header text
 *              (matches the alias table — case insensitive, punctuation
 *              normalised to spaces, then word-boundary substring)
 *   row N+1  : column header row — col A = "NO", col B contains
 *              "CAPAIAN", col C contains "TUJUAN", col D contains
 *              "INDIKATOR", cols E+ carry theme names
 *   row N+2  : TP row — col A positive int (TP number),
 *              col B = competency text (CAPAIAN),
 *              col C = TP content (TUJUAN PEMBELAJARAN)
 *   row N+3+ : IKTP rows — col A empty, col D = indicator text,
 *              cols E+ carry truthy markers ("TRUE" / "X" / etc.)
 *              for each (IKTP × theme) link
 *
 * Tolerances baked in:
 *   - element header capitalization drifts (NAM all-caps vs Nam mixed)
 *   - punctuation noise ("STEAM / LITERASI" → STEAM)
 *   - leading + trailing whitespace on every text cell
 *   - merged-cell artefacts (extra commas in cell content)
 *   - row reordering across elements (no fixed row offsets)
 *
 * The parser never writes anywhere, never imports `@/lib/db`, and is
 * safe to call inside a serverless route or a vitest unit test.
 */

import ExcelJS, { type CellValue, type Workbook } from "exceljs";
import {
  CurriculumElement,
  AgeGroup,
} from "@/lib/generated/prisma/client";

export interface ParsedIndicator {
  /** Indicator text (IKTP), trimmed. */
  content: string;
  /** 1-indexed order within the parent objective, derived from row order. */
  order: number;
  /** Theme names with a truthy marker in the IKTP row (forward-compat for C3). */
  themeNames: string[];
}

export interface ParsedObjective {
  /** TP number within (element, ageGroup). Authoritative for the unique key. */
  number: number;
  /** CAPAIAN PERKEMBANGAN DIRI text. */
  competencyText: string;
  /** TUJUAN PEMBELAJARAN narrative. */
  content: string;
  indicators: ParsedIndicator[];
}

export type ParsedByElement = Partial<
  Record<CurriculumElement, ParsedObjective[]>
>;

export interface ParsedPromes {
  /** Inferred from filename + sheet text; explicit form field overrides. */
  inferredAgeGroup: AgeGroup | null;
  byElement: ParsedByElement;
}

export type PromesParseErrorCode =
  | "EMPTY_WORKBOOK"
  | "MISSING_SHEET"
  | "MALFORMED_ROW"
  | "UNKNOWN_ELEMENT";

export class PromesParseError extends Error {
  readonly code: PromesParseErrorCode;
  /** Indonesian user-facing message for the admin preview UI. */
  readonly userMessage: string;

  constructor(
    code: PromesParseErrorCode,
    message: string,
    userMessage: string,
  ) {
    super(message);
    this.name = "PromesParseError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

/** Element alias table. Each alias is matched case-insensitively at a word boundary. */
const ELEMENT_ALIASES: Record<CurriculumElement, string[]> = {
  RELIGIOUS_MORAL: ["NILAI AGAMA", "BUDI PEKERTI", "NAM"],
  IDENTITY: ["JATI DIRI"],
  STEAM: ["STEAM", "LITERASI"],
  MOTOR_SKILLS: ["MOTORIK"],
  ART: ["SENI"],
};

/** Normalise a header cell: trim → uppercase → punctuation→space → collapse whitespace. */
function normaliseHeaderCell(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the matching `CurriculumElement` if the cell text matches any
 * alias at a word boundary, else null. "NAM PROGRAM SEMESTER 1" matches
 * `RELIGIOUS_MORAL` because "NAM" appears as a whole word at the start.
 * "PROGRAM SEMESTER" alone does not match anything (word-boundary check
 * prevents a substring match against "NAM" inside "PROGRAM").
 */
export function detectElementHeader(
  cellText: string | null | undefined,
): CurriculumElement | null {
  if (!cellText) return null;
  const normalised = normaliseHeaderCell(cellText);
  if (!normalised) return null;
  const words = normalised.split(" ");
  for (const [element, aliases] of Object.entries(ELEMENT_ALIASES) as Array<
    [CurriculumElement, string[]]
  >) {
    for (const alias of aliases) {
      const aliasWords = alias.split(" ");
      // Word-boundary multi-word substring scan.
      for (let i = 0; i <= words.length - aliasWords.length; i++) {
        let match = true;
        for (let j = 0; j < aliasWords.length; j++) {
          if (words[i + j] !== aliasWords[j]) {
            match = false;
            break;
          }
        }
        if (match) return element;
      }
    }
  }
  return null;
}

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
      // Hyperlink cells expose `text` as either string or a SharedString-ish.
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
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

const TRUE_MARKERS = new Set(["TRUE", "T", "X", "V", "Y", "YA", "YES"]);
function isTrueMarker(value: CellValue): boolean {
  if (typeof value === "boolean") return value;
  const s = cellToString(value).trim().toUpperCase();
  return TRUE_MARKERS.has(s);
}

function looksLikeColumnHeader(cells: string[]): boolean {
  const a = cells[0]?.trim().toUpperCase() ?? "";
  const b = cells[1]?.toUpperCase() ?? "";
  const c = cells[2]?.toUpperCase() ?? "";
  const d = cells[3]?.toUpperCase() ?? "";
  return (
    a === "NO" &&
    (b.includes("CAPAIAN") || b.includes("PERKEMBANGAN")) &&
    (c.includes("TUJUAN") || c.includes("PEMBELAJARAN")) &&
    (d.includes("INDIKATOR") || d.includes("KETERCAPAIAN"))
  );
}

/** Read a row into a 0-indexed array of stringified cells (col A → index 0). */
function readRowAsStrings(
  row: ExcelJS.Row,
  rawValues: CellValue[],
): { strings: string[]; raw: CellValue[] } {
  const colCount = Math.max(row.cellCount, rawValues.length - 1);
  const strings: string[] = new Array(colCount).fill("");
  const raw: CellValue[] = new Array(colCount).fill(null);
  for (let i = 0; i < colCount; i++) {
    const cellValue = row.getCell(i + 1).value;
    raw[i] = cellValue ?? null;
    strings[i] = cellToString(cellValue);
  }
  return { strings, raw };
}

const AGE_GROUP_PATTERNS: Array<{ pattern: RegExp; group: AgeGroup }> = [
  { pattern: /\bTK\s*A\b/i, group: "A" },
  { pattern: /\bTK\s*B\b/i, group: "B" },
  { pattern: /\bKELOMPOK\s*A\b/i, group: "A" },
  { pattern: /\bKELOMPOK\s*B\b/i, group: "B" },
];

export function inferAgeGroup(
  workbook: Workbook,
  filename?: string,
): AgeGroup | null {
  if (filename) {
    for (const { pattern, group } of AGE_GROUP_PATTERNS) {
      if (pattern.test(filename)) return group;
    }
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return null;
  const limit = Math.min(5, sheet.rowCount);
  for (let r = 1; r <= limit; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.max(row.cellCount, 10); c++) {
      const text = cellToString(row.getCell(c).value);
      for (const { pattern, group } of AGE_GROUP_PATTERNS) {
        if (pattern.test(text)) return group;
      }
    }
  }
  return null;
}

export async function parsePromesWorkbook(
  buffer: Buffer,
  options: { filename?: string } = {},
): Promise<ParsedPromes> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs.xlsx.load accepts Buffer | ArrayBuffer at runtime, but
    // Node's current `Buffer<ArrayBufferLike>` typing trips the build
    // against exceljs's older `Buffer` shape. Copy bytes into a fresh
    // ArrayBuffer so the call type-checks AND the slice (which can
    // surface a SharedArrayBuffer when readFileSync feeds us the
    // pooled Node Buffer) doesn't trip JSZip at runtime.
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    await workbook.xlsx.load(ab);
  } catch (err) {
    throw new PromesParseError(
      "EMPTY_WORKBOOK",
      `failed to load workbook: ${(err as Error).message}`,
      "Berkas xlsx tidak bisa dibaca. Pastikan berkas tidak rusak.",
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new PromesParseError(
      "MISSING_SHEET",
      "workbook has no worksheets",
      "Berkas xlsx tidak memiliki lembar kerja.",
    );
  }
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount === 0) {
    throw new PromesParseError(
      "MISSING_SHEET",
      "first worksheet is empty",
      "Lembar kerja pertama dalam berkas xlsx kosong.",
    );
  }

  const byElement: ParsedByElement = {};
  let currentElement: CurriculumElement | null = null;
  let currentObjective: ParsedObjective | null = null;
  let themeColMap: Map<number, string> = new Map();

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rawValues = row.values as CellValue[];
    const { strings, raw } = readRowAsStrings(row, rawValues);

    const colA = strings[0] ?? "";
    const colB = strings[1] ?? "";
    const colC = strings[2] ?? "";
    const colD = strings[3] ?? "";

    // 1. Element header — single-cell row whose col A matches an alias.
    //    Column header rows also start with text in col A ("NO") but those
    //    are filtered by looksLikeColumnHeader below. Element headers in
    //    PROMES are paragraph-style and always include words beyond the
    //    alias (e.g. "NAM PROGRAM SEMESTER 1") so we accept them only
    //    when detectElementHeader matches AND it isn't the column header.
    if (!looksLikeColumnHeader(strings)) {
      const elementMatch = detectElementHeader(colA);
      if (elementMatch) {
        currentElement = elementMatch;
        currentObjective = null;
        themeColMap = new Map();
        if (!byElement[elementMatch]) byElement[elementMatch] = [];
        continue;
      }
    }

    // 2. Column header row — capture theme names from cols E+ (index 4+).
    if (looksLikeColumnHeader(strings)) {
      themeColMap = new Map();
      for (let i = 4; i < strings.length; i++) {
        const name = strings[i].trim();
        if (name) themeColMap.set(i, name);
      }
      continue;
    }

    // Pre-first-element rows (workbook title, spacers) are ignored.
    if (currentElement === null) continue;

    // 3. TP row — col A is a positive int AND col B (CAPAIAN) AND col C
    //    (TUJUAN) are both non-empty. Both text guards are required:
    //    ExcelJS expands merged-cell content into every constituent row,
    //    so an IKTP row that happens to fall under a TP's col-B or col-C
    //    merge would pass a one-sided guard and be silently promoted to
    //    a phantom TP with no CAPAIAN text — orphaning every downstream
    //    IKTP. Real TP rows always carry both CAPAIAN + TUJUAN text.
    const tpNumber = cellToInt(raw[0] ?? null);
    if (tpNumber !== null && tpNumber > 0 && colB.trim() && colC.trim()) {
      currentObjective = {
        number: tpNumber,
        competencyText: colB.trim(),
        content: colC.trim(),
        indicators: [],
      };
      const bucket = byElement[currentElement];
      if (!bucket) {
        // Defensive — element bucket is created when we entered the element.
        byElement[currentElement] = [currentObjective];
      } else {
        bucket.push(currentObjective);
      }
      continue;
    }

    // 4. IKTP row — col D non-empty AND a current TP exists.
    const indicatorText = colD.trim();
    if (indicatorText && currentObjective) {
      const themeNames: string[] = [];
      for (const [colIndex, themeName] of themeColMap.entries()) {
        if (isTrueMarker(raw[colIndex] ?? null)) {
          themeNames.push(themeName);
        }
      }
      currentObjective.indicators.push({
        content: indicatorText,
        order: currentObjective.indicators.length + 1,
        themeNames,
      });
      continue;
    }

    // 5. Blank / spacer row — ignore.
  }

  const elementsFound = Object.keys(byElement).length;
  if (elementsFound === 0) {
    throw new PromesParseError(
      "EMPTY_WORKBOOK",
      "no element headers detected in workbook",
      "Berkas PROMES tidak memiliki blok elemen yang dikenali. Pastikan setiap blok diawali dengan judul elemen (mis. NAM, JATI DIRI, STEAM, MOTORIK, SENI).",
    );
  }

  return {
    inferredAgeGroup: inferAgeGroup(workbook, options.filename),
    byElement,
  };
}
