/**
 * Single source of truth for the 3-level early-childhood assessment skala
 * (CONSISTENT / EMERGING / NEEDS_REINFORCEMENT) — display labels, chip classes,
 * and PDF hex. Consumed by every surface so a level reads identically across
 * teacher assessment screens, parent portal, admin raport editor, and the
 * raport PDF.
 *
 * Voice call (cycle 2026-06-24-ui-consistency-sweep, confirmed with user):
 *   NEEDS_REINFORCEMENT renders INFO (status-leave / blue) — NOT absent-red,
 *   NOT praise-teal. A "needs reinforcement" level is an honest developmental
 *   note, not an alarm; red is reserved for attendance Alpa / destructive.
 *
 * Long-form labels are authoritative for raport (parent-facing); short-form is
 * for compact tap-buttons + density-tight chips. See voice.md glossary.
 */

export type Level = "CONSISTENT" | "EMERGING" | "NEEDS_REINFORCEMENT";

export const LEVEL_ORDER: readonly Level[] = [
  "CONSISTENT",
  "EMERGING",
  "NEEDS_REINFORCEMENT",
] as const;

/** Compact labels — tap-buttons, tight chips, progress-row readouts. */
export const LEVEL_LABEL_SHORT: Record<Level, string> = {
  CONSISTENT: "Mampu",
  EMERGING: "Belum",
  NEEDS_REINFORCEMENT: "Perlu",
};

/** Long-form labels — raport, parent reports, PDF (authoritative). */
export const LEVEL_LABEL_LONG: Record<Level, string> = {
  CONSISTENT: "Mampu dan Konsisten",
  EMERGING: "Mampu Belum Konsisten",
  NEEDS_REINFORCEMENT: "Perlu Penguatan",
};

/**
 * Active (selected) chip class. NEEDS_REINFORCEMENT = info-leave
 * (NOT absent-red, NOT teal) per the voice call above.
 */
export const LEVEL_CHIP_CLASS: Record<Level, string> = {
  CONSISTENT: "bg-status-present text-white border-status-present",
  EMERGING: "bg-status-late text-white border-status-late",
  NEEDS_REINFORCEMENT: "bg-status-leave text-white border-status-leave",
};

/** Inactive (unselected) chip class — subtle tint variant. */
export const LEVEL_CHIP_CLASS_OFF: Record<Level, string> = {
  CONSISTENT: "border-status-present text-status-present-text bg-status-present-subtle",
  EMERGING: "border-status-late text-status-late bg-status-late/10",
  NEEDS_REINFORCEMENT: "border-status-leave text-status-leave-text bg-status-leave/10",
};

/** Hex for @react-pdf/renderer (no CSS-var access server-side). Mirrors LEVEL_CHIP_CLASS. */
export const LEVEL_HEX: Record<Level, string> = {
  CONSISTENT: "#00B37E", // --status-present
  EMERGING: "#FF8C00", // --status-late
  NEEDS_REINFORCEMENT: "#0EA5E9", // --status-leave (info, NOT red)
};
