/**
 * Shared Indonesian copy for Student Journal per-student access errors.
 *
 * Leaf module — NO imports beyond pure types. Both server (Prisma/Next route
 * handlers in `lib/student-journal/guards.ts`) and client (page-level fetch
 * fallbacks in `app/teacher/student-journal/students/[id]/page.tsx`) import
 * from here so the literal lives in one place. Pulling these from
 * `guards.ts` would drag `next/server` + Prisma into client bundles.
 */

/**
 * Indonesian copy for any 403 from the Student Journal per-student endpoints
 * (`students/[id]/week`, `notes` POST). Frontend toasts this verbatim and
 * the same constant is the client fallback when the response body is missing
 * the `error` field. Source: cycle `2026-05-01-student-journal-uat-blockers`
 * T1 (UAT report `docs/uat/reports/2026-05-01-student-journal.md`).
 */
export const JOURNAL_FORBIDDEN_MSG =
  "Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan.";

/**
 * Indonesian copy for the 404 returned when the teacher branch can't find an
 * active enrollment for the student. State problem (not authz), so it stays
 * 404 — but the message must match the surrounding Indonesian flow.
 */
export const JOURNAL_NOT_ENROLLED_MSG = "Siswa belum terdaftar di kelas aktif.";
