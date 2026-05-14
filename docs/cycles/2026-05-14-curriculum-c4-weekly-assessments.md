# Curriculum C4 — AssessmentEntry Schema + Walas Weekly Assessment UI

## Context

Pack 1 / Cycle 4 of the 11-cycle Curriculum + Penilaian + Raport initiative (July 2026 hard cutover). C1–C3 shipped curriculum schema, PROMES xlsx import, and IKTP CRUD ([PR #275](https://github.com/ismailir10/school-erp/pull/275) merged 2026-05-14). C4 is the first cycle that lets teachers actually record assessments against the indicators — closing the loop from "indicators exist in DB" → "per-student progress recorded against indicators." Required as the data prerequisite for C6 (parent perkembangan rollup) and Pack 2 raport (C8–C11). This cycle ships the `AssessmentEntry` schema + the walas-only weekly mobile UI; sentra (center) entry comes in C5.

Naming convention locked (per user instruction): English everywhere for code-side identifiers (Prisma fields, enum names, file paths, route paths, function names). Indonesian appears only in user-facing UI copy + DB content (theme names, indicator text). Approved plan at [/Users/ismailrabbanii/.claude/plans/glowing-mapping-crane.md](/Users/ismailrabbanii/.claude/plans/glowing-mapping-crane.md). Design contract: [docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md](docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md) §4.2 + §5.2 + §5.4.

## Spec

### Acceptance criteria

- [ ] `AssessmentEntry` model + `AssessmentSource` + `LearningCenter` enums added to `prisma/schema.prisma`; migration applies cleanly to dev DB; types regenerate.
- [ ] `getHomeroomClassSection(tenantId, employeeId, academicYearId)` returns the active `ClassSection` of a walas (TeachingAssignment.role = HOMEROOM) or null.
- [ ] `getCurrentWeek(tenantId, jakartaDate)` returns the active `Week` row containing that date or null.
- [ ] `POST /api/teacher/assessment-entries` accepts a bulk array (max 50), validates source/center coherence, verifies tenant + indicator-theme link, upserts each entry idempotently on `(tenantId, studentId, indicatorId, date, source)`, audits.
- [ ] `GET /api/teacher/assessment-entries/weekly` returns the active week + walas's classSection roster + indicators filtered to week's theme + matching ageGroup + existing entries.
- [ ] `/teacher/assessments/weekly` page renders mobile-first (`max-w-md`): week header, day chips, indicator dropdown, vertical roster with 3-button level setter; tap → optimistic POST → toast on error.
- [ ] `/teacher/assessments/page.tsx` (hub) gains walas-only "Penilaian Pekanan" card + "Sentra Harian (Coming in C5)" placeholder above the existing AssessmentTemplate list.
- [ ] `/teacher/home-client.tsx` gains a walas-only quick card linking to `/teacher/assessments/weekly`.
- [ ] Playwright spec [e2e/teacher-assessments-weekly.spec.ts](e2e/teacher-assessments-weekly.spec.ts) covers walas → load → tap → reload → persisted.
- [ ] Vitest cases (~30): validation schemas, both helpers, both API routes (happy + 4xx paths + idempotency).
- [ ] design-system.html §portal-shells + §forms cross-checked (frontend gate).
- [ ] `npm run build && npx vitest run && npx playwright test` all green at end of cycle.

### Non-goals

- Sentra (center) UI — that's C5.
- Deprecating the existing `AssessmentTemplate` model + its `/teacher/assessments/[classSectionId]/...` flow — kept untouched, accessed via "Penilaian lama" section of the hub.
- Parent visibility of assessment data (`/parent/perkembangan`) — that's C6.
- Permission key rename `learning.penilaian.write` → `learning.assessment.write` — keep current key to avoid touching the permission map; rename only if zero existing consumers (verify in T2).
- New translation infra — Indonesian copy is hard-coded per existing pattern.
- Performance optimization beyond the indexes specified in the design doc.

### Assumptions

1. `TeachingAssignment.role = "HOMEROOM"` is the canonical walas marker (existing schema default; survey confirmed in approved plan).
2. Demo seed has at least one homeroom teacher; if not, T1 includes a seed update so dev/E2E walas demo works.
3. Active week is determined by `Week.startDate ≤ today ≤ Week.endDate AND Week.status = ACTIVE`. If overlapping weeks exist (data error), `findFirst` returns the earliest; UI shows whichever it picks. Out of scope to detect overlaps.
4. ageGroup matching for indicator filtering: walas's classSection's program → academicYear → ageGroup is derivable. If not directly on the model, we read from `Program.ageGroup` or `ClassSection.name` convention. T4 implementation will choose the correct path during exploration.
5. `learning.penilaian.write` permission already exists and is granted to TEACHER role. T3 verifies and adds it if missing.
6. Migration timestamp `20260514120000` is free; T1 verifies against `git ls-tree origin/staging prisma/migrations/` before commit.

→ Correct any of these now or `/build` will proceed with them.

## Tasks

- [ ] **T1 — Schema + migration** *(independent: blocks all later tasks)*
  - Add to `prisma/schema.prisma`: `enum AssessmentSource { HOMEROOM, CENTER }`, `enum LearningCenter { WORSHIP, NATURAL_MATERIALS, ART, COOKING, ROLE_PLAY, BLOCKS, PREPARATION, AREA }`, `model AssessmentEntry` per design §4.2 with relations to `Student`, `AchievementIndicator`, `Week`, `Employee`, `Tenant`.
  - Generate migration `prisma/migrations/20260514120000_add_assessment_entry/`.
  - Update `prisma/seed.ts` if needed to include at least one demo `TeachingAssignment` with `role = "HOMEROOM"` (skip if existing seed already covers).
  - **Acceptance:** `npm run build` passes; `npx prisma migrate dev` applies cleanly; types regenerate; vitest still green.

- [ ] **T2 — Validation schemas + homeroom resolver + week resolver** *(depends on T1 types)*
  - New `lib/validations/assessment-entry.ts`: `assessmentEntryCreateSchema`, `assessmentEntryBulkCreateSchema` (max 50), `assessmentEntryUpdateSchema` with HOMEROOM↔center discriminator.
  - New `lib/curriculum/homeroom.ts`: `getHomeroomClassSection(tenantId, employeeId, academicYearId)`.
  - New `lib/curriculum/week-resolver.ts`: `getCurrentWeek(tenantId, jakartaDate)`.
  - Verify `learning.penilaian.write` exists in `lib/permissions.ts`; if zero consumers, rename to `learning.assessment.write`.
  - **Acceptance:** vitest cases (~10) — schema valid/invalid combos, helpers happy + null paths.

- [ ] **T3 — POST /api/teacher/assessment-entries (bulk upsert)** *(depends on T2)*
  - New `app/api/teacher/assessment-entries/route.ts`. Pattern from [app/api/admin/curriculum/indicators/route.ts](app/api/admin/curriculum/indicators/route.ts): auth → rate-limit → validate → tenant/indicator-link verification → upsert each entry → `recordAudit`.
  - Add `PENILAIAN_WRITE_BUDGET` (60 req/min) to `lib/rate-limit.ts`.
  - **Acceptance:** vitest cases (~7) — happy 200, idempotency, 401 unauth, 403 wrong-tenant student, 400 indicator not linked to week's theme, 400 source/center mismatch, 422 no active week.

- [ ] **T4 — GET /api/teacher/assessment-entries/weekly** *(depends on T2; independent of T3)*
  - New `app/api/teacher/assessment-entries/weekly/route.ts`: auth → `getHomeroomClassSection` → `getCurrentWeek` → roster + indicators (filtered to ageGroup + week's theme via `IndicatorThemeLink`) + existing entries.
  - Response shape: `{ week, classSection, students, indicators, entries }`.
  - **Acceptance:** vitest cases (~6) — 200 populated, 404 non-homeroom, 404 no active week, indicators filtered by ageGroup, entries scoped to week, empty entries when none yet.

- [ ] **T5 — `/teacher/assessments/weekly` mobile UI** *(depends on T4)*
  - New `app/teacher/assessments/weekly/page.tsx` (server) + `client.tsx` (client). Wraps in existing teacher `<main className="max-w-md mx-auto px-page-x py-6">`.
  - Header with week+theme+subtheme, day chips (Mon–Fri), indicator dropdown filtered by week+ageGroup, vertical roster with 3-button level setter using `bg-status-success`/`bg-status-warn`/`bg-status-danger` per [.claude/standards/colors.md](.claude/standards/colors.md).
  - Optimistic POST on tap; revert + toast on error per [.claude/standards/voice.md](.claude/standards/voice.md).
  - Empty state "Belum ada Pekan aktif" via existing `<EmptyState>` from [components/ui/empty-state](components/ui/empty-state).
  - design-system.html §portal-shells + §forms cross-checked.
  - **Acceptance:** mounts, hydrates, taps persist, design-system token preserved.

- [ ] **T6 — Assessment hub + nav entries** *(depends on T5)*
  - Update `app/teacher/assessments/page.tsx`: add walas-only "Penilaian Pekanan" card + "Sentra Harian (Coming in C5)" placeholder above existing AssessmentTemplate list (latter under "Penilaian lama (template)" heading).
  - Update `app/teacher/home-client.tsx`: walas-only quick card "Penilaian Pekanan".
  - Verify `components/teacher/bottom-nav.tsx` Penilaian icon still routes to `/teacher/assessments` (no change expected).
  - **Acceptance:** walas sees both cards on home + hub; non-walas teacher sees only sentra placeholder + legacy templates.

- [ ] **T7 — Playwright e2e** *(depends on T5 + T6)*
  - New `e2e/teacher-assessments-weekly.spec.ts`: walas demo user → `/teacher/assessments/weekly` → verify week header → pick indicator → tap level on first student → reload → assert persisted. Demo-cookie pattern from [e2e/teacher.spec.ts](e2e/teacher.spec.ts).
  - **Acceptance:** spec passes against `DEMO_MODE=true npm run start`.

## Implementation

- **T1 — Schema + migration** *(commit `feat(curriculum): C4 T1 — AssessmentEntry schema + migration`)*
  - [prisma/schema.prisma](prisma/schema.prisma): added `enum AssessmentSource`, `enum LearningCenter`, `model AssessmentEntry` (FK to Tenant/Student/AchievementIndicator/Week/Employee with the design-locked unique + indexes); added back-relations on `Tenant`, `Student`, `Employee`, `Week`, `AchievementIndicator`.
  - `prisma/migrations/20260514120000_add_assessment_entry/migration.sql`: hand-written DDL matching the schema additions; additive only.
  - `npx prisma generate` + `npx prisma format` succeeded; `npm run build` + `npx vitest run` (1388 pass) green.

- **T2 — Validation + helpers + permission keys** *(commit `feat(curriculum): C4 T2 — validation + homeroom/week resolvers + assessments perm keys`)*
  - [lib/validations/assessment-entry.ts](lib/validations/assessment-entry.ts): `assessmentEntryCreateSchema`, `assessmentEntryBulkCreateSchema` (max `MAX_BULK_ENTRIES = 50`), `assessmentEntryUpdateSchema` with HOMEROOM↔CENTER discriminator via `superRefine`.
  - [lib/curriculum/homeroom.ts](lib/curriculum/homeroom.ts): `getHomeroomClassSection(tenantId, employeeId, academicYearId)`.
  - [lib/curriculum/week-resolver.ts](lib/curriculum/week-resolver.ts): `getCurrentWeek(tenantId, targetUtcMidnight)`.
  - [lib/permissions.ts](lib/permissions.ts): added `learning` group with `assessments.read` + `assessments.write`; granted both to TEACHER default. Existing permissions test updated to assert the new TEACHER set.
  - Tests: 12 cases for the validator (HOMEROOM/CENTER happy + discriminator violations + bulk size + level enum + length caps), 2 cases each for the two resolvers (happy path + null path). All 1410 vitest cases pass.

- **T3 — POST /api/teacher/assessment-entries** *(commit `feat(curriculum): C4 T3 — POST bulk assessment entries`)*
  - [app/api/teacher/assessment-entries/route.ts](app/api/teacher/assessment-entries/route.ts): bulk upsert handler. Auth (`assessments.write`) → rate-limit (`PENILAIAN_WRITE_BUDGET = 60/min`) → validate (Zod bulk schema) → resolve active AcademicYear (422 if none) → resolve walas's ClassSection (only required if any HOMEROOM entry) → tenant-scope all referenced students + indicators (403 on mismatch) → enforce HOMEROOM students belong to walas's section via `StudentEnrollment` (403) → resolve weekId per distinct date via `getCurrentWeek` (422 if any date outside an active week) → enforce indicator-theme link against active week's theme (400) → `prisma.$transaction(upserts)` keyed on the design-locked unique → audit `bulk-upsert`.
  - 12 vitest cases (auth/perm/employeeId, no AY, no week, student-not-in-tenant, student-not-in-section, not-walas, indicator-not-linked-to-theme, source/center mismatch, happy path, idempotent re-submit). 1422 vitest pass.

- **T4 — GET /api/teacher/assessment-entries/weekly** *(commit `feat(curriculum): C4 T4 — GET weekly homeroom payload`)*
  - [app/api/teacher/assessment-entries/weekly/route.ts](app/api/teacher/assessment-entries/weekly/route.ts): `requirePermission("assessments.read")` → resolve active AY → `getHomeroomClassSection` (404 `not_homeroom`) → `getCurrentWeek` (404 `no_active_week`, payload still includes classSection so client can show contextual empty state) → `deriveAgeGroup(classSection.name)` (last token A/B; null for KB/D'Care — documented heuristic, schema column tracked as follow-up) → roster (ACTIVE enrolments) → indicators linked to active week's theme (filtered by ageGroup when derivable) → existing HOMEROOM entries for week × roster.
  - Response: `{ week: { id, number, startDate, endDate, subTheme, theme }, classSection: { id, name, ageGroup }, students: [], indicators: [], entries: [] }` — dates returned as Jakarta-tz YYYY-MM-DD via `formatJakartaYmd`.
  - 9 vitest cases (401/403, 404 no AY, 404 not_homeroom, 404 no_active_week with classSection echo, 200 happy, 200 ageGroup-filter applied when derivable, 200 ageGroup-filter omitted otherwise, 200 entries scoped to HOMEROOM source + week + roster). 1431 vitest pass.

- **T5 — `/teacher/assessments/weekly` mobile UI** *(commit `feat(curriculum): C4 T5 — walas weekly mobile UI`)*
  - Refactor: extracted [lib/curriculum/weekly-assessment-loader.ts](lib/curriculum/weekly-assessment-loader.ts) (`loadWeeklyAssessment(...)`) so the SSR page + GET route share one data-load path. `deriveAgeGroup(name)` lives there too. Route handler [app/api/teacher/assessment-entries/weekly/route.ts](app/api/teacher/assessment-entries/weekly/route.ts) now thin-wraps the loader; T4 tests (9 cases) still pass.
  - [app/teacher/assessments/weekly/page.tsx](app/teacher/assessments/weekly/page.tsx): server component — calls `loadWeeklyAssessment`; renders contextual `<EmptyState>` for `not_homeroom`/`no_active_year`/`no_active_week`; otherwise hands payload to `<WeeklyClient>`.
  - [app/teacher/assessments/weekly/client.tsx](app/teacher/assessments/weekly/client.tsx): mobile-first (inherits teacher layout `max-w-md`). Header → day chips Mon–Fri (default = today if within week) → indicator dropdown (filtered by week's theme + walas's ageGroup) → vertical roster with 3-button level setter (`bg-status-present`/`bg-status-late`/`bg-status-absent` per [.claude/standards/colors.md](.claude/standards/colors.md)). Optimistic write per tap → `POST /api/teacher/assessment-entries` → toast on error + revert + `router.refresh()` on success.
  - 4 vitest cases for pure helpers (`weekDays`, `pickInitialDay`). 1435 vitest pass.
  - Cross-checked design-system.html §portal-shells + §forms for tap UX.

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
