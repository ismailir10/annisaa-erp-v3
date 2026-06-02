/**
 * Canonical Select options for parent / guardian demographic + lifestyle fields.
 *
 * These constants are the single source of truth for the four touch points that
 * collect or edit Parent / StudentGuardian / Admission data:
 *
 *   1. app/admin/admissions/page.tsx        (Admission create + edit dialog)
 *   2. app/admin/guardians/page.tsx         (Guardians list edit dialog)
 *   3. app/admin/guardians/[id]/page.tsx    (Guardian detail edit dialog)
 *   4. app/admin/students/[id]/page.tsx     (Student detail guardian dialog)
 *   5. app/daftar/client.tsx                (Public admission funnel — only relationship/livingWith if it adopts them later)
 *
 * --- SUPERSET STRATEGY -------------------------------------------------------
 *
 * Prior to this consolidation each of the four surfaces shipped a different
 * inline option list. The same Parent row could therefore be saved from one
 * surface with a value the other surface did not list, so the row's Select
 * would render BLANK when opened from the other surface. Narrowing the
 * canonical list to a "clean" minimum would break exactly that flow for every
 * pre-existing DB row.
 *
 * The canonical lists below are therefore the UNION of every value observed
 * in production-shaped option lists across the four surfaces. No data migration
 * is performed; reads stay backward compatible.
 *
 * Legacy-source mapping (where each value originated):
 *
 *   OCCUPATION_OPTIONS:
 *     PNS, TNI/Polri, Guru/Dosen, Dokter, Petani, Nelayan, Buruh
 *       <- app/admin/guardians/page.tsx
 *     ASN, Guru, BUMN
 *       <- app/admin/admissions/page.tsx, app/admin/students/[id]/page.tsx
 *     Freelance
 *       <- app/admin/students/[id]/page.tsx
 *     Karyawan Swasta, Wiraswasta, Ibu Rumah Tangga, Lainnya
 *       <- all surfaces
 *
 *   EDUCATION_OPTIONS:
 *     SMA, D1-D3, S1, S2, S3
 *       <- all surfaces
 *     Profesi
 *       <- app/admin/guardians/page.tsx, app/admin/students/[id]/page.tsx
 *
 *   INCOME_OPTIONS: two label families coexist in real DB rows — both preserved.
 *     "Rp" family (< Rp 1 Juta, Rp 1-2 Juta, Rp 3-5 Juta, Rp 5-10 Juta,
 *      Rp 7-10 Juta, > Rp 10 Juta)
 *       <- app/admin/admissions/page.tsx, app/admin/students/[id]/page.tsx
 *     "jt" short-form family (<2jt, 2-5jt, 5-10jt, 10-20jt, >20jt)
 *       <- app/admin/guardians/page.tsx
 *
 *   RELATIONSHIP_OPTIONS:
 *     AYAH, IBU, WALI, OTHER
 *       <- all surfaces
 *     PARENT
 *       <- legacy value observed in REL_LABELS map of
 *          app/admin/students/[id]/page.tsx (line 51); kept so legacy rows
 *          rendered the value in read-only contexts continue to round-trip
 *          through the edit Select.
 *
 *   LIVING_WITH_OPTIONS:
 *     ORANG_TUA, WALI, LAINNYA
 *       <- app/admin/students/[id]/page.tsx
 *
 * Adding a new option: append to the canonical list AND keep every legacy
 * value. Removing a value would re-introduce the blank-Select drift this
 * file exists to prevent — do not remove without a data migration that
 * rewrites every Parent / StudentGuardian / Student row holding the value.
 */

export type Option = Readonly<{ value: string; label: string }>;

export const EDUCATION_OPTIONS: readonly Option[] = [
  { value: "SMA", label: "SMA" },
  { value: "D1-D3", label: "D1-D3" },
  { value: "S1", label: "S1" },
  { value: "S2", label: "S2" },
  { value: "S3", label: "S3" },
  { value: "Profesi", label: "Profesi" },
] as const;

export const OCCUPATION_OPTIONS: readonly Option[] = [
  { value: "PNS", label: "PNS" },
  { value: "TNI/Polri", label: "TNI/Polri" },
  { value: "ASN", label: "ASN" },
  { value: "Karyawan Swasta", label: "Karyawan Swasta" },
  { value: "BUMN", label: "BUMN" },
  { value: "Guru", label: "Guru" },
  { value: "Guru/Dosen", label: "Guru/Dosen" },
  { value: "Dokter", label: "Dokter" },
  { value: "Wiraswasta", label: "Wiraswasta" },
  { value: "Freelance", label: "Freelance" },
  { value: "Petani", label: "Petani" },
  { value: "Nelayan", label: "Nelayan" },
  { value: "Buruh", label: "Buruh" },
  { value: "Ibu Rumah Tangga", label: "Ibu Rumah Tangga" },
  { value: "Lainnya", label: "Lainnya" },
] as const;

export const INCOME_OPTIONS: readonly Option[] = [
  // "Rp" label family — used by admissions + student-detail guardian dialog.
  { value: "< Rp 1 Juta", label: "< Rp 1 Juta" },
  { value: "Rp 1-2 Juta", label: "Rp 1-2 Juta" },
  { value: "Rp 3-5 Juta", label: "Rp 3-5 Juta" },
  { value: "Rp 5-10 Juta", label: "Rp 5-10 Juta" },
  { value: "Rp 7-10 Juta", label: "Rp 7-10 Juta" },
  { value: "> Rp 10 Juta", label: "> Rp 10 Juta" },
  // "jt" short-form family — used by guardians-list edit dialog. Persisted
  // in real Parent rows; keep so those rows render their current selection.
  { value: "<2jt", label: "< Rp 2 juta" },
  { value: "2-5jt", label: "Rp 2–5 juta" },
  { value: "5-10jt", label: "Rp 5–10 juta" },
  { value: "10-20jt", label: "Rp 10–20 juta" },
  { value: ">20jt", label: "> Rp 20 juta" },
] as const;

export const RELATIONSHIP_OPTIONS: readonly Option[] = [
  { value: "AYAH", label: "Ayah" },
  { value: "IBU", label: "Ibu" },
  { value: "WALI", label: "Wali" },
  { value: "OTHER", label: "Lainnya" },
  // Legacy value preserved so rows persisted with "PARENT" still round-trip
  // through edit Selects. See REL_LABELS map in app/admin/students/[id]/page.tsx.
  { value: "PARENT", label: "Orang Tua" },
] as const;

export const LIVING_WITH_OPTIONS: readonly Option[] = [
  { value: "ORANG_TUA", label: "Orang Tua" },
  { value: "WALI", label: "Wali" },
  { value: "LAINNYA", label: "Lainnya" },
] as const;

/**
 * REL_LABELS — flat lookup used by read-only badge renderers.
 * Mirrors RELATIONSHIP_OPTIONS so the badge and the Select agree.
 */
export const REL_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label])),
);

/**
 * LIVING_WITH_LABELS — flat lookup for read-only display.
 */
export const LIVING_WITH_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(LIVING_WITH_OPTIONS.map((o) => [o.value, o.label])),
);
