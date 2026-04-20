# Assessment Bug Fix — Uniqueness, 409, Teacher Nilai UI

## Context

PR [#71 "CRUD Standard Completion — Phase 2"](https://github.com/ismailir10/annisaa-erp-v3/pull/71) shipped an admin assessment UI on 2026-04-19 (`/admin/assessments/page.tsx`, `/admin/assessments/templates/page.tsx`, `/admin/assessments/scores/page.tsx`), but it left the **actual bug** live on staging:

1. **`AssessmentTemplate` has no `@@unique([tenantId, programId, name, type])`** — verified against `origin/staging:prisma/schema.prisma` (only `@@index([tenantId])`).
2. **`POST /api/assessments/templates` does not reject duplicates** — staging's handler parses Zod, checks the program exists, then calls `prisma.assessmentTemplate.create` with no `findFirst` uniqueness guard. Any double-submit or reseed creates N copies.
3. **No teacher-side nilai entry UI** — `app/teacher/` has no `assessments/` directory on staging; teachers cannot reach `PUT /api/assessments/student/[id]`.
4. **Teacher authz on the student PUT is program-level, not class-level** — staging's `app/api/assessments/student/[id]/route.ts` only checks that the teacher has *some* `TeachingAssignment` in the same program, not that they are assigned to the specific class the student is enrolled in. No class-boundary enforcement, no Zod on body, no rate limit.

This cycle narrows the original Phase 2 work ([docs/cycles/2026-04-20-crud-completion-phase2.md](2026-04-20-crud-completion-phase2.md) on `claude/zen-pare-06c941`) to **just the bug-fix-relevant tasks** (A2, A3, B3, B4). B1 + B2 (admin assessment UI) are dropped because PR #71 covered that ground with a different structure. Phase C (CRUD gap closure), Phase D (vitest sweep), and Phase E (README + ADR repair) are deferred to [docs/cycles/2026-04-20-crud-phase-cde.md](2026-04-20-crud-phase-cde.md).

**Reuse strategy (to avoid conflicts on staging):**

- **Keep staging's `lib/validations/assessment-template.ts`** — do not reintroduce our parallel `lib/validations/assessment.ts`. Extend the existing file with `studentAssessmentSaveSchema` (score enum `BB|MB|BSH|BSB`).
- **Rebuild A2 migration on top of staging's schema** — staging has had several schema changes since `c1eb079` (program status rename, guardian status, student-attendance voided, FK indexes, etc.). Do not cherry-pick the zen-pare migration file; regenerate.
- **Cherry-pick B3 verbatim** — pure add, zero conflict surface (`lib/academic-period.ts`, `app/api/teacher/assessments/route.ts`, `app/teacher/assessments/page.tsx`, bottom-nav change).
- **Rebuild B4 on top of staging's `/student/[id]` route** — staging already has program-level authz + status field; we tighten to class-level authz, add Zod + rate limit, and bring in the page + client + `category-indicator-editor`-less inline form.

## Spec

Cycle ships successfully when:

- [ ] `AssessmentTemplate` has `@@unique([tenantId, programId, name, type])` on staging DB. Migration de-dupes any existing duplicates first (reparent `StudentAssessment.templateId` and `AssessmentCategory.templateId`, then delete orphans, then add the unique index).
- [ ] `POST /api/assessments/templates` returns **409** with `{ error: "Template dengan nama dan tipe yang sama sudah ada untuk program ini." }` when a duplicate is submitted. Rate limit preserved. Existing admin UI (PR #71) continues to work (happy path unchanged).
- [ ] `PUT /api/assessments/student/[id]` validates body with Zod (`studentAssessmentSaveSchema`), enforces **class-level** authz for teachers (assignment must match a class the student is actively enrolled in **and** the template's program), and is rate-limited 30/min per user. Admin bypass preserved.
- [ ] `POST /api/assessments/student` has the same class-level authz + rate limit + template-tenant existence check.
- [ ] `app/teacher/assessments/page.tsx` lists teacher's active classes with per-template `{studentsTotal, studentsDraft, studentsPublished, studentsPending}` counts for the current period. Mobile-first `max-w-md`. Links to `[classSectionId]/[templateId]/[period]`.
- [ ] `GET /api/teacher/assessments` returns the aggregation with tenant scope + TEACHER/admin role gate, single aggregated query shape (no per-pair N+1).
- [ ] `app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx` renders a per-student Accordion with 4-way BB/MB/BSH/BSB toggle per indicator + optional notes + draft autosave (1.2s debounce) + sticky "Publikasikan rapor" button.
- [ ] Teacher bottom nav gains a 5th tab "Nilai" (`ClipboardCheck`), layout switched to `flex-1 px-2` to fit.
- [ ] Vitest coverage: `lib/__tests__/academic-period.test.ts` (3 boundary cases), extended `lib/__tests__/assessment-template.test.ts` (409 guard), new `app/api/__tests__/assessment-student-authz.test.ts` (teacher cross-class 403, own-class 200, admin bypass, Zod invalid-score 400).
- [ ] Playwright: teacher assessments smoke — open Nilai tab → pick a class → enter a score → draft autosave → publish. Extends `e2e/teacher.spec.ts`.
- [ ] `npm run build && npx vitest run && npx playwright test` all green.

### Non-goals

- **No admin UI changes.** Keep staging's PR #71 pages as-is. If that UI has gaps (view/edit toggle detail page, shared category-indicator editor component), they belong to a follow-up cycle — not this one.
- **No CRUD-matrix work on other entities.** Deferred to Phase C/D/E cycle.
- **No README repairs.** Deferred to Phase E cycle.
- **No PR #70 or PR #71 reverts.**

### Assumptions

1. Staging's admin assessment UI from PR #71 is acceptable as-is for this cycle. Any inadequacies are triaged separately.
2. The four task outputs from `claude/zen-pare-06c941` (commits `7dc96c6`, `675a028`, `cba1e6a`, `d0c31df`) are sound reference material but will be **rebuilt** on top of `origin/staging` rather than cherry-picked — conflicts (especially on `schema.prisma`, `app/api/assessments/templates/route.ts`, and `app/api/assessments/student/[id]/route.ts`) are substantial enough that a rebuild is cleaner than conflict reconciliation.
3. The `/build` commit series uses the same shape as the reference commits but messages are fresh, signed with opus-4-7 trailer via the `prepare-commit-msg` hook.
4. Staging's DB has no live duplicate `AssessmentTemplate` rows (or very few). The dedupe migration is defensive — staging's seed may not have seeded duplicates yet. Migration is idempotent either way.
5. Per current `CLAUDE.md`, **all roles use PR-based `/ship`** — cto included. We push `feat/assessment-bug-fix` and open a PR against `staging` with the `needs-cto-review` label. Direct pushes to `staging` are blocked by `pre-push`. (`.claude/skills/ship/SKILL.md` is stale on this point; Phase E3 fix is tracked in the Phase C/D/E cycle stub.)

## Tasks

Ordered, atomic, one commit per task. Each task passes `npm run build && npx vitest run` before commit. Final task runs the end-of-cycle gate.

### T1 — AssessmentTemplate uniqueness + dedupe migration (rebuilt for staging)

**Files:**
- Modify: `prisma/schema.prisma` — add `@@unique([tenantId, programId, name, type])` to `AssessmentTemplate`, keeping the existing `@@index([tenantId])`.
- Create: `prisma/migrations/20260420000000_assessment_template_unique/migration.sql`.

Migration SQL (in order):
1. **Survivor picker** (CTE): for each `(tenantId, programId, name, type)` group, pick the row with the highest `assessments` count, tiebreak on oldest `createdAt`.
2. **Reparent `StudentAssessment.templateId`** from duplicates to survivor. Merge scores on conflict: if survivor already has a row for the same `(studentId, period)`, keep survivor's row (drop duplicate's scores via `StudentAssessmentScore` cascade).
3. **Reparent `AssessmentCategory.templateId`** from duplicates to survivor. If name collision (survivor already has a category with the same name), drop the duplicate's category (cascading indicators + scores).
4. Delete orphan duplicate `AssessmentTemplate` rows.
5. Add the unique index.

- [ ] Write migration SQL.
- [ ] `npx prisma migrate dev` against local SQLite; verify no row loss on clean seed.
- [ ] `npm run build && npx vitest run`. Expected: pass.
- [ ] Commit: `fix(assessment): de-duplicate templates + enforce (tenant,program,name,type) unique`.

### T2 — POST templates 409 + extended validator

**Files:**
- Modify: `lib/validations/assessment-template.ts` — add `studentAssessmentSaveSchema` (`scores: [{ indicatorId: string, score: enum('BB'|'MB'|'BSH'|'BSB'), notes?: string.max(500) }]`, `publish?: boolean`).
- Modify: `app/api/assessments/templates/route.ts` — after Zod parse + program existence, add `findFirst` on `(tenantId, programId, name, type)`. Return 409 with `{ error, existingId }`. Keep existing rate limit + revalidatePath.
- Modify (or extend): `lib/__tests__/assessment-template.test.ts` — add cases for 409 on duplicate, happy-path create returns 201, Zod rejects invalid type. If the test file does not yet exist on staging, create it.

- [ ] Update validator.
- [ ] Update POST handler.
- [ ] Write vitest. Run `npx vitest run lib/__tests__/assessment-template.test.ts`. Expected: fail first, then pass after handler change.
- [ ] `npm run build && npx vitest run`. Expected: pass.
- [ ] Commit: `feat(assessment): 409 on duplicate template POST + studentAssessmentSaveSchema`.

### T3 — Teacher nilai landing page + aggregation API (B3 rebuild)

**Files:**
- Create: `lib/academic-period.ts` — `getCurrentPeriod(now?)` returns `"Semester 1 YYYY/YYYY+1"` for Jul–Dec, `"Semester 2 YYYY-1/YYYY"` for Jan–Jun.
- Create: `lib/__tests__/academic-period.test.ts` — 3 boundary cases (Jul 1, Dec 31, Jan 1).
- Create: `app/api/teacher/assessments/route.ts` — tenant + role gate, single aggregated query, response shape as in spec above.
- Create: `app/teacher/assessments/page.tsx` — server component, mobile-first `max-w-md`, per-class card with template rows + progress chip.
- Modify: `components/teacher/bottom-nav.tsx` — add 5th "Nilai" tab (`ClipboardCheck`), switch from `px-4` to `flex-1 px-2`.

- [ ] Build lib + tests. Run vitest on new file. Expected: pass.
- [ ] Build API + page + nav.
- [ ] `npm run build && npx vitest run`. Expected: pass.
- [ ] Commit: `feat(teacher): assessments landing page + per-class aggregation API`.

### T4 — Teacher per-student nilai entry + class-level authz tightening (B4 rebuild)

**Files:**
- Create: `app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx` — server component; verifies ClassSection ACTIVE + tenant, template `isActive` + `programId === classSection.programId`, and for TEACHER sessions requires a `TeachingAssignment` matching the **specific** `classSectionId`. Prefetches active enrollments + existing `StudentAssessment` rows with scores.
- Create: `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx` — Accordion per student, 4-way BB/MB/BSH/BSB toggle per indicator, optional Textarea notes, per-student 1200ms debounced draft autosave, sticky "Publikasikan rapor" button flushes timers then sequentially PUTs `{ publish:true }`.
- Modify: `app/api/assessments/student/[id]/route.ts` — replace program-level authz with class-level: teacher must have a `TeachingAssignment` whose `classSectionId` is one of the student's active enrollment class-sections AND whose `classSection.programId === template.programId`. Add Zod parse of body via `studentAssessmentSaveSchema` (400 with `details` on fail). Add `rateLimit(student-assessment-save:<userId>, 30, 60_000)`.
- Modify: `app/api/assessments/student/route.ts` — same class-level authz guard + 30/min rate limit + template-tenant existence check.
- Create: `app/api/__tests__/assessment-student-authz.test.ts` — 7 cases: 401 unauth, teacher cross-class 403 on PUT, teacher own-class 200 on PUT, admin bypass 200, Zod invalid-score 400 on PUT, teacher cross-class 403 on POST, teacher own-class 200 on POST.

- [ ] Write tests first. Run vitest. Expected: fail (handlers not yet tightened).
- [ ] Tighten handlers.
- [ ] Build page + client.
- [ ] Re-run vitest. Expected: pass.
- [ ] **End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test`. Extend `e2e/teacher.spec.ts` with a Nilai-tab smoke (open → pick class → enter a score → draft autosave indicator → publish). Expected: all green.
- [ ] Commit: `feat(teacher): per-student nilai entry form + class-level authz + Zod + rate limit`.

## Implementation

<!-- Filled by /build -->

## Verification

<!-- Filled by /build -->

- [ ] T1/T2/T3 gate green
- [ ] End-of-cycle gate green (build + vitest + playwright)
- [ ] Manual smoke — admin POST duplicate returns 409 with expected message
- [ ] Manual smoke — teacher opens Nilai tab → enters score → publish → parent rapor endpoint returns score

## Ship Notes

<!-- Filled by /ship -->

Expected at ship time:

- **Migration:** `20260420000000_assessment_template_unique` — dedupes existing rows and adds composite unique index. Must run on staging before merge to main. Review migration SQL explicitly in the PR before approving.
- **New env vars:** none.
- **Rollback plan:** revert the migration directory + the schema diff; existing admin UI (PR #71) continues to function without the unique constraint (old behaviour).
- **PR label:** `needs-cto-review`.
- **CI gates:** build, typecheck, vitest, playwright (all required on staging PR).
