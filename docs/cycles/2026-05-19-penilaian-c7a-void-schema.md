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

- [ ] **T2 — Validation schema + permission key + README ADR row** *(depends on T1 types; commit prefix `feat:`)*
  - Update `lib/validations/assessment-entry.ts`: export `assessmentEntryVoidSchema = z.object({ voidReason: z.string().trim().min(3).max(500) })`.
  - Update `lib/permissions.ts`: add `assessments.void` permission key in the `learning` group. Grant to `SUPER_ADMIN` + `SCHOOL_ADMIN`. Do not grant to `TEACHER`. Update `getSystemRolePermissions` defaults accordingly.
  - Update permissions test: assert the three role sets per Acceptance criteria. Locate the existing permissions test via `grep -rn "assessments.read" lib/__tests__` and extend the closest assertion block.
  - Update `README.md` ADR table — add a 2026-05-19 row pointing to this cycle doc explaining the void-schema decision and the unification track (C7a → C7d). **Bundled here** so the `lib/**` + `feat:` commit satisfies the narrow doc-sync hook (README staged on the same commit).
  - **Acceptance:** vitest cases — schema happy + three invalid (`""`, `"  a"` (too short post-trim), 501-char string), three role assertions. All green. Pre-commit narrow rule passes.

- [ ] **T3 — Migration round-trip vitest** *(depends on T1; independent of T2; commit prefix `test:`)*
  - New vitest spec or extension of an existing `assessment-entry` test: use the test DB to write an entry, update with `voidedAt` + `voidedById` + `voidReason`, read back via Prisma. Assert: (a) the voided entry still appears in unfiltered queries; (b) a `WHERE voidedAt IS NULL` filter excludes it; (c) the `voidedBy` relation hydrates the Employee row.
  - **Acceptance:** 1–2 test cases pass against the test DB. `test:` prefix is exempt from the narrow doc-sync rule (broad rule still satisfied by staged cycle doc).

- [ ] **T4 — RLS + API-auth verify scripts** *(depends on T1 + T2; commit prefix `chore:`)*
  - Run `bash scripts/verify-rls-coverage.sh` — confirm 32/32 (no new table).
  - Run `bash scripts/verify-api-auth.sh` — confirm count unchanged (no new route).
  - **Acceptance:** both verify scripts green. No code change; commit only the cycle-doc Verification block update. `chore:` prefix exempt from narrow rule.

## Implementation

- Subagent plan: all 4 tasks sequential. T1 blocks T2 + T3 (Prisma types must regenerate first); T2 blocks T4 (README ADR row must be staged before verify-scripts task closes the cycle).
- **T1 — Schema delta + migration** *(commit `feat(curriculum): C7a T1 — AssessmentEntry void columns`)*:
  - `prisma/schema.prisma` — added `voidedAt DateTime?`, `voidedById String?`, `voidReason String?`, relation `voidedBy Employee? @relation("AssessmentVoidedBy", ...)`, index `@@index([voidedAt])`, `///` doc comment explaining the C7b partial-unique swap deferral; back-relation `voidedAssessments AssessmentEntry[] @relation("AssessmentVoidedBy")` added on `Employee`. Preserved existing `@@unique([tenantId, studentId, indicatorId, date, source])` so C4/C5 walas+sentra Prisma upsert callers keep their generated key.
  - `prisma/migrations/20260519000000_add_assessment_entry_void/migration.sql` — additive only: 3 `ALTER TABLE ADD COLUMN`, 1 FK `AssessmentEntry_voidedById_fkey` (Restrict), 1 `CREATE INDEX AssessmentEntry_voidedAt_idx`. No destructive ALTER, no backfill.
  - `npx prisma format` + `npx prisma generate` succeeded; the format pass also normalized column alignment in `Admission` and reordered the `///` comment in `StudentAttendance` (formatter artifacts, no behavioral change). Build + vitest both green; 1859/1901 vitest pass (42 todo, baseline unchanged).
  - **Spec amendment landed mid-task:** the original T1 intended to swap the all-rows `@@unique` for a partial unique `WHERE voidedAt IS NULL`. Build broke immediately because Prisma's upsert builder relies on the named unique key generated from `@@unique` (callers at `app/api/teacher/assessment-entries/{route.ts:198, center/route.ts:129}` plus their `__tests__` fixtures). Per `/build` "spec wrong, stop" rule, paused and asked the user; chose **Option C — split**: C7a ships void columns + index only, C7b ships the partial-unique swap together with the upsert refactor (raw-SQL `ON CONFLICT (cols) WHERE voidedAt IS NULL DO UPDATE`). Cycle doc Spec/Tasks/Non-goals/Assumption-#1 amended in this commit; consumer-facing override semantics in C7a are single-row in-place UPDATE until C7b lands.
  - Reviewer pass (`feature-dev:code-reviewer`): no blockers. Important: Assumption #3 originally used the wrong back-relation name (`assessmentsVoided`) while the schema and rest of the doc use `voidedAssessments` — fixed inline before commit. Observation (deferred to C7b): the bare `@@index([voidedAt])` is not selective for the dominant `IS NULL` filter on mostly-NULL data; a partial `WHERE voidedAt IS NOT NULL` or composite `(tenantId, voidedAt)` may be more useful when Lens D's audit view ships and the query shape is known — defer to C7b. The bare index does no harm in C7a.

<!-- /build fills per-task: files touched + one-line summary -->

## Verification

- T1: `npx prisma format` ✓ ; `npx prisma generate` ✓ (Prisma Client 7.8.0 → `lib/generated/prisma`); `npm run build` ✓ (compiled cleanly, full route prerender list rendered without type errors after `@@unique` was preserved); `npx vitest run` ✓ `1859 passed | 42 todo (1901)` — baseline unchanged. Migration `20260519000000_add_assessment_entry_void/migration.sql` not yet applied to a live DB (T3 will exercise it via the test DB). No frontend change in C7a — design-system gate inert.

<!-- /build fills: gate output, test names, manual smoke notes -->

## Ship Notes

<!-- /ship fills: migrations, env vars, manual steps, rollback plan -->
