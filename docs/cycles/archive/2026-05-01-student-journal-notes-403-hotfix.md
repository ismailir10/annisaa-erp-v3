# Student Journal — Notes 403 Hotfix (multi-enrollment edge)

## Context

Live verification on staging after PR #153 merged surfaced a 403 "Forbidden" toast when teacher Ismail (`ismail10rabbanii@gmail.com`) tried to add a note to student Aisyah Maryam Nasution from the class-day grid. Direct DB inspection confirmed the cause:

- Aisyah has TWO ACTIVE `StudentEnrollment` rows. Both target classes named "DCARE — Aster" (different ClassSection ids: `cmodt0rlg001d7bx77acxxlax` + `cmodt0s23001k7bx79lblkm8a`).
- Ismail has a `TeachingAssignment` for ONE of them (`cmodt0s23001k7bx79lblkm8a`).
- `app/api/student-journal/notes/route.ts` (and `students/[id]/week/route.ts`) used `prisma.studentEnrollment.findFirst({ where: { studentId, status: "ACTIVE" } })` which returned the OTHER enrollment — the one Ismail isn't assigned to. Permission check then failed with 403.

The bug pre-dates the cross-actor audit cycle, but T6's new "Tambah Catatan" affordance on the class-day grid is the path that exposed it (the entry grid renders for the class the teacher IS assigned to, then the dialog POSTs the note with student-id only — no class scoping).

## Spec

- [ ] `POST /api/student-journal/notes` (TEACHER branch): replace `findFirst` enrollment lookup with `findMany`, then check the teacher's `TeachingAssignment` against `classSectionId: { in: [...enrollments] }`. Grant if the teacher is assigned to ANY of the student's active classes.
- [ ] `GET /api/student-journal/students/[id]/week`: same pattern fix on the inline auth block.
- [ ] No schema change. No data migration. Behavior remains tenant-scoped.
- [ ] Build + vitest gates green; existing 823 tests still pass (no regression in single-enrollment flows).

## Tasks

- [ ] **H1 — `notes` route multi-enrollment fix.** Update `app/api/student-journal/notes/route.ts` to use `findMany` + assignment-IN. Comment explaining why.
- [ ] **H2 — `students/[id]/week` route multi-enrollment fix.** Same pattern in `app/api/student-journal/students/[id]/week/route.ts`.
- [ ] **H3 — Verify on Vercel preview after merge.** Re-run the manual smoke (teacher Ismail → click MessageSquarePlus on Aisyah → write note → expect "Catatan tersimpan" toast, not "Forbidden").

## Implementation

- **H1 — `notes` route fix.** `app/api/student-journal/notes/route.ts:47-68` — `findFirst` enrollment lookup → `findMany`; `TeachingAssignment.findFirst` `classSectionId: enrollment.classSectionId` → `classSectionId: { in: enrollments.map(e => e.classSectionId) }`. Empty-array guard returns 404 "Student not enrolled" same as before.
- **H2 — `students/[id]/week` route fix.** `app/api/student-journal/students/[id]/week/route.ts:30-49` — same pattern. Also added explicit `classSection: { tenantId }` filter on the enrollment fetch (was missing — relied on assignment lookup for tenant scoping; now defense-in-depth).

## Verification

- `npm run build` ✓
- `npx vitest run` — 823 passed (no regressions)
- DB pre-fix evidence (against staging via direct query):
  - Aisyah Maryam Nasution: 2 ACTIVE enrollments → `[cmodt0rlg001d7bx77acxxlax, cmodt0s23001k7bx79lblkm8a]`
  - Ismail employeeId `cmodt0udb00297bx7ys8k83h4` TeachingAssignments → `[cmodt0s23001k7bx79lblkm8a]`
  - Pre-fix `findFirst` returned the wrong enrollment → 403
  - Post-fix `findMany + IN` matches the assigned class → 201 expected

## Ship Notes

- No migration. No env vars. No frontend change.
- Manual smoke after merge:
  1. Open https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app as teacher (Google OAuth)
  2. Penghubung tab → pick class with multi-enrolled students → entry grid
  3. Tap MessageSquarePlus on a student with multi-enrollment (Aisyah) → write note → Save → expect "Catatan tersimpan"
- Rollback: revert PR. No data side-effects.
