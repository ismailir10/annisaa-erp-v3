/**
 * Shared constants for the admissions module, split out of
 * `app/admin/admissions/page.tsx` (T5, cycle 2026-09-27-admin-finish-standard).
 * No behaviour change — moved verbatim.
 */

export const SOURCE_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WALK_IN: "Datang Langsung",
  WEBSITE: "Website",
  REFERRAL: "Referensi",
  OTHER: "Lainnya",
};

// Happy-path transitions for the Admission state machine.
// Mirrors VALID_TRANSITIONS in `app/api/admissions/[id]/route.ts`.
// Terminal state CANCELLED has no next step. ADMITTED is terminal in the
// next-action surface (no entry below) but retains ADMITTED → CANCELLED via
// VALID_TRANSITIONS. ADMITTED-with-studentId hides via the row-action
// early-return (see actions column cell). Cycle 2026-05-12 dropped REGISTERED
// — converted vs not is encoded by `studentId`.
export const NEXT_STATUS: Record<string, { status: string; label: string } | undefined> = {
  INQUIRY: { status: "VISIT_SCHEDULED", label: "Jadwalkan Kunjungan" },
  VISIT_SCHEDULED: { status: "VISITED", label: "Tandai Sudah Kunjungan" },
  VISITED: { status: "ADMITTED", label: "Terima" },
};

// Terminal states — hide "Batalkan" when already at one of these.
export const TERMINAL_STATUSES = new Set(["CANCELLED"]);
