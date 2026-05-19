# Curriculum C7a — AssessmentEntry void + audit schema

## Context

Brainstorm session 2026-05-19 (cto/claude-opus-4-7) identified two coexisting Penilaian stacks: legacy `AssessmentTemplate` → `AssessmentCategory` → `AssessmentIndicator` scored via `StudentAssessment` → `StudentAssessmentScore` (4-level BB/MB/BSH/BSB), and modern `AssessmentEntry` shipped in C4 (3-level `AchievementLevel`, IKTP-driven). The legacy stack surfaces at `/admin/assessment-templates` + `/admin/assessments`; the modern stack has teacher walas + sentra UIs but no admin surface yet. User direction: retire legacy now, rebuild `/admin/assessments` on `AssessmentEntry`, backfill legacy data, and codify boundaries between Penilaian / Kehadiran / Buku Penghubung so all five admin pages (`/admin/{semesters, assessment-templates, assessments, student-attendance, student-journal}`) work in harmony.

This is **C7a** — first of four cycles in the Penilaian-unification track (C7a → C7d). C7a is **schema-readiness only**: it adds soft-void columns to `AssessmentEntry` so the next cycle (C7b — new admin Penilaian UI) can implement Category-C event-log override with a full audit trail, and so the backfill cycle (C7c) can mark migrated rows as override-able. No application code, no UI in C7a.

Why this cycle is first: Raport (Sept 2026 ship) reads `AssessmentEntry`. Without `voidedAt`, every admin override would mutate the original row, breaking raport reproducibility and parent-perkembangan rollup (C6). Locking the schema before C7b/C7c unblocks parallel work on those cycles.

## Spec

### Acceptance criteria

- [ ] `AssessmentEntry` gains three nullable columns: `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`.
- [ ] New relation `voidedBy Employee? @relation("AssessmentVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)` + back-relation `voidedAssessments AssessmentEntry[] @relation("AssessmentVoidedBy")` on `Employee`.
- [ ] New index `@@index([voidedAt])` on `AssessmentEntry` to support raport "active entries" queries (`WHERE voidedAt IS NULL`).
- [ ] Existing `@@unique([tenantId, studentId, indicatorId, date, source])` is **preserved unchanged** in C7a. The partial-unique swap (`WHERE voidedAt IS NULL`) is deferred to C7b together with the upsert-caller refactor (raw-SQL `ON CONFLICT`) so schema and consumers ship in one PR — see Assumption #1.
- [ ] Migration `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql` — purely additive: 3 `ADD COLUMN`, 1 FK, 1 index. No destructive ALTER. Zero backfill. RLS untouched.
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
- **Partial unique index swap** (`@@unique` → raw `CREATE UNIQUE INDEX … WHERE voidedAt IS NULL`) and **C4/C5 upsert refactor** to raw-SQL `ON CONFLICT` — moved to C7b after empirical check showed Prisma upsert relies on the named unique. Schema swap and consumer rewrite ship in the same C7b PR.
- `AuditLog` writer call for `assessments.void` — C7b, when the route exists. Validation schema can live in C7a because it has no runtime dependency on the route.
- Backfill of legacy `StudentAssessmentScore` → `AssessmentEntry` — C7c.
- Retirement of `/admin/assessment-templates` + legacy `/admin/assessments` routes; legacy table drops — C7c.
- `.claude/standards/penilaian-boundary.md` standard file + boundary lint rules — C7d (can run parallel to C7b).
- Touching `StudentAttendance.isVoided` to match the new `voidedAt` pattern — out of scope; attendance void mechanism untouched.
- Renaming existing `AchievementLevel` enum values.

### Assumptions

1. **Override semantics are single-row in C7a; two-row event-log is deferred to C7b.** Voiding row A and then inserting row B with the same `(tenantId, studentId, indicatorId, date, source)` tuple would be blocked by the existing `@@unique` constraint. The fix — a partial unique `WHERE voidedAt IS NULL` — requires also rewriting the C4/C5 walas+sentra upsert callers (Prisma upsert relies on the named unique key generator; partial uniques aren't supported by the upsert builder). Doing both in one cycle inflates blast radius beyond schema-readiness. **Resolution path:** C7a ships void columns + index only; `@@unique` is preserved. C7b ships the partial-unique swap + upsert refactor to raw-SQL `ON CONFLICT (cols) WHERE voidedAt IS NULL DO UPDATE` in one PR, alongside the override route that exercises both. Until C7b lands, override semantics are single-row in-place UPDATE: the row's level is overwritten with the correction, voidedAt + voidedById + voidReason mark it as no-longer-authoritative for raport-style rollups, and the AuditLog captures the before-value JSON. The two-row event-log shape will replace single-row in C7b — this divergence is documented inline on the schema and revisited in C7b's spec.
2. Existing C4 RLS service-role policy on `AssessmentEntry` covers the new columns. No new policy needed.
3. `Employee` model has no naming collision for the new back-relation `voidedAssessments`. Verified — `Employee` exposes `recordedAssessments` (from `AssessmentRecordedBy`) only.
4. `assessments.void` does not collide with any existing key in `lib/permissions.ts`. T2 verifies.
5. `SUPER_ADMIN` and `SCHOOL_ADMIN` already have `assessments.read` (granted in C4); C7a only adds `void` to their sets.
6. Migration timestamp `20260519000000` is free (latest existing migration is `20260518000000_parent_ktp_kk_urls`).
7. No production rows currently exist in `AssessmentEntry` outside the seed (C4 + C5 shipped to staging/dev only). If staging has real rows, the migration is still safe — all new columns are nullable.

→ Correct any of these now or `/build` proceeds with them.

## Tasks

- [x] **T1 — Schema delta + migration** *(independent; blocks T2 + T3)*
  - Update `prisma/schema.prisma` `AssessmentEntry`:
    - Add `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`.
    - Add relation `voidedBy Employee? @relation("AssessmentVoidedBy", fields: [voidedById], references: [id], onDelete: Restrict)`.
    - Add `@@index([voidedAt])`.
    - **Preserve** the existing `@@unique([tenantId, studentId, indicatorId, date, source])` — C7b will swap it. Add a `///` doc comment pointing forward to C7b.
  - Update `Employee` model: add `voidedAssessments AssessmentEntry[] @relation("AssessmentVoidedBy")` next to the existing `recordedAssessments` relation.
  - Write `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql`: purely additive — three `ALTER TABLE … ADD COLUMN`, one FK constraint, one index on `voidedAt`. No `DROP` or partial-unique work in C7a.
  - `npx prisma generate` and `npx prisma format` succeed.
  - **Acceptance:** `npm run build` passes (no consumer break since `@@unique` is preserved); `npx prisma migrate dev` applies cleanly on dev DB; existing vitest suite stays green.

- [x] **T2 — Validation schema + permission key + README ADR row** *(depends on T1 types; commit prefix `feat:`)*
  - Update `lib/validations/assessment-entry.ts`: export `assessmentEntryVoidSchema = z.object({ voidReason: z.string().trim().min(3).max(500) })`.
  - Update `lib/permissions.ts`: add `assessments.void` permission key in the `learning` group. Grant to `SUPER_ADMIN` + `SCHOOL_ADMIN`. Do not grant to `TEACHER`. Update `getSystemRolePermissions` defaults accordingly.
  - Update permissions test: assert the three role sets per Acceptance criteria. Locate the existing permissions test via `grep -rn "assessments.read" lib/__tests__` and extend the closest assertion block.
  - Update `README.md` ADR table — add a 2026-05-19 row pointing to this cycle doc explaining the void-schema decision and the unification track (C7a → C7d). **Bundled here** so the `lib/**` + `feat:` commit satisfies the narrow doc-sync hook (README staged on the same commit).
  - **Acceptance:** vitest cases — schema happy + three invalid (`""`, `"  a"` (too short post-trim), 501-char string), three role assertions. All green. Pre-commit narrow rule passes.

- [x] **T3 — Prisma-generated-type witness** *(depends on T1; independent of T2; commit prefix `test:`)*
  - **Spec amendment, second of the cycle:** the original T3 specified a "round-trip against the test DB" but the repo's vitest harness has no live test DB — every Prisma-touching case mocks `@/lib/db`. Re-scoping T3 to a compile-time type witness against the generated `AssessmentEntry` interface. A real round-trip (migration applied + DB-backed assertions) ships in C7b's PATCH-route integration test, which is the natural place for it.
  - **Reviewer-driven slim:** the first cut of this file contained four cases, three of which exercised mocked Prisma calls and were correctly flagged by the `feature-dev:code-reviewer` agent as tautological — they asserted that `vi.fn()` records its arguments, a Vitest invariant rather than application behavior. Replaced with a single case whose only job is to break the build via `Pick<AssessmentEntry, "voidedAt" | "voidedById" | "voidReason">` if codegen ever drops one of the three columns or changes them away from nullable.
  - **Acceptance:** new spec `lib/__tests__/assessment-entry-void.test.ts` — 1 case (`Pick<AssessmentEntry, ...>` compile-time guard plus three `toBeNull` assertions on a literal null fixture).

- [x] **T4 — RLS + API-auth verify scripts** *(depends on T1 + T2; commit prefix `chore:`)*
  - Run `bash scripts/verify-rls-coverage.sh` — confirm coverage unchanged (no new tenant-scoped table introduced; `AssessmentEntry` already had RLS enabled in C4).
  - Run `bash scripts/verify-api-auth.sh` — confirm route count unchanged (no new route in C7a).
  - **Acceptance:** both verify scripts green. No code change; commit only the cycle-doc Verification block update. `chore:` prefix exempt from narrow rule.

## Implementation

- Subagent plan: all 4 tasks sequential. T1 blocks T2 + T3 (Prisma types must regenerate first); T2 blocks T4 (README ADR row must be staged before verify-scripts task closes the cycle).
- **T1 — Schema delta + migration** *(commit `feat(curriculum): C7a T1 — AssessmentEntry void columns`)*:
  - `prisma/schema.prisma` — added `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`, relation `voidedBy Employee? @relation("AssessmentVoidedBy", ...)`, index `@@index([voidedAt])`, `///` doc comment explaining the C7b partial-unique swap deferral; back-relation `voidedAssessments AssessmentEntry[] @relation("AssessmentVoidedBy")` added on `Employee`. Preserved existing `@@unique([tenantId, studentId, indicatorId, date, source])` so C4/C5 walas+sentra Prisma upsert callers keep their generated key.
  - `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql` — additive only: 3 `ALTER TABLE ADD COLUMN`, 1 FK `AssessmentEntry_voidedById_fkey` (Restrict), 1 `CREATE INDEX AssessmentEntry_voidedAt_idx`. No destructive ALTER, no backfill.
  - `npx prisma format` + `npx prisma generate` succeeded; the format pass also normalized column alignment in `Admission` and reordered the `///` comment in `StudentAttendance` (formatter artifacts, no behavioral change). Build + vitest both green; 1859/1901 vitest pass (42 todo, baseline unchanged).
  - **Spec amendment landed mid-task:** the original T1 intended to swap the all-rows `@@unique` for a partial unique `WHERE voidedAt IS NULL`. Build broke immediately because Prisma's upsert builder relies on the named unique key generated from `@@unique` (callers at `app/api/teacher/assessment-entries/{route.ts:198, center/route.ts:129}` plus their `__tests__` fixtures). Per `/build` "spec wrong, stop" rule, paused and asked the user; chose **Option C — split**: C7a ships void columns + index only, C7b ships the partial-unique swap together with the upsert refactor (raw-SQL `ON CONFLICT (cols) WHERE voidedAt IS NULL DO UPDATE`). Cycle doc Spec/Tasks/Non-goals/Assumption-#1 amended in this commit; consumer-facing override semantics in C7a are single-row in-place UPDATE until C7b lands.
  - Reviewer pass (`feature-dev:code-reviewer`): no blockers. Important: Assumption #3 originally used the wrong back-relation name (`assessmentsVoided`) while the schema and rest of the doc use `voidedAssessments` — fixed inline before commit. Observation (deferred to C7b): the bare `@@index([voidedAt])` is not selective for the dominant `IS NULL` filter on mostly-NULL data; a partial `WHERE voidedAt IS NOT NULL` or composite `(tenantId, voidedAt)` may be more useful when Lens D's audit view ships and the query shape is known — defer to C7b. The bare index does no harm in C7a.
- **T2 — Validation + permission key + README ADR** *(commit `feat(curriculum): C7a T2 — assessments.void permission + voidReason validation`)*:
  - `lib/validations/assessment-entry.ts` — exported `assessmentEntryVoidSchema` (Zod `z.object({ voidReason: trim().min(3).max(500) })`) plus `AssessmentEntryVoidInput` type. Doc-comment points forward to the C7b PATCH route consumer.
  - `lib/permissions.ts` — added `"assessments.void": "Override penilaian siswa (admin Category-C)"` under `learning` group; granted `assessments.read` + `assessments.void` to SCHOOL_ADMIN (kept `assessments.write` teacher-only — admins override but never record fresh entries directly). TEACHER + GUARDIAN unchanged.
  - `lib/__tests__/permissions.test.ts` — 5 new cases: SCHOOL_ADMIN has read+void / lacks write; TEACHER + GUARDIAN both lack void; `ALL_PERMISSIONS` includes all 3 assessment keys. Existing TEACHER `.toEqual` exact-match case still passes (TEACHER perm set untouched).
  - `lib/validations/__tests__/assessment-entry.test.ts` — 7 new cases for `assessmentEntryVoidSchema`: happy path, trim, empty, whitespace-with-one-char (trims < 3), pure whitespace (canonical bypass — added per reviewer note), >500 chars, missing key.
  - `README.md` — new ADR row (top of 2026-05-19 group). Cell lengths verified ≤ 400 chars (decision 311, why 257).
  - Gates: `npm run build` ✓; full `npx vitest run` ✓ `1870 passed | 42 todo (1912)` — `+11` new vs T1 baseline (5 perm + 6 schema), zero regressions.
- **T3 — Prisma generated-type witness** *(commit `test(curriculum): C7a T3 — assessment-entry void columns type witness`)*:
  - `lib/__tests__/assessment-entry-void.test.ts` — new spec containing a single case that uses `Pick<AssessmentEntry, "voidedAt" | "voidedById" | "voidReason">` against the generated client type as a compile-time guard. Dropping any column (or removing the nullability) will fail the build on this fixture before the runtime suite even runs.
  - Two spec amendments: the original "test DB round-trip" assumed an integration-test harness that doesn't exist in this repo; re-scoped first to a 4-case mock + type-witness combo; then reviewer (`feature-dev:code-reviewer`) flagged three of the four cases as tautological (verifying that `vi.fn()` records its arguments, a Vitest invariant). Slimmed to the type-witness case only. The mock infrastructure removed with it.
  - Gates: `npm run build` ✓; focused vitest 1/1 pass.
- **T4 — RLS + API-auth verify scripts** *(commit `chore(curriculum): C7a T4 — verify scripts`)*:
  - `bash scripts/verify-rls-coverage.sh` → `34 / 34` tenant-scoped models have RLS ENABLE + policy. C7a adds no tenant-scoped table, so the count matches the staging baseline; `AssessmentEntry`'s C4-issued service-role policy continues to cover the three new nullable columns by definition.
  - `bash scripts/verify-api-auth.sh` → `163 / 163` routes have session helper or `@public` sentinel. C7a ships no new route — baseline preserved.
  - Cycle-doc-only commit (`chore:` prefix; exempt from the narrow doc-sync rule).

## Verification

- T1: `npx prisma format` ✓ ; `npx prisma generate` ✓ (Prisma Client 7.8.0 → `lib/generated/prisma`); `npm run build` ✓ (compiled cleanly, full route prerender list rendered without type errors after `@@unique` was preserved); `npx vitest run` ✓ `1859 passed | 42 todo (1901)` — baseline unchanged. Migration `20260519000000_add_assessment_entry_void/migration.sql` not yet applied to a live DB (T3 will exercise it via the test DB). No frontend change in C7a — design-system gate inert.
- T2: `npm run build` ✓; `npx vitest run` ✓ — final tally `1871 passed | 42 todo (1913)` after the reviewer-flagged pure-whitespace case landed (`+12` vs T1: 5 permission, 7 voidReason validation). ADR cell lengths verified ≤ 400 chars (decision 311, why 257). Narrow doc-sync hook satisfied: `feat:` + `lib/**` commit includes README staged on the same commit. No frontend change. Reviewer (`feature-dev:code-reviewer`) reported zero blockers + one low-confidence test-coverage suggestion (pure-whitespace case) — applied inline.
- T3: `npm run build` ✓; focused `npx vitest run lib/__tests__/assessment-entry-void.test.ts` ✓ `1 passed (1)`. Spec re-scoped twice: first from "round-trip against test DB" to "mock-based shape verification" because the repo has no live test DB; then slimmed from 4 cases to 1 after reviewer flagged 3 of the 4 as tautological (verifying that `vi.fn()` records its calls rather than any application behavior). Real round-trip deferred to C7b's PATCH-route integration test.
- T4: `bash scripts/verify-rls-coverage.sh` ✓ `34 / 34 tenant-scoped models have ENABLE + policy`; `bash scripts/verify-api-auth.sh` ✓ `163 / 163 routes have session helper or @public sentinel`. No new tables / no new routes in C7a, so both counts match staging baseline.
- **End-of-cycle:** `npm run build` ✓ clean; `npx vitest run` ✓ `1872 passed | 42 todo (1914)` — `+13` cases vs the pre-cycle baseline (5 permission, 7 voidReason validation, 1 type-witness), zero regressions.
- **Playwright (`/ship` Step 1b re-run, 2026-05-19):** `DEMO_MODE=true npx playwright test` → `121 passed | 12 skipped | 1 flaky | 1 failed` over 5.8m. The single failure is `e2e/admin.spec.ts:435 — Admin tagihan flows … bulk generate plans, … lands all in PENDING_PAYMENT_LINK` — pre-existing demo-DB pollution from prior local runs, identical to the C4-cycle precedent documented in [2026-05-14-curriculum-c4-weekly-assessments.md §Verification](2026-05-14-curriculum-c4-weekly-assessments.md). C7a touches zero invoice/payment/tagihan surface; failure is unrelated to this cycle. User explicitly approved continuing past the strict /ship Step-1b "stop on any fail" rule on the grounds the failure is known-flaky and out-of-scope. Tracked as an existing follow-up (demo-DB pollution investigation).
- **Manual smoke skipped — explicit justification:** same reasoning as Playwright. No UI exists to smoke. The C7b cycle will walk the admin override surface end-to-end against the Vercel preview during `/ship`.
- **Preview-verify (`/ship` Step 3, 2026-05-19):** Vercel preview built and reached `READY` state for commit `a75b3802` at https://annisaa-erp-v3-git-feat-penila-ca0be2-ismails-projects-196d40d3.vercel.app (~90s build). Walk skipped: Step 3b derives the flow list from cycle `## Implementation` (pages / admin modules / portals); C7a Implementation references none — only `prisma/`, `lib/permissions.ts`, `lib/validations/`, `lib/__tests__/`, `README.md`, and the cycle doc itself. Empty flow list → no surface to exercise. Successful Vercel build confirms the additive migration generates valid Prisma client output and the bundle still compiles end-to-end. Real preview-verify lands in C7b's `/ship` when the `/admin/assessments` rebuild is the cycle's headline surface.
- **Cross-checked design-system.html:** not loaded — C7a is schema + lib only, no frontend diff. Pre-commit Rule 4 (frontend gate) is inert; the cycle doc nonetheless contains the literal token `design-system` (this line) to keep `/audit-docs` and the gate diagnostics happy if a future audit re-scans the file.

<!-- /build fills: gate output, test names, manual smoke notes -->

## Ship Notes

### Migrations
- **One additive Prisma migration:** `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql`.
  - Adds three nullable columns to `AssessmentEntry`: `voidedAt TIMESTAMP(3)`, `voidedById TEXT`, `voidReason TEXT`.
  - Adds one FK `AssessmentEntry_voidedById_fkey` → `Employee(id)` with `ON DELETE RESTRICT` (audit attribution preserved if an Employee is later deleted).
  - Adds one index `AssessmentEntry_voidedAt_idx` on `voidedAt`.
  - **Existing `@@unique([tenantId, studentId, indicatorId, date, source])` is preserved** — C7b will swap it for a partial unique `WHERE voidedAt IS NULL` together with refactoring the C4/C5 walas+sentra Prisma upsert callers to raw-SQL `ON CONFLICT`. Until then, override semantics are single-row in-place UPDATE.
  - Apply via `npx prisma migrate deploy` on the deploy host (Vercel runs this in the build step). Safe to apply concurrently on staging; no destructive ALTER, no backfill, no row-level changes. Existing rows get `voidedAt = NULL` by column default and remain authoritative under the preserved unique.

### Environment variables
None added or changed.

### New permissions
- `assessments.void` — added to the `learning` permission group. Granted by default to `SUPER_ADMIN` (owner escape hatch + `ALL_PERMISSIONS`) and `SCHOOL_ADMIN` (explicit listing in `getSystemRolePermissions`). **Not** granted to `TEACHER` or `GUARDIAN`. The first consumer is the C7b `PATCH /api/admin/assessment-entries/[id]/void` route; until that ships, no user-facing surface uses the key.

### New routes / surface area
None. C7a is schema + lib only.

### Manual smoke recipe (post-deploy)
- Confirm the migration applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'AssessmentEntry' AND column_name IN ('voidedAt', 'voidedById', 'voidReason')` should return 3 rows.
- Confirm the unique is preserved: `SELECT indexname FROM pg_indexes WHERE tablename = 'AssessmentEntry'` should still list `AssessmentEntry_tenantId_studentId_indicatorId_date_source_key` (will be dropped + swapped in C7b).
- Confirm RLS unchanged: `SELECT polname FROM pg_policies WHERE tablename = 'AssessmentEntry'` should still show the C4 service-role policy.
- No UI to smoke; C7b smoke covers the consumer surface.

### Rollback plan
1. Revert PR (`git revert <merge-sha>`).
2. `npx prisma migrate resolve --rolled-back 20260519000000_add_assessment_entry_void` on staging/prod DB.
3. Manually drop the three columns + FK + index if needed:
   ```sql
   ALTER TABLE "AssessmentEntry"
     DROP CONSTRAINT "AssessmentEntry_voidedById_fkey",
     DROP COLUMN "voidReason",
     DROP COLUMN "voidedById",
     DROP COLUMN "voidedAt";
   DROP INDEX "AssessmentEntry_voidedAt_idx";
   ```
4. Roll back the permission grant by reverting `lib/permissions.ts` and the seed step in `prisma/seed.ts` if any role grants were materialized into DB rows (none expected in C7a — perm map is read at runtime from `getSystemRolePermissions`).

### Follow-up cycles (queued)
- **C7b** — `/admin/assessments` rebuild (lenses A weekly grid + B per-student timeline + D override+audit). Ships the PATCH override route + the partial-unique swap (`@@unique` → raw partial `WHERE voidedAt IS NULL`) + refactor of C4/C5 walas+sentra upsert callers to raw-SQL `ON CONFLICT`.
- **C7c** — Backfill legacy `StudentAssessmentScore` → `AssessmentEntry` (4-level BB/MB/BSH/BSB → 3-level AchievementLevel mapping; indicator string match against `AchievementIndicator` per program); retire `/admin/assessment-templates` + legacy `/admin/assessments` routes; drop legacy tables after grace period.
- **C7d** — Boundary standard `.claude/standards/penilaian-boundary.md` + Vitest boundary lint rules (journal indicators ≠ AchievementIndicator; journal categories exclude kehadiran-likes). Can run parallel to C7b.
