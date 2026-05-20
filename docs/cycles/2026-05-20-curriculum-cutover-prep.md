# Curriculum Cutover Prep — ClassSection ageGroup + Tenant Isolation + PROMES Re-Import

> **Branch:** `feat/curriculum-cutover-prep` (off `origin/staging`).
> **Cycle 1 of 3** spawned from the 2026-05-20 cross-module audit (see audit synthesis in this session). Companions: `feat/security-hardening`, `feat/finance-audit-trail`.

---

## Context

Five parallel module audits (security, perf, UX, curriculum, finance) ran on 2026-05-20 against the staging tip. Tier-1 findings that touch the **July 2026 unified-Penilaian + 3-level skala + narrative-Raport cutover** cluster around three structural gaps in the curriculum pipeline:

1. **`deriveAgeGroup` name-heuristic is the sole ageGroup gate across three surfaces.** [lib/curriculum/weekly-assessment-loader.ts:23-28](../../lib/curriculum/weekly-assessment-loader.ts:23) splits `ClassSection.name` on whitespace and returns the last token if it equals `A` or `B`, else `null`. Consumers:
   - [lib/curriculum/weekly-assessment-loader.ts:113,145](../../lib/curriculum/weekly-assessment-loader.ts:113) — walas weekly indicator picker.
   - [app/api/teacher/assessment-entries/center/[center]/route.ts:96](../../app/api/teacher/assessment-entries/center/%5Bcenter%5D/route.ts:96) — sentra roster cohort.
   - [lib/curriculum/perkembangan-loader.ts:143](../../lib/curriculum/perkembangan-loader.ts:143) — parent perkembangan rollup `latestThisWeek`.
   When a class is named `KB Aster`, `TKIT Alam`, `Kelas 1B`, or anything that doesn't end with a bare `A`/`B` token, the function returns `null`. Walas weekly silently presents zero indicators. Sentra path silently excludes the entire cohort. Perkembangan rollup may drop entries. The bug compounds **after** any tenant renames a class — there's no error surface, just empty assessments. The original C4 cycle (2026-05-14) flagged the schema column as a follow-up; six days later it's still outstanding.

2. **Cross-tenant read leak on the legacy assessment page** ([app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx:70-76](../../app/teacher/assessments/%5BclassSectionId%5D/%5BtemplateId%5D/%5Bperiod%5D/page.tsx:70)). The `TeachingAssignment.findFirst` predicate scopes by `employeeId + classSectionId + classSection.status='ACTIVE'` but does **not** require `classSection.tenantId = session.tenantId`. Reads from `Student` later in the same page (line 99-109) ARE tenant-scoped, and the write API at [app/api/assessments/student/[id]/route.ts:42-91](../../app/api/assessments/student/%5Bid%5D/route.ts:42) is properly scoped — so write exploitation is blocked. But page-layer auth is shallower than API-layer auth, and the same bug class (forgetting `tenantId` on a junction-traversal predicate) has caused three production-blocking RLS regressions in six weeks (EmailLog 2026-04-24, ClassTrack+ClassSession 2026-05-17). Defense-in-depth requires the scope.

3. **Legacy `StudentAssessment` (4-level BB/MB/BSH/BSB) coexists with new `AssessmentEntry` (3-level CONSISTENT/EMERGING/NEEDS_REINFORCEMENT)** with no backfill or abandonment decision recorded. The `/parent/reports` page still reads the legacy stack through cutover. If any tenant has live 2025/2026 raport data in `StudentAssessment` that needs to appear in the new perkembangan view post-July, it will not without a mapping. This is a CTO-level decision that gates the cutover scope, not a code change.

A fourth item — **PROMES re-import 409s on INACTIVE indicator conflicts** with no skip-or-reactivate flag ([app/api/admin/curriculum/import-promes/route.ts:303-325](../../app/api/admin/curriculum/import-promes/route.ts:303)) — breaks the standard correction workflow (import → C3 IKTP soft-delete → re-import) on its second iteration. Low-frequency footgun, but admin has no recovery path short of SQL.

The audit also flagged `revalidateTag(tag, { expire: 0 })` as undocumented. False positive — verified against `node_modules/next/dist/server/web/spec-extension/revalidate.d.ts`, the signature in Next.js 16.2.6 is `revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined` where `CacheLifeConfig = { expire?: number }`. All ~20 callsites are using the public API correctly. Removed from cycle scope.

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** `ClassSection` schema has a non-nullable `ageGroup` column typed as Prisma enum `AgeGroup` (`A` | `B`). Zod validators on POST/PUT class-sections enforce the enum.
- [ ] **AC2.** Existing `ClassSection` rows are backfilled at migration time using the legacy name-heuristic (`SELECT split_part(name, ' ', -1)`), with a migration-level fail-loud assertion if any row resolves to NULL.
- [ ] **AC3.** Admin ClassSection create + edit forms expose an `Kelompok Usia (A/B)` select. Field is required.
- [ ] **AC4.** `deriveAgeGroup` helper deleted from [lib/curriculum/weekly-assessment-loader.ts](../../lib/curriculum/weekly-assessment-loader.ts). All three consumers read `classSection.ageGroup` directly. Type narrows from `"A" | "B" | null` to `"A" | "B"`.
- [ ] **AC5.** Legacy assessment page `TeachingAssignment.findFirst` filter at [app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx:70-76](../../app/teacher/assessments/%5BclassSectionId%5D/%5BtemplateId%5D/%5Bperiod%5D/page.tsx:70) gains `classSection: { tenantId: session.tenantId, status: "ACTIVE" }`. Vitest covers cross-tenant 404 (or redirect to /teacher) for a forged URL.
- [ ] **AC6.** PROMES import preview ([app/api/admin/curriculum/import-promes/route.ts:303-325](../../app/api/admin/curriculum/import-promes/route.ts:303)) groups conflicts into `active` (block) and `inactive` (skip-or-reactivate). Commit branch accepts `?conflictPolicy=skip|reactivate|block` (default `block` preserves current behaviour). UI exposes a "Skip & reactivate" button on the preview when the conflict bucket is non-empty.
- [ ] **AC7.** **Decision recorded** in the cycle doc on legacy `StudentAssessment` data: either (a) `MIGRATE` with a documented mapping (`BSH/BSB→CONSISTENT`, `MB→EMERGING`, `BB→NEEDS_REINFORCEMENT`) + backfill script written but not run until July, (b) `ABANDON` — `/parent/reports` legacy path scheduled for deletion at cutover with no carry-over data, or (c) `KEEP-LEGACY-READ-ONLY` — legacy data stays readable through 2026/2027 AY but no new writes to the old stack. Decision documented in this cycle doc Ship Notes.
- [ ] **AC8.** No regressions: `npm run build && npx vitest run && npx playwright test` all green at end-of-cycle.
- [ ] **AC9.** README.md ADR row: "ClassSection.ageGroup column + tenant-isolated assessment page + PROMES re-import status awareness" (≤ 400 chars).

### Spec Assumptions

1. **`AgeGroup` Prisma enum already exists** for `LearningObjective`. The migration reuses the same enum, not a new one. Confirm via `grep "enum AgeGroup" prisma/schema.prisma` in Task 1.
2. **All current staging + production `ClassSection.name` rows resolve to A or B.** The 2026-05-16 staging sweep + 2026-05-13 sweep both manually verified the seed convention. The migration-level assertion catches any tenant whose live data violates this, surfacing the offender names for manual SQL fix BEFORE the column is set NOT NULL. Two-phase migration: (a) add nullable column + backfill + assertion, (b) `SET NOT NULL` only if assertion passed. This avoids a migrate-deploy failure half-way through the transaction.
3. **PROMES conflict-policy default stays `block`.** Existing callers see no behavioural change. Skip + reactivate are opt-in via UI button or query param. Avoids retroactively changing import semantics.
4. **Cross-tenant page-layer fix is purely defensive.** The API write path is already tenant-scoped; the page leak surfaces read-only template metadata + student list. Severity is HIGH not CRITICAL — but the bug class has recurred 3× in 6 weeks and an explicit gate test pins the contract.
5. **AC7 backfill decision is OPEN** at spec time. CTO call required before Task 7 closes. If decision is `MIGRATE`, the backfill script is written but **gated behind a feature flag** so it can be rehearsed against staging without firing in production.

### Non-goals

- Other ageGroup heuristics — none found outside `deriveAgeGroup`.
- Broader assessment schema unification — Pack 1/2/3 design tracked separately in curriculum cycle docs.
- Indicator-theme-link RLS (Curriculum GAP-4 from audit) — covered in `feat/security-hardening`.
- `revalidateTag` second-arg cleanup — audit false positive, not in scope.
- PROMES bulk-delete or wipe-and-replace flow — separate UX cycle.
- Removing the legacy `/parent/reports` code path — depends on AC7 decision.
- Updating existing ClassSection rows on production through application code (handled by migration only).
- Auditing teacher-portal route tree for other page-layer scope gaps — separate security cycle.

---

## Tasks

> Order optimized so `/build` can dispatch independent subagents on T1+T4+T5 in parallel. T2 depends on T1 (schema must land first). T3 is independent. T6 is end-of-cycle gate. T7 documents the AC7 decision and gates `/ship`.

- [ ] **T1 — Add `ClassSection.ageGroup` column + two-phase migration.**
  Acceptance:
  1. `prisma/schema.prisma` `ClassSection` model adds `ageGroup AgeGroup` field (NOT NULL, no default — but migration-managed two-phase).
  2. New migration `20260520000000_classsection_age_group/migration.sql` runs:
     - `ALTER TABLE "ClassSection" ADD COLUMN "ageGroup" "AgeGroup";` (nullable)
     - `UPDATE "ClassSection" SET "ageGroup" = CASE upper(split_part(name, ' ', -1)) WHEN 'A' THEN 'A'::"AgeGroup" WHEN 'B' THEN 'B'::"AgeGroup" ELSE NULL END;`
     - `DO $$ BEGIN IF EXISTS (SELECT 1 FROM "ClassSection" WHERE "ageGroup" IS NULL) THEN RAISE EXCEPTION 'ClassSection ageGroup backfill incomplete: %', (SELECT array_agg(name) FROM "ClassSection" WHERE "ageGroup" IS NULL); END IF; END $$;`
     - `ALTER TABLE "ClassSection" ALTER COLUMN "ageGroup" SET NOT NULL;`
  3. Zod validator in `lib/validations/class-section.ts` adds `ageGroup: z.enum(["A","B"])` to create + update schemas.
  4. `app/api/class-sections/route.ts` (POST) + `app/api/class-sections/[id]/route.ts` (PUT) write `ageGroup` from validated body.
  5. Vitest in `lib/validations/__tests__/class-section.test.ts` covers: enum accept, reject lowercase, reject missing.
  Files: `prisma/schema.prisma`, `prisma/migrations/20260520000000_classsection_age_group/migration.sql`, `lib/validations/class-section.ts`, `lib/validations/__tests__/class-section.test.ts`, `app/api/class-sections/route.ts`, `app/api/class-sections/[id]/route.ts`.
  Independent of T3, T4, T5.

- [ ] **T2 — Admin ClassSection form: Kelompok Usia select.**
  Depends on T1 (schema column must exist).
  Acceptance:
  1. ClassSection create + edit dialogs in `app/admin/academic-years/page.tsx` expose a `Kelompok Usia` select with options A / B.
  2. Form state initializers (`useState` default, `openDialog`, `onEdit`) all carry the new field.
  3. Submit payloads include `ageGroup` in the POST/PUT body.
  4. Cross-checked design-system.html §form-field for Select component patterns.
  Files: `app/admin/academic-years/page.tsx`.

- [ ] **T3 — Tenant-scope legacy assessment page.**
  Acceptance:
  1. [app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx:70-76](../../app/teacher/assessments/%5BclassSectionId%5D/%5BtemplateId%5D/%5Bperiod%5D/page.tsx:70) `TeachingAssignment.findFirst` filter changes to:
     ```ts
     where: {
       employeeId: session.employeeId,
       classSectionId: classSection.id,
       classSection: {
         tenantId: session.tenantId,
         status: "ACTIVE",
       },
     }
     ```
  2. Same page's earlier `classSection.findUnique` (likely lines 30-50) also gets `tenantId` in the where if not already present. Verify in Task 3 — read full file first.
  3. Vitest in `app/teacher/assessments/.../__tests__/cross-tenant.test.ts` asserts: forged classSectionId from tenant B + session for tenant A returns the "Akses ditolak" EmptyState (or 404, depending on render branch).
  Files: `app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx`, new test file.
  Independent of T1, T2, T4, T5.

- [ ] **T4 — Remove `deriveAgeGroup`, switch consumers to schema column.**
  Depends on T1.
  Acceptance:
  1. `lib/curriculum/weekly-assessment-loader.ts` — delete `deriveAgeGroup`; `loadWeeklyAssessment` reads `homeroom.ageGroup` directly (from a `select: { ageGroup: true }` projection on the homeroom query in `getHomeroomClassSection`).
  2. `lib/curriculum/homeroom.ts` `getHomeroomClassSection` adds `ageGroup` to its select.
  3. `app/api/teacher/assessment-entries/center/[center]/route.ts:96` — same swap.
  4. `lib/curriculum/perkembangan-loader.ts:143` — same swap.
  5. Type narrows: `WeeklyAssessmentPayload.classSection.ageGroup` becomes `"A" | "B"` (no `| null`). Update the type literal in the loader.
  6. Vitest in `lib/curriculum/__tests__/weekly-assessment-loader.test.ts` (create if absent) covers: class with ageGroup A returns A-scoped indicators; class with ageGroup B returns B-scoped indicators.
  Files: `lib/curriculum/weekly-assessment-loader.ts`, `lib/curriculum/homeroom.ts`, `lib/curriculum/perkembangan-loader.ts`, `app/api/teacher/assessment-entries/center/[center]/route.ts`, test file.

- [ ] **T5 — PROMES re-import: status-aware conflict handling.**
  Acceptance:
  1. [app/api/admin/curriculum/import-promes/route.ts:308-319](../../app/api/admin/curriculum/import-promes/route.ts:308) `existing` query adds `status` to the select. Conflicts are split into `activeConflicts` (block) and `inactiveConflicts` (resolvable).
  2. Preview payload shape:
     ```ts
     {
       conflicts: { active: [...], inactive: [...] };
       // ...rest unchanged
     }
     ```
     If `active.length > 0` → 409 (current behaviour preserved). If only `inactive.length > 0` → 200 with the resolution prompt.
  3. Commit branch (`?commit=true`) accepts an optional `conflictPolicy` query param:
     - `block` (default) — current behaviour, refuse on any conflict.
     - `skip` — write only non-conflicting rows; inactive conflicts are skipped (left INACTIVE in DB).
     - `reactivate` — write non-conflicting rows AND set inactive conflicts back to `status: 'ACTIVE'`.
  4. UI in `app/admin/semesters/[id]/import/client.tsx` exposes "Skip" and "Reactivate" buttons on the preview screen when `inactive.length > 0`. Buttons trigger the commit POST with the matching `conflictPolicy`. Visual states: "Skip" is `variant="ghost"`, "Reactivate" is `variant="default"`.
  5. Vitest in `app/api/admin/curriculum/__tests__/import-promes-status.test.ts` covers: preview separates active/inactive; commit `skip` writes non-conflicting only; commit `reactivate` flips status; commit `block` refuses.
  Files: `app/api/admin/curriculum/import-promes/route.ts`, `app/admin/semesters/[id]/import/client.tsx`, test file.
  Independent of T1, T3, T4.

- [ ] **T6 — End-of-cycle gate + cross-checks.**
  Acceptance: `npm run build && npx vitest run && npx playwright test` all green. Cross-checked `.claude/standards/design-system.html` §form-field for T2 + §dialog-footer for T5. Append per-task summary to `## Implementation`. Verify `scripts/verify-rls-coverage.sh` still passes (the new `ageGroup` column doesn't disturb the RLS posture since `ClassSection` was already RLS-enabled).

- [ ] **T7 — Document AC7 legacy-assessment decision in Ship Notes.**
  Acceptance: CTO confirms one of `MIGRATE` / `ABANDON` / `KEEP-LEGACY-READ-ONLY` in a synchronous review of this cycle doc. If `MIGRATE`, write the backfill script to `scripts/migrate-legacy-assessment.ts` (dry-run default, no execution) and cover it with Vitest. If `ABANDON`, add a TODO to delete `/parent/reports` legacy code at the July cutover commit. If `KEEP-LEGACY-READ-ONLY`, add a feature-flag check on `POST /api/assessments/student/[id]` to refuse writes via the old route (returns 410 Gone with copy "Penilaian lama tidak menerima nilai baru. Gunakan Penilaian Pekanan."). Ship Notes records the choice + rationale. Until T7 closes, `/ship` blocks.

---

## Implementation

*(filled by `/build`)*

---

## Verification

*(filled by `/build` and `/ship` preview-verify loop)*

Manual smoke targets once preview is up:
- `/admin/academic-years` — open ClassSection create dialog, confirm Kelompok Usia select renders + persists.
- `/admin/semesters/[id]/import` — upload a PROMES file that conflicts with an INACTIVE indicator, confirm the preview surfaces the skip + reactivate buttons.
- `/teacher/assessments/...` — forge a `classSectionId` from another tenant, confirm Akses Ditolak EmptyState (not stale read).

---

## Ship Notes

*(filled by `/ship`)*

**AC7 Decision:** *PENDING CTO INPUT — required before merge.*

**Migrations:** `20260520000000_classsection_age_group` (two-phase, idempotent on re-run because column existence is checked first). Runs at deploy time via Vercel build hook → `prisma migrate deploy`.

**Env vars:** none expected.

**Rollback:**
- Schema rollback: `ALTER TABLE "ClassSection" DROP COLUMN "ageGroup"`. The migration assertion makes a partial-rollback unlikely; if any tenant's live data violated A/B before deploy, the migration would have refused.
- Code rollback: revert this PR. The PROMES `conflictPolicy` parameter is opt-in (`block` is default); existing tooling continues to work.

**External services:** none touched. No Xendit, Resend, or Supabase auth surface changes.

**Follow-ups:**
- Pending T7 decision, schedule the legacy `/parent/reports` deletion or backfill execution before July 2026 cutover.
- Audit other Prisma `where` clauses across `app/**/page.tsx` for missing `tenantId` (sister bug class to T3). Track as a `feat/page-layer-tenant-scope-audit` follow-up.
- The audit's `feat/security-hardening` + `feat/finance-audit-trail` cycles are sequenced after this one merges to staging.
