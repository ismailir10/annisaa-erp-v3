# Curriculum C7a — AssessmentEntry void + audit schema

## Context

Brainstorm session 2026-05-19 (cto/claude-opus-4-7) identified two coexisting Penilaian stacks: legacy `AssessmentTemplate` → `AssessmentCategory` → `AssessmentIndicator` scored via `StudentAssessment` → `StudentAssessmentScore` (4-level BB/MB/BSH/BSB), and modern `AssessmentEntry` shipped in C4 (3-level `AchievementLevel`, IKTP-driven). The legacy stack surfaces at `/admin/assessment-templates` + `/admin/assessments`; the modern stack has teacher walas + sentra UIs but no admin surface yet. User direction: retire legacy now, rebuild `/admin/assessments` on `AssessmentEntry`, backfill legacy data, and codify boundaries between Penilaian / Kehadiran / Buku Penghubung so all five admin pages (`/admin/{semesters, assessment-templates, assessments, student-attendance, student-journal}`) work in harmony.

This is **C7a** — first of four cycles in the Penilaian-unification track (C7a → C7d). C7a is **schema-readiness only**: it adds soft-void columns to `AssessmentEntry` so the next cycle (C7b — new admin Penilaian UI) can implement Category-C event-log override with a full audit trail, and so the backfill cycle (C7c) can mark migrated rows as override-able. No application code, no UI in C7a.

Why this cycle is first: Raport (Sept 2026 ship) reads `AssessmentEntry`. Without `voidedAt`, every admin override would mutate the original row, breaking raport reproducibility and parent-perkembangan rollup (C6). Locking the schema before C7b/C7c unblocks parallel work on those cycles.

## Spec

### Acceptance criteria

- [ ] `AssessmentEntry` gains three nullable columns: `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`.
- [ ] New relation `voidedBy Employee? @relation("AssessmentVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)` + back-relation `assessmentsVoided AssessmentEntry[] @relation("AssessmentVoidedBy")` on `Employee`.
- [ ] New index `@@index([voidedAt])` on `AssessmentEntry` to support raport "active entries" queries (`WHERE voidedAt IS NULL`).
- [ ] Existing unique `@@unique([tenantId, studentId, indicatorId, date, source])` survives or is replaced by a partial unique `WHERE voidedAt IS NULL` (decision made in T1 after empirical check — see Assumption #1).
- [ ] Migration `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql` — additive only (no destructive ALTER beyond the unique-index swap if needed), zero backfill, RLS untouched.
- [ ] `npx prisma generate` regenerates types; `AssessmentEntry` type exposes `voidedAt`, `voidedById`, `voidReason`, `voidedBy`.
- [ ] `lib/validations/assessment-entry.ts` exports `assessmentEntryVoidSchema` (Zod) for the C7b PATCH route. Enforces `voidReason: z.string().trim().min(3).max(500)`.
- [ ] `lib/permissions.ts` gains `assessments.void` permission key under the `learning` group. Granted to `SUPER_ADMIN` + `SCHOOL_ADMIN`. **Not** granted to `TEACHER`.
- [ ] Permission test updated: `SUPER_ADMIN` + `SCHOOL_ADMIN` sets include `assessments.void`; `TEACHER` set excludes it.
- [ ] `bash scripts/verify-rls-coverage.sh` passes (32/32; no new table).
- [ ] Vitest cases (~6): validation schema happy + 3 invalid (too short, too long, missing); permission assertions (3 roles); migration round-trip (write entry → set void → read back).
- [ ] `npm run build && npx vitest run && npx playwright test` all green at end of cycle. No new Playwright spec — schema-only cycle.
- [ ] README ADR table updated with one row for C7a.

### Non-goals

- `PATCH /api/admin/assessment-entries/[id]/void` route — ships C7b.
- Admin UI for override + audit view (lens A weekly grid, lens B per-student timeline, lens D override+audit) — C7b.
- `AuditLog` writer call for `assessments.void` — C7b, when the route exists. Validation schema can live in C7a because it has no runtime dependency on the route.
- Backfill of legacy `StudentAssessmentScore` → `AssessmentEntry` — C7c.
- Retirement of `/admin/assessment-templates` + legacy `/admin/assessments` routes; legacy table drops — C7c.
- `.claude/standards/penilaian-boundary.md` standard file + boundary lint rules — C7d (can run parallel to C7b).
- Touching `StudentAttendance.isVoided` to match the new `voidedAt` pattern — out of scope; attendance void mechanism untouched.
- Renaming existing `AchievementLevel` enum values.

### Assumptions

1. Voiding row A and then inserting row B with the same `(tenantId, studentId, indicatorId, date, source)` tuple will be blocked by the existing `@@unique` constraint. Adding `voidedAt` to the unique tuple is **not** a fix — Postgres treats NULLs as distinct, so two active rows (`voidedAt = NULL`) would both be permitted, breaking the "exactly one active row per key" invariant we want. **Resolution path:** drop the named unique and declare a partial unique in raw SQL: `CREATE UNIQUE INDEX "AssessmentEntry_active_key" ON "AssessmentEntry" (tenantId, studentId, indicatorId, date, source) WHERE "voidedAt" IS NULL`. Same pattern as `StudentAttendance_studentId_date_legacy_key` in migration `20260515000000`. Prisma cannot express partial uniques, so the constraint lives in raw SQL with a `///` schema comment pointing to it. T1 verifies the assumption empirically before committing the migration.
2. Existing C4 RLS service-role policy on `AssessmentEntry` covers the new columns. No new policy needed.
3. `Employee` model has no naming collision for the new back-relation `assessmentsVoided`. Verified — `Employee` exposes `recordedAssessments` (from `AssessmentRecordedBy`) only.
4. `assessments.void` does not collide with any existing key in `lib/permissions.ts`. T2 verifies.
5. `SUPER_ADMIN` and `SCHOOL_ADMIN` already have `assessments.read` (granted in C4); C7a only adds `void` to their sets.
6. Migration timestamp `20260519000000` is free (latest existing migration is `20260518000000_parent_ktp_kk_urls`).
7. No production rows currently exist in `AssessmentEntry` outside the seed (C4 + C5 shipped to staging/dev only). If staging has real rows, the migration is still safe — all new columns are nullable.

→ Correct any of these now or `/build` proceeds with them.

## Tasks

- [ ] **T1 — Schema delta + migration** *(independent; blocks T2 + T3)*
  - Empirical check first: with current schema, write a row `A`, set `voidedAt`, attempt to write row `B` with the same `(tenantId, studentId, indicatorId, date, source)` tuple. Document outcome.
  - Update `prisma/schema.prisma` `AssessmentEntry`:
    - Add `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`.
    - Add relation `voidedBy Employee? @relation("AssessmentVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)`.
    - Add `@@index([voidedAt])`.
    - If the empirical check failed: remove the named `@@unique([tenantId, studentId, indicatorId, date, source])` and add a comment pointing to the raw partial unique declared in migration SQL.
  - Update `Employee` model: add `assessmentsVoided AssessmentEntry[] @relation("AssessmentVoidedBy")`.
  - Write `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql`: hand-written DDL — three `ALTER TABLE … ADD COLUMN`, one FK constraint, one index on `voidedAt`, plus (conditional on the empirical check) `DROP CONSTRAINT` + `CREATE UNIQUE INDEX … WHERE "voidedAt" IS NULL`.
  - `npx prisma generate` and `npx prisma format` succeed.
  - **Acceptance:** `npx prisma migrate dev` applies cleanly on dev DB; `npm run build` passes; existing vitest suite stays green.

- [ ] **T2 — Validation schema + permission key + README ADR row** *(depends on T1 types; commit prefix `feat:`)*
  - Update `lib/validations/assessment-entry.ts`: export `assessmentEntryVoidSchema = z.object({ voidReason: z.string().trim().min(3).max(500) })`.
  - Update `lib/permissions.ts`: add `assessments.void` permission key in the `learning` group. Grant to `SUPER_ADMIN` + `SCHOOL_ADMIN`. Do not grant to `TEACHER`. Update `getSystemRolePermissions` defaults accordingly.
  - Update permissions test: assert the three role sets per Acceptance criteria. Locate the existing permissions test via `grep -rn "assessments.read" lib/__tests__` and extend the closest assertion block.
  - Update `README.md` ADR table — add a 2026-05-19 row pointing to this cycle doc explaining the void-schema decision and the unification track (C7a → C7d). **Bundled here** so the `lib/**` + `feat:` commit satisfies the narrow doc-sync hook (README staged on the same commit).
  - **Acceptance:** vitest cases — schema happy + three invalid (`""`, `"  a"` (too short post-trim), 501-char string), three role assertions. All green. Pre-commit narrow rule passes.

- [ ] **T3 — Migration round-trip vitest** *(depends on T1; independent of T2; commit prefix `test:`)*
  - New vitest spec `lib/__tests__/assessment-entry-void.test.ts` (or extend existing `assessment-entry.test.ts`): use the test DB to write an entry, update with `voidedAt` + `voidedById` + `voidReason`, read back via Prisma. Assert: voided entries appear in unfiltered queries; `WHERE voidedAt IS NULL` excludes them. If the partial-unique path (Assumption #1) was taken, also assert: voiding row A then inserting row B with the same unique key succeeds.
  - **Acceptance:** 1–2 test cases pass against the test DB. `test:` prefix is exempt from the narrow doc-sync rule (broad rule still satisfied by staged cycle doc).

- [ ] **T4 — RLS + API-auth verify scripts** *(depends on T1 + T2; commit prefix `chore:`)*
  - Run `bash scripts/verify-rls-coverage.sh` — confirm 32/32 (no new table).
  - Run `bash scripts/verify-api-auth.sh` — confirm count unchanged (no new route).
  - **Acceptance:** both verify scripts green. No code change; commit only the cycle-doc Verification block update. `chore:` prefix exempt from narrow rule.

## Implementation

<!-- /build fills per-task: files touched + one-line summary -->

## Verification

<!-- /build fills: gate output, test names, manual smoke notes -->

## Ship Notes

<!-- /ship fills: migrations, env vars, manual steps, rollback plan -->
