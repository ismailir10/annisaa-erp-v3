/**
 * Display labels + section ordering for the raport surface. Shared by the admin
 * editor UI and the PDF renderer so copy never diverges. Indonesian per voice.md.
 *
 * Level type + long-form labels are re-exported from the canonical
 * `lib/curriculum/level-presentation.ts` (single source across teacher
 * assessment, parent portal, admin raport, and PDF).
 */

// Canonical type + long labels live in level-presentation.ts; re-exported here
// under the legacy names so existing raport consumers (build.ts, raport-editor,
// tests) keep compiling without churn. Local alias needed so LEVEL_ORDER /
// LEVEL_SHORT can reference the type in-file.
import type { Level } from "@/lib/curriculum/level-presentation";
export type RaportLevel = Level;
export { LEVEL_LABEL_LONG as LEVEL_LABELS } from "@/lib/curriculum/level-presentation";

export const LEVEL_ORDER: readonly RaportLevel[] = [
  "CONSISTENT",
  "EMERGING",
  "NEEDS_REINFORCEMENT",
] as const;

/** Short level chips used beside the "saran penilaian" rollup. */
export const LEVEL_SHORT: Record<RaportLevel, string> = {
  CONSISTENT: "K",
  EMERGING: "BK",
  NEEDS_REINFORCEMENT: "PP",
};

/** Level-bearing sections (admin sets a level + narrative). */
export const BUCKETED_SECTIONS = [
  "INTRODUCTION",
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "PERFORMANCE_SHOWCASE",
] as const;

/** Single-content closing sections (narrative only, no level). */
export const CLOSING_SECTIONS = [
  "CLOSING",
  "FOLLOW_UP_PLAN",
  "HOME_ACTIVITIES",
] as const;

export type BucketedSection = (typeof BUCKETED_SECTIONS)[number];
export type ClosingSection = (typeof CLOSING_SECTIONS)[number];
export type ReportSectionKey = BucketedSection | ClosingSection;

export const SECTION_LABELS: Record<ReportSectionKey, string> = {
  INTRODUCTION: "Pembukaan",
  RELIGIOUS_MORAL: "Nilai Agama & Budi Pekerti",
  IDENTITY: "Jati Diri",
  STEAM: "STEAM / Literasi",
  PERFORMANCE_SHOWCASE: "Unjuk Kerja",
  CLOSING: "Penutup",
  FOLLOW_UP_PLAN: "Rencana Tindak Lanjut",
  HOME_ACTIVITIES: "Kegiatan Disarankan di Rumah",
};

/** INTRODUCTION has no penilaian source — never auto-suggested. */
export const SECTION_HAS_SUGGESTION: Record<BucketedSection, boolean> = {
  INTRODUCTION: false,
  RELIGIOUS_MORAL: true,
  IDENTITY: true,
  STEAM: true,
  PERFORMANCE_SHOWCASE: true,
};
