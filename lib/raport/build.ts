/**
 * Shared raport assembly — turns a stored `ReportCardEntry` (+ measurement +
 * term) into the display shapes used by the PDF renderer AND the parent portal
 * drawer. Centralising it here keeps section order, Indonesian labels, and
 * level formatting identical across admin PDF, guardian PDF, and parent screen.
 */

import {
  BUCKETED_SECTIONS,
  CLOSING_SECTIONS,
  SECTION_LABELS,
  SECTION_HAS_SUGGESTION,
  LEVEL_LABELS,
  type ReportSectionKey,
  type RaportLevel,
} from "@/lib/raport/labels";
import type { ReportCardData, ReportCardSection } from "@/lib/pdf/report-card";
import type { Level } from "@/lib/curriculum/level-presentation";

/** Narrow an unknown JSON column to a plain string-keyed object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Canonical render order: 5 bucketed sections, then 3 closing sections. */
export const SECTION_ORDER: readonly ReportSectionKey[] = [
  ...BUCKETED_SECTIONS,
  ...CLOSING_SECTIONS,
] as const;

/**
 * Stored `sectionLevels` / `sectionNarratives` JSON → ordered display sections.
 * Level is attached only to level-bearing sections (INTRODUCTION + the closing
 * sections carry no level). Levels are formatted to their Indonesian long-form
 * labels; an unknown/missing level → null (chip hidden). Narrative defaults to
 * empty string (renderer shows an em-dash).
 */
export function buildReportSections(
  sectionLevels: unknown,
  sectionNarratives: unknown,
): ReportCardSection[] {
  const levels = (isObj(sectionLevels) ? sectionLevels : {}) as Record<string, RaportLevel>;
  const narratives = (isObj(sectionNarratives) ? sectionNarratives : {}) as Record<string, string>;

  return SECTION_ORDER.map((key) => {
    const isLevelBearing =
      (BUCKETED_SECTIONS as readonly string[]).includes(key) &&
      SECTION_HAS_SUGGESTION[key as keyof typeof SECTION_HAS_SUGGESTION];
    const lvl = isLevelBearing ? levels[key] : undefined;
    const valid = lvl && lvl in LEVEL_LABELS ? (lvl as Level) : null;
    return {
      label: SECTION_LABELS[key],
      level: valid ? LEVEL_LABELS[valid] : null,
      levelKey: valid,
      narrative: typeof narratives[key] === "string" ? narratives[key] : "",
    };
  });
}

/** "Triwulan 1 · Semester 1 · 2025/2026" — shared period label. */
export function formatTermLabel(
  termNumber: number,
  semesterNumber: number,
  academicYear: string,
): string {
  return `Triwulan ${termNumber} · Semester ${semesterNumber} · ${academicYear}`;
}

export type RaportEntryFields = {
  sectionLevels: unknown;
  sectionNarratives: unknown;
  sickDays: number;
  permittedAbsenceDays: number;
  unexcusedAbsenceDays: number;
  totalSchoolDays: number;
  memorizationNotes: string | null;
};

/** Decimal-ish measurement → display string (null when absent). */
function measurementStr(v: unknown): string | null {
  return v != null ? String(v) : null;
}

/**
 * Full `ReportCardData` for `ReportCardPdf`, shared by the admin and guardian
 * PDF routes. `generatedDate` is stamped in Asia/Jakarta at call time.
 */
export function buildReportCardData(input: {
  schoolName: string;
  studentName: string;
  className: string | null;
  termNumber: number;
  semesterNumber: number;
  academicYear: string;
  entry: RaportEntryFields;
  measurement: { heightCm: unknown; weightKg: unknown } | null;
}): ReportCardData {
  const { entry } = input;
  return {
    schoolName: input.schoolName,
    studentName: input.studentName,
    className: input.className,
    termLabel: formatTermLabel(input.termNumber, input.semesterNumber, input.academicYear),
    sections: buildReportSections(entry.sectionLevels, entry.sectionNarratives),
    attendance: {
      sick: entry.sickDays,
      permitted: entry.permittedAbsenceDays,
      unexcused: entry.unexcusedAbsenceDays,
      total: entry.totalSchoolDays,
    },
    hafalan: entry.memorizationNotes,
    height: measurementStr(input.measurement?.heightCm),
    weight: measurementStr(input.measurement?.weightKg),
    generatedDate: new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }),
  };
}
