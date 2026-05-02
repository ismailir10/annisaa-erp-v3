/**
 * Single source of truth for repeated filter dropdown option arrays.
 *
 * Admin list pages reuse the same "all + ACTIVE + INACTIVE" triple in
 * multiple places. Centralizing keeps labels consistent and makes label
 * copy edits a one-line change.
 */

export type FilterOption = { value: string; label: string };

/** Active/inactive toggle with an "all" fallback. Used by employees, users, and settings pages. */
export const ACTIVE_STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "INACTIVE", label: "Tidak Aktif" },
];

/** Full student lifecycle status set. Used by students list page. */
export const STUDENT_STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "ENROLLED", label: "Terdaftar di Kelas" },
  { value: "GRADUATED", label: "Lulus" },
  { value: "WITHDRAWN", label: "Keluar" },
  { value: "INACTIVE", label: "Tidak Aktif" },
];

/** Generic yes/no filter with an "all" fallback. Used anywhere a boolean field filters a list. */
export const YES_NO_OPTIONS: FilterOption[] = [
  { value: "all", label: "Semua" },
  { value: "yes", label: "Ya" },
  { value: "no", label: "Tidak" },
];
