/**
 * Semester calendar CSV → Theme / SubTheme / Week plan.
 *
 * The school authors the pekan calendar as a table (theme → sub-theme →
 * week → date bracket). Hand-entering it through the themes CRUD is ~8
 * themes × ~4 sub-themes × ~17 weeks per semester, and a single wrong or
 * missing bracket surfaces to a walas as "Belum ada Pekan aktif" on the
 * day they try to assess — with no clue why. So the import validates the
 * whole calendar before writing anything.
 *
 * Pure module: parsing + validation only, no DB and no filesystem. The
 * `scripts/import-curriculum-calendar.ts` wrapper does the IO.
 */

/** Frozen header, in order. Documented in the cycle doc's input manifest. */
export const CALENDAR_CSV_HEADER = [
  "theme_order",
  "theme_name",
  "subtheme_order",
  "subtheme_name",
  "week_number",
  "start_date",
  "end_date",
] as const;

export interface CalendarRow {
  themeOrder: number;
  themeName: string;
  subThemeOrder: number;
  subThemeName: string;
  weekNumber: number;
  startDate: string; // YYYY-MM-DD, Jakarta calendar day
  endDate: string;
}

export interface CalendarPlan {
  themes: Array<{
    name: string;
    order: number;
    subThemes: Array<{
      name: string;
      order: number;
      weeks: Array<{ number: number; startDate: string; endDate: string }>;
    }>;
  }>;
  weekCount: number;
}

export interface CalendarIssue {
  /** 1-based line number in the source CSV (header is line 1). */
  line: number | null;
  message: string;
}

export interface CalendarParseResult {
  rows: CalendarRow[];
  issues: CalendarIssue[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Split one CSV line, honouring double-quoted fields (theme names can
 * contain commas). Doubled quotes inside a quoted field are an escaped
 * quote, per RFC 4180.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Parse a YYYY-MM-DD Jakarta day to its UTC-midnight Date (storage contract). */
export function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** 0 = Sunday … 6 = Saturday, read in UTC to match the storage contract. */
function dayOfWeek(ymd: string): number {
  return parseYmd(ymd).getUTCDay();
}

function isValidYmd(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const d = parseYmd(ymd);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip guards against 2026-02-31 style overflow.
  return d.toISOString().slice(0, 10) === ymd;
}

/** Parse raw CSV text into typed rows. Structural errors only. */
export function parseCalendarCsv(text: string): CalendarParseResult {
  const issues: CalendarIssue[] = [];
  const rows: CalendarRow[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l, idx) => ({ text: l, line: idx + 1 }))
    .filter((l) => l.text.trim() !== "");

  if (lines.length === 0) {
    issues.push({ line: null, message: "Berkas CSV kosong." });
    return { rows, issues };
  }

  const header = splitCsvLine(lines[0].text).map((h) => h.toLowerCase());
  const expected = CALENDAR_CSV_HEADER.join(",");
  if (header.join(",") !== expected) {
    issues.push({
      line: 1,
      message: `Header CSV harus persis: ${expected}. Ditemukan: ${header.join(",")}`,
    });
    return { rows, issues };
  }

  for (const { text: raw, line } of lines.slice(1)) {
    const cells = splitCsvLine(raw);
    if (cells.length !== CALENDAR_CSV_HEADER.length) {
      issues.push({
        line,
        message: `Butuh ${CALENDAR_CSV_HEADER.length} kolom, ditemukan ${cells.length}.`,
      });
      continue;
    }
    const [
      themeOrderRaw,
      themeName,
      subThemeOrderRaw,
      subThemeName,
      weekNumberRaw,
      startDate,
      endDate,
    ] = cells;

    const themeOrder = Number(themeOrderRaw);
    const subThemeOrder = Number(subThemeOrderRaw);
    const weekNumber = Number(weekNumberRaw);
    let bad = false;

    for (const [label, value] of [
      ["theme_order", themeOrder],
      ["subtheme_order", subThemeOrder],
      ["week_number", weekNumber],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        issues.push({
          line,
          message: `${label} harus bilangan bulat ≥ 1.`,
        });
        bad = true;
      }
    }
    if (!themeName) {
      issues.push({ line, message: "theme_name tidak boleh kosong." });
      bad = true;
    }
    if (!subThemeName) {
      issues.push({ line, message: "subtheme_name tidak boleh kosong." });
      bad = true;
    }
    for (const [label, value] of [
      ["start_date", startDate],
      ["end_date", endDate],
    ] as const) {
      if (!isValidYmd(value)) {
        issues.push({
          line,
          message: `${label} harus tanggal YYYY-MM-DD yang valid, ditemukan "${value}".`,
        });
        bad = true;
      }
    }
    if (bad) continue;

    rows.push({
      themeOrder,
      themeName,
      subThemeOrder,
      subThemeName,
      weekNumber,
      startDate,
      endDate,
    });
  }

  return { rows, issues };
}

export interface ValidateCalendarOptions {
  /** Semester window; weeks must fall inside it. Both YYYY-MM-DD. */
  semesterStart?: string;
  semesterEnd?: string;
  /**
   * Require Monday start / Friday end. Default true — the Week model
   * documents that contract. Relaxable for schools on a different week
   * shape.
   */
  requireMonFri?: boolean;
}

/**
 * Cross-row validation. Returns the write plan plus every problem found;
 * callers must refuse to write when `issues` is non-empty.
 */
export function buildCalendarPlan(
  rows: CalendarRow[],
  options: ValidateCalendarOptions = {},
): { plan: CalendarPlan; issues: CalendarIssue[] } {
  const { semesterStart, semesterEnd, requireMonFri = true } = options;
  const issues: CalendarIssue[] = [];
  const plan: CalendarPlan = { themes: [], weekCount: 0 };

  if (rows.length === 0) {
    issues.push({ line: null, message: "Tidak ada baris pekan yang valid." });
    return { plan, issues };
  }

  // Per-row shape checks.
  rows.forEach((r, idx) => {
    const line = idx + 2; // header + 0-based
    if (r.startDate > r.endDate) {
      issues.push({
        line,
        message: `Pekan ${r.weekNumber}: start_date (${r.startDate}) melewati end_date (${r.endDate}).`,
      });
    }
    if (requireMonFri) {
      if (dayOfWeek(r.startDate) !== 1) {
        issues.push({
          line,
          message: `Pekan ${r.weekNumber}: start_date ${r.startDate} bukan hari Senin.`,
        });
      }
      if (dayOfWeek(r.endDate) !== 5) {
        issues.push({
          line,
          message: `Pekan ${r.weekNumber}: end_date ${r.endDate} bukan hari Jumat.`,
        });
      }
    }
    if (semesterStart && r.startDate < semesterStart) {
      issues.push({
        line,
        message: `Pekan ${r.weekNumber} mulai ${r.startDate}, sebelum awal semester (${semesterStart}).`,
      });
    }
    if (semesterEnd && r.endDate > semesterEnd) {
      issues.push({
        line,
        message: `Pekan ${r.weekNumber} berakhir ${r.endDate}, setelah akhir semester (${semesterEnd}).`,
      });
    }
  });

  // Week numbers: unique and contiguous from 1 across the whole semester.
  const byNumber = new Map<number, number>();
  for (const r of rows) {
    byNumber.set(r.weekNumber, (byNumber.get(r.weekNumber) ?? 0) + 1);
  }
  for (const [number, count] of byNumber) {
    if (count > 1) {
      issues.push({
        line: null,
        message: `week_number ${number} muncul ${count} kali — nomor pekan harus unik dalam satu semester.`,
      });
    }
  }
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      issues.push({
        line: null,
        message: `Nomor pekan harus berurutan mulai dari 1 tanpa lompatan. Ditemukan lompatan di sekitar pekan ${numbers[i]}.`,
      });
      break;
    }
  }

  // Date brackets must not overlap. Sort by start, compare neighbours.
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.startDate <= prev.endDate) {
      issues.push({
        line: null,
        message: `Rentang pekan bertabrakan: pekan ${prev.weekNumber} (${prev.startDate}–${prev.endDate}) dan pekan ${cur.weekNumber} (${cur.startDate}–${cur.endDate}).`,
      });
    }
  }

  // A theme name must map to exactly one order, likewise sub-themes
  // within a theme — otherwise the grouping below is ambiguous.
  const themeOrderByName = new Map<string, number>();
  for (const r of rows) {
    const seen = themeOrderByName.get(r.themeName);
    if (seen === undefined) themeOrderByName.set(r.themeName, r.themeOrder);
    else if (seen !== r.themeOrder) {
      issues.push({
        line: null,
        message: `Tema "${r.themeName}" punya theme_order berbeda (${seen} dan ${r.themeOrder}).`,
      });
    }
  }

  // Group into the write plan (built even when issues exist, so a
  // dry-run can show the shape alongside the errors).
  const themeMap = new Map<string, CalendarPlan["themes"][number]>();
  for (const r of rows) {
    let theme = themeMap.get(r.themeName);
    if (!theme) {
      theme = { name: r.themeName, order: r.themeOrder, subThemes: [] };
      themeMap.set(r.themeName, theme);
    }
    let sub = theme.subThemes.find((s) => s.name === r.subThemeName);
    if (!sub) {
      sub = { name: r.subThemeName, order: r.subThemeOrder, weeks: [] };
      theme.subThemes.push(sub);
    } else if (sub.order !== r.subThemeOrder) {
      issues.push({
        line: null,
        message: `Sub-tema "${r.subThemeName}" pada tema "${r.themeName}" punya subtheme_order berbeda (${sub.order} dan ${r.subThemeOrder}).`,
      });
    }
    sub.weeks.push({
      number: r.weekNumber,
      startDate: r.startDate,
      endDate: r.endDate,
    });
  }

  plan.themes = [...themeMap.values()].sort((a, b) => a.order - b.order);
  for (const theme of plan.themes) {
    theme.subThemes.sort((a, b) => a.order - b.order);
    for (const sub of theme.subThemes) {
      sub.weeks.sort((a, b) => a.number - b.number);
    }
  }
  plan.weekCount = rows.length;

  return { plan, issues };
}
