/**
 * Kisi-kisi grid shaping.
 *
 * A cohort's template set is a fixed 18 slots per (term × ageGroup):
 * 5 level-bearing sections × 3 `AchievementLevel` = 15, plus 3 single-content
 * closing sections. The API always returns all 18 — filled or empty — so the
 * authoring UI can render a stable grid and show honest "N/18 terisi"
 * progress instead of a list that grows as you type.
 *
 * Pure module: no DB, no React. Shared by the template API, the authoring
 * client, and the per-student editor's prefill lookup.
 */

import {
  BUCKETED_SECTIONS,
  CLOSING_SECTIONS,
  LEVEL_ORDER,
  type BucketedSection,
  type ClosingSection,
  type RaportLevel,
} from "./labels";

export const TOTAL_TEMPLATE_SLOTS =
  BUCKETED_SECTIONS.length * LEVEL_ORDER.length + CLOSING_SECTIONS.length;

export interface NarrativeTemplateRow {
  section: string;
  level: string;
  content: string;
}

export interface ClosingTemplateRow {
  section: string;
  content: string;
}

export interface TemplateGrid {
  /** `${section}:${level}` → content. Only non-empty entries present. */
  bucketed: Record<string, string>;
  /** `section` → content. Only non-empty entries present. */
  closing: Record<string, string>;
  filledCount: number;
  totalSlots: number;
}

/** Composite key for a bucketed slot. Single definition — never inline it. */
export function bucketKey(section: string, level: string): string {
  return `${section}:${level}`;
}

/**
 * Shape DB rows into the grid. Blank/whitespace-only content counts as
 * unfilled — an admin who clears a textarea and saves has removed the
 * template, and the progress count should say so.
 */
export function buildTemplateGrid(
  narrativeRows: NarrativeTemplateRow[],
  closingRows: ClosingTemplateRow[],
): TemplateGrid {
  const bucketed: Record<string, string> = {};
  const closing: Record<string, string> = {};

  for (const row of narrativeRows) {
    if (!row.content?.trim()) continue;
    if (!isBucketedSection(row.section)) continue;
    if (!isLevel(row.level)) continue;
    bucketed[bucketKey(row.section, row.level)] = row.content;
  }
  for (const row of closingRows) {
    if (!row.content?.trim()) continue;
    if (!isClosingSection(row.section)) continue;
    closing[row.section] = row.content;
  }

  return {
    bucketed,
    closing,
    filledCount: Object.keys(bucketed).length + Object.keys(closing).length,
    totalSlots: TOTAL_TEMPLATE_SLOTS,
  };
}

export function isBucketedSection(value: string): value is BucketedSection {
  return (BUCKETED_SECTIONS as readonly string[]).includes(value);
}

export function isClosingSection(value: string): value is ClosingSection {
  return (CLOSING_SECTIONS as readonly string[]).includes(value);
}

export function isLevel(value: string): value is RaportLevel {
  return (LEVEL_ORDER as readonly string[]).includes(value);
}

/**
 * Look up the narrative a section should start from, given the level the
 * admin currently has selected. Returns null when there is no template or no
 * level (INTRODUCTION before the admin picks one) — callers must treat null
 * as "leave the field alone", never as "clear it".
 */
export function templateFor(
  grid: Pick<TemplateGrid, "bucketed" | "closing">,
  section: string,
  level: string | null | undefined,
): string | null {
  if (isClosingSection(section)) {
    return grid.closing[section] ?? null;
  }
  if (!level || !isBucketedSection(section) || !isLevel(level)) return null;
  return grid.bucketed[bucketKey(section, level)] ?? null;
}

/**
 * Which of the target's slots a clone would actually write. Slots already
 * carrying text in the target are skipped — cloning into a partly-authored
 * term must never overwrite someone's work.
 */
export function planClone(
  source: Pick<TemplateGrid, "bucketed" | "closing">,
  target: Pick<TemplateGrid, "bucketed" | "closing">,
): {
  bucketed: Array<{ section: string; level: string; content: string }>;
  closing: Array<{ section: string; content: string }>;
  skipped: number;
} {
  const bucketed: Array<{ section: string; level: string; content: string }> = [];
  const closing: Array<{ section: string; content: string }> = [];
  let skipped = 0;

  for (const [key, content] of Object.entries(source.bucketed)) {
    if (target.bucketed[key]?.trim()) {
      skipped++;
      continue;
    }
    const [section, level] = key.split(":");
    bucketed.push({ section, level, content });
  }
  for (const [section, content] of Object.entries(source.closing)) {
    if (target.closing[section]?.trim()) {
      skipped++;
      continue;
    }
    closing.push({ section, content });
  }

  return { bucketed, closing, skipped };
}
