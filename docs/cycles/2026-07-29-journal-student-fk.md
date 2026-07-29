# Student journal tables — missing Student foreign key

## Context

`StudentJournalEntry.studentId` and `StudentJournalNote.studentId` shipped as
plain `String` columns with no `@relation` to `Student`. Prisma treats an
unbound scalar as an ordinary field, so `npx prisma validate` stays green and
no foreign key is emitted. Every other student-owned table declares one:
`StudentAttendance`, `StudentEnrollment`, `StudentGuardian`,
`StudentMeasurement`, `AssessmentEntry`, `ReportCardEntry` (all `Cascade`),
plus `Invoice` / `StudentAssessment` (`Restrict`) and `Admission` /
`EnrollmentApplication` (`SetNull`).

Found on 2026-07-29 during the staging data cleanup: deleting 177 students
cascaded correctly through ten tables but left **7,560 `StudentJournalEntry`
rows and 50 `StudentJournalNote` rows stranded**. They had to be removed with a
hand-written `DELETE` that no schema constraint would have required. Any other
path that deletes a Student — admin hard-delete, tenant teardown, test fixture
cleanup — silently accumulates the same orphans.

Measured before this cycle:

| Env | orphan entries | orphan notes | total entries | total notes |
|---|---|---|---|---|
| staging (`udbivhchbizpxoryejgz`) | 0 | 0 | 840 | 6 |
| prod (`vxwywmvpxetdgnxejjgk`) | 0 | 0 | 0 | 0 |

Both read zero *at authoring time* — staging only because the cleanup had just
purged them by hand, prod because the journal tables are still empty. The
migration cannot assume that holds: CI Playwright runs against the real staging
Supabase and mutates these tables between now and merge.

## Spec

- Both models declare a `Student` relation with `onDelete: Cascade` (owned
  child rows — same treatment as attendance and measurements).
- The migration is safe against a live database that already contains orphans:
  purge before constraining, or `ADD CONSTRAINT` aborts with SQLSTATE 23503.
- The migration is safe to re-run (no `ALTER TABLE ... ADD CONSTRAINT IF NOT
  EXISTS` in Postgres — guard on `pg_constraint`).
- The FK column is indexed where no existing index already leads with
  `studentId`.
- A regression guard prevents a future model from reintroducing the gap.

Non-goals: changing referential actions on any other table; backfilling or
recovering the journal rows already deleted from staging.

## Tasks

1. Add the `student` relation to both models plus the `Student` back-relations.
2. Hand-write the migration (purge → index → guarded FK add).
3. Add a schema-parsing regression test over every `studentId` column.

## Implementation

**`prisma/schema.prisma`**
- `Student`: added back-relations `journalEntries StudentJournalEntry[]` and
  `journalNotes StudentJournalNote[]`.
- `StudentJournalEntry`: added
  `student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)`.
- `StudentJournalNote`: same relation, plus `@@index([studentId])`.

The extra index applies to `StudentJournalNote` only. Cascade deletes probe by
`studentId` alone, and that table's sole covering index is
`@@index([tenantId, studentId, date])` — `tenantId`-leading, so Postgres cannot
use it for a `studentId`-only predicate. `StudentJournalEntry` needs no
equivalent: its `@@unique([studentId, indicatorId, date, scope])` is already
`studentId`-leading.

**`prisma/migrations/20260729000000_add_student_journal_student_fk/migration.sql`**

Hand-written rather than generated — `prisma migrate dev` resolves
`DATABASE_URL` to live staging in this repo, which CLAUDE.md flags as
destructive. Verified equivalent to Prisma's own output via
`prisma migrate diff --from-schema <pre> --to-schema <post> --script`, which
runs entirely offline: identical index name, constraint names, and
`ON DELETE CASCADE ON UPDATE CASCADE`. The hand-written version adds the orphan
purge and the `pg_constraint` existence guards, which `migrate diff` does not
emit.

**`prisma/__tests__/student-relation-coverage.test.ts`**

Parses `schema.prisma`, collects every model with a `studentId String` scalar,
and asserts each declares `@relation(fields: [studentId])`. The referential
action is deliberately not asserted — Cascade / SetNull / Restrict are all used
intentionally across the codebase; the invariant is that a FK exists at all.
Includes parser sanity assertions so a regex drift cannot make the suite
vacuously pass.

## Verification

Gates:
- `npm run build` — green.
- `npx vitest run` — 245 files, 2,377 passed, 42 todo, 2 skipped, 0 failed.
- Playwright: **deferred to the required CI `Playwright E2E` check.** This
  harness cannot run it locally against staging. No user-facing surface changed
  in this cycle (schema + migration + one test file), so E2E risk is confined
  to the migration applying cleanly, which the CI job exercises.
- Frontend gate: N/A — no `app/**/*.tsx`, `components/**`, or CSS diff.
- `design-system` — not applicable, no frontend change in this cycle.

Migration proven in a disposable `fk_test` schema on staging, seeded with one
valid and one orphan row per table:

| Check | Result |
|---|---|
| Orphan purge | entries 2 → 1, notes 2 → 1 |
| Both FKs created | `fks = 2` |
| Re-run whole migration body | no error, still `fks = 2` |
| `DELETE FROM "Student"` cascades | entries 1 → 0, notes 1 → 0 |
| `INSERT` with unknown `studentId` | rejected, `foreign_key_violation` |

Scratch schema dropped after the run (`DROP SCHEMA fk_test CASCADE`).

Regression test proven non-vacuous: run against the pre-fix schema it fails on
exactly `StudentJournalEntry` and `StudentJournalNote` (2 failed / 12 passed);
against the fixed schema all 14 pass.

Write-path review — no legitimate traffic regresses, since all three routes
already reject an unknown student before reaching the DB:
- `app/api/student-journal/entries/batch/route.ts` — verifies active enrollment
  in the target class, tenant-scoped via `student.tenantId`.
- `app/api/student-journal/entries/home/route.ts` — `requireGuardianForStudent`.
- `app/api/student-journal/notes/route.ts` — tenant lookup + teaching
  assignment, or `requireGuardianForStudent`.

`prisma/seed.ts` creates students before journal rows, so seeding is unaffected.

## Ship Notes

- **Migration:** `20260729000000_add_student_journal_student_fk`. Applies to
  staging then prod via the normal deploy. Deletes orphaned journal rows as a
  precondition — on prod that is currently a no-op (both tables empty); on
  staging it may remove rows CI created after this was authored.
- **Env vars:** none.
- **Rollback:** drop the two constraints and the index. The purge step is not
  reversible, so restore from backup if orphans mattered:
  ```sql
  ALTER TABLE "StudentJournalEntry" DROP CONSTRAINT "StudentJournalEntry_studentId_fkey";
  ALTER TABLE "StudentJournalNote" DROP CONSTRAINT "StudentJournalNote_studentId_fkey";
  DROP INDEX "StudentJournalNote_studentId_idx";
  ```
- **Related:** staging cleanup of the same date left a full pre-clean snapshot
  in schema `backup_20260729` (staging only), which still holds the 7,560
  journal entries this gap stranded.
