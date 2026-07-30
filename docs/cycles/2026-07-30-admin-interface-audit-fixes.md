# Admin Interface Audit Fixes

## Context

`/better-interface` full-mode audit of the admin portal (`app/admin/**`, `components/admin/**`, excluding parent/teacher/payment) ran 7 parallel subagents across accessibility, layout, writing, typography, colors, and UI-polish domains. Consolidated to 15 capped findings (9 HIGH, 6 MEDIUM), several systemic across many files. User chose to fix all 15.

design-system reference cross-checked: `.claude/standards/design-system.html` DataTable, Dialog/Sheet, Status Badge, and Form sections consulted per finding below.

## Spec

Acceptance criteria — one per finding, grouped by fix cluster to avoid cross-agent file collisions:

**Cluster 0 — shared components (must land first; other clusters import from these)**
- F2: `bg-primary`/`bg-warning` text pairs meet WCAG AA 4.5:1 for normal text (`components/ui/button.tsx`, `dashboard/pending-actions.tsx`, `students/[id]/page.tsx:531`)
- F15: `checkbox.tsx` styles `data-indeterminate` distinctly from checked/unchecked
- F10 (component half): `status-badge.tsx` `STATUS_MAP` gains keys for admission/enrollment/audit-trail statuses currently hand-rolled elsewhere
- F5: `components/portal/week-grid.tsx` — today-column no longer reuses success/present token when unfilled; admin `editable` mode allows past-day edits (not just today); "today" computed via `getTodayInTimezone("Asia/Jakarta")`

**Cluster 1 — Settings** (`app/admin/settings/{campuses,holidays,roles}/page.tsx`)
- F3 (settings half): `DialogClose` wraps `Button` via `render` prop, not as a child, in campuses/holidays
- F1 (settings subset): roles form fields get `id`/`htmlFor` pairing + `required`/`aria-required` on controls
- F13 (settings subset): roles delete uses `DeactivateConfirmDialog` with "Ya, Hapus", not hand-rolled `AlertDialog`
- F11 (settings subset): campuses status-filter buttons get `aria-pressed`

**Cluster 2 — Admissions + Enrollments** (`app/admin/admissions/page.tsx`, `app/admin/enrollments/{page,[id]/page,status-chip}.tsx`)
- F1 (subset): admissions form fields get `id`/`htmlFor` + `required`/`aria-required`
- F9: sibling-detect `HoverCardTrigger` reachable by keyboard (`tabIndex={0}` or real button)
- F10 (subset): admissions/enrollments status badges consume the new `StatusBadge` keys, drop local hand-rolled maps
- F6: enrollment list passes `loading` to `DataTable`, drops the misleading `emptyTitle` ternary
- F7: enrollment convert-to-student uses `ConfirmDialog`, not native `confirm()`
- F8: enrollment list gets real pagination + `DataTableToolbar` search

**Cluster 3 — Assessments + Raport** (`app/admin/assessment-templates/page.tsx`, `app/admin/assessments/[id]/page.tsx`, `app/admin/raport/{page,raport-editor}.tsx`)
- F1 (subset): assessment-templates + raport-editor `NumField` get `id`/`htmlFor` + `required`
- F4 (subset): score-selector (BB/MB/BSH/BSB) becomes a proper `role=radiogroup`/`ToggleGroup` with accessible names, keyboard-operable
- F14: score entry saves on every tap (optimistic + rollback), not buffered to a "Simpan Draf" click
- F10 (subset): raport/raport-editor status badges consume `StatusBadge`, drop local duplicates

**Cluster 4 — Attendance + Journal** (`app/admin/student-attendance/page.tsx`, `app/admin/student-journal/**`, `components/student-journal/category-accordion.tsx`)
- F1 (subset): student-journal category/indicator fields get `id`/`htmlFor` + `required`
- F12: week-nav/reorder icon buttons get `aria-label` (not `title`-only) in monitoring, classes/[id], students/[id], category-accordion
- F13 (subset): destructive confirms in student-attendance, student-journal, category-accordion use "Ya, `<Verb>`" copy
- F10 (subset): student-journal audit-trail action color uses `StatusBadge` instead of inline ternary

**Cluster 5 — Classes + Academic** (`app/admin/classes/{client,[id]/client}.tsx`, `app/admin/semesters/{client,[id]/themes/client,[id]/objectives/client}.tsx`)
- F1 (subset): classes/semesters/themes form fields get `id`/`htmlFor` + `required`
- F3 (classes half): ThemeCard/SubThemeCard row no longer nests `Button` inside the row `<button>`
- F11 (subset): semesters/objectives filter buttons get `aria-pressed`

**Cluster 6 — HR** (`app/admin/(hr)/{employees/page,employees/[id]/page,salary-components/page,employee-attendance/monthly/page}.tsx`)
- F1 (subset): employees/salary-components form fields get `id`/`htmlFor` + `required`
- F4 (subset): monthly attendance grid cells get `aria-label` with employee+date+status (color no longer sole signal)

Non-goals: no findings dropped from the capped-15 report are in scope (phone `type=tel`, chart color mismatch, unbalanced stat grids, etc. — separate backlog, not this cycle). No payment/parent/teacher files touched.

## Tasks

- [x] Cluster 0 — shared components (button contrast, checkbox indeterminate, status-badge keys, week-grid 3 fixes)
- [x] Cluster 1 — Settings
- [x] Cluster 2 — Admissions + Enrollments
- [x] Cluster 3 — Assessments + Raport
- [x] Cluster 4 — Attendance + Journal
- [x] Cluster 5 — Classes + Academic
- [x] Cluster 6 — HR

Clusters 1-6 touch disjoint files and only consume Cluster 0's shared components (don't edit them) — safe to implement in parallel once Cluster 0 lands and gates green.

## Implementation

_(filled by /build)_

- `c3c2e2f2` updated shared components: `app/globals.css` contrast tokens; `components/ui/button.tsx` default-button contrast; `components/ui/checkbox.tsx` indeterminate state; `components/ui/status-badge.tsx` admission/enrollment/audit mappings; `components/admin/dashboard/pending-actions.tsx` count-badge contrast; and `components/portal/week-grid.tsx` today-state, editable-past-day, and Jakarta-date fixes. Review fixes also updated the WeekGrid callers in `app/admin/student-journal/students/[id]/page.tsx` and `app/admin/students/[id]/page.tsx`. Added focused mapping coverage in `components/ui/__tests__/status-badge.test.tsx` and WeekGrid coverage in `components/portal/__tests__/week-grid.test.ts`.
- Cluster 0 final review P2: `app/admin/assessments/page.tsx` now explicitly overrides the `PUBLISHED` label to `Dipublikasi`, preserving the shared parent-facing `StatusBadge` default `Terbit`; corrected the stale shared-component comment and added focused override/default coverage.
- Cluster 1 — Settings: `app/admin/settings/{campuses,holidays,roles}/page.tsx`, `app/admin/settings/roles/__tests__/page.test.tsx`, `components/admin/deactivate-confirm-dialog.tsx`, and `components/admin/__tests__/deactivate-confirm-dialog.test.tsx` — corrected DialogClose composition and filter state semantics, paired required role fields with labels, standardized the role delete confirmation to `Ya, Hapus`, and ensured a failed delete keeps the dialog open for retry.
- Cluster 2 — Admissions + Enrollments: `app/admin/admissions/page.tsx`, `app/admin/enrollments/page.tsx`, `app/admin/enrollments/[id]/page.tsx`, and `app/admin/enrollments/status-chip.tsx` — paired admission form labels and controls with required semantics, made sibling detection keyboard-accessible, consolidated admission/enrollment chips on shared `StatusBadge`, added enrollment loading, search, status filtering, and server pagination, and replaced native conversion confirmation with `ConfirmDialog`. Reviewer fixes abort superseded search requests so stale responses cannot overwrite current results, and toast + rethrow unexpected conversion failures so the confirmation remains open for retry without duplicate toasts on handled API errors.
- Cluster 3 — Assessments + Raport: `app/admin/assessment-templates/page.tsx`, `app/admin/assessments/[id]/page.tsx`, `app/admin/assessments/[id]/__tests__/page.test.tsx`, `app/admin/raport/page.tsx`, and `app/admin/raport/raport-editor.tsx` — paired assessment-template and raport numeric-field labels and controls with required semantics, replaced the score selector with an exclusive keyboard-operable `ToggleGroup` with accessible names, added optimistic per-tap autosave with ABA-safe per-indicator revisions and actionable rollback, serialized and coalesced full-state writes behind a 2-second throttle capped at 30 request starts per minute, made explicit publish wait for in-flight autosaves and flush the latest state, and consolidated raport status chips on shared `StatusBadge`.
- Cluster 4 — Attendance + Journal: `app/admin/student-attendance/page.tsx`, `app/admin/student-journal/page.tsx`, `app/admin/student-journal/monitoring/page.tsx`, `app/admin/student-journal/classes/[id]/page.tsx`, `app/admin/student-journal/students/[id]/page.tsx`, `components/student-journal/category-accordion.tsx`, and `components/student-journal/__tests__/category-accordion.test.tsx` — paired required journal category/indicator labels and controls, added accessible names to week-navigation and reorder icon buttons, standardized destructive confirmation labels to `Ya, <Verb>`, and replaced the audit-trail action color ternary with shared `StatusBadge`. Review fixes make attendance void, note delete, and category/indicator deactivation toast exactly once and reject on failed responses or network errors so confirmations remain open and retryable; targets clear only on success, attendance always resets its pending state in `finally`, and the category-accordion regression test covers failure followed by a successful retry.
- Cluster 5 — Classes + Academic: `app/admin/classes/client.tsx`, `app/admin/classes/[id]/client.tsx`, `app/admin/semesters/client.tsx`, `app/admin/semesters/[id]/themes/client.tsx`, `app/admin/semesters/[id]/objectives/client.tsx`, and `app/admin/semesters/[id]/__tests__/accessibility.test.tsx` — paired required class, semester, theme, subtheme, and week labels and controls with `id`/`htmlFor`, `required`, and `aria-required` semantics; exposed selected academic objective filters with `aria-pressed`; and replaced nested theme/subtheme row interactions with sibling native selection and edit buttons. The reviewer fix preserves native Enter/Space selection and isolates edit activation so it does not select the row. Focused regression coverage verifies filter state semantics, sibling non-nested controls, both keyboard selection paths, and independent edit behavior.
- Cluster 6 — HR: `app/admin/(hr)/employees/page.tsx`, `app/admin/(hr)/employees/[id]/page.tsx`, `app/admin/(hr)/salary-components/page.tsx`, `app/admin/(hr)/employee-attendance/monthly/page.tsx`, and `app/admin/(hr)/__tests__/accessibility-contract.test.ts` — paired employee and salary-component labels with controls using stable `id`/`htmlFor` associations and native `required` or `aria-required` semantics, added accessible names to BPJS and employee salary-value controls, and gave every monthly attendance cell an employee/date/status `aria-label` with readable and locked-state context. Locked attendance cells are now disabled, and focused contract coverage guards the form and grid accessibility semantics.
- Subagent plan: driver=`gpt-5.5`; dirty-work=`gpt-5.6-terra` (low). Clusters 2–6 are independent and run in parallel by cluster after sequential Cluster 0/1 repair.

## Verification

_(filled by /build)_

- Focused StatusBadge assertions: `npx vitest run components/ui/__tests__/status-badge.test.tsx` — 11 passed, including the assessment-list `Dipublikasi` override while the shared default remains `Terbit`. Cross-checked the `design-system` status-badge palette families for representative admission/enrollment/audit statuses.
- Focused WeekGrid assertions: 2 passed. Full gate: build and Vitest passed — 253 files passed, 2 skipped; 2,455 tests passed, 42 todo.
- Cluster 0 final post-review gate: build green; Vitest with `--maxWorkers=1` passed — 258 files passed, 2 skipped; 2,470 tests passed, 42 todo.
- Cluster 1 — Settings: focused dialog and role-delete retry tests passed — 2 files, 3 tests. Final full gate passed: build and Vitest — 254 files passed, 2 skipped; 2,456 tests passed, 42 todo. Cross-checked the `design-system` AlertDialog reference and `ui.md` destructive-confirm contract for the exact `Ya, Hapus` label, pending behavior, and failure retry.
- Cluster 2 — Admissions + Enrollments: focused ESLint passed; focused StatusBadge + ConfirmDialog tests passed — 2 files, 14 tests; reviewer re-check passed focused ESLint, the same 14 focused tests, and `git diff --check` after adding stale-request abort handling and conversion error toast + rethrow/retry behavior. Full gate passed: build and Vitest — 256 files passed, 2 skipped; 2,461 tests passed, 42 todo. Cross-checked `design-system` form, Status Badge, DataTable, and AlertDialog references plus `ui.md` loading/empty/toolbar/confirmation contracts and `patterns.md` Admin List and Workflow Queue recipes.
- Cluster 3 — Assessments + Raport: focused ESLint passed; focused score-autosave UI and assessment-save API tests passed — 2 files, 9 tests, covering success, failure rollback with retry guidance, stale-failure/newer-tap and ABA races, 30-starts-per-minute coalescing, and publish wait/flush behavior. Shared `ToggleGroup` behavior was checked against current Base UI documentation via Context7. Final full gate passed: build and Vitest — 257 files passed, 2 skipped; 2,467 tests passed, 42 todo. Cross-checked the `design-system` Form, Controls, and Status Badge references plus `ui.md` accessibility and shared-component contracts.
- Cluster 4 — Attendance + Journal: focused failure/retry and confirmation tests passed — 3 files, 10 tests. After the category-accordion retry test timed out only under parallel full-suite load, its interactions were hardened from `userEvent` to `fireEvent`; it then passed 5 consecutive focused runs. Focused ESLint reported no errors; the existing `react-hooks/exhaustive-deps` warning in `app/admin/student-journal/classes/[id]/page.tsx` remains noted. Final full Vitest with `--maxWorkers=1` passed — 258 files passed, 2 skipped; 2,469 tests passed, 42 todo. Cross-checked the `design-system` Form, Status Badge, and AlertDialog references plus `ui.md` required-field, icon-button naming, shared-status, and destructive-confirmation contracts.
- Cluster 5 — Classes + Academic: focused accessibility Vitest passed — 1 file, 3 tests. Scoped ESLint reported no errors; three existing unused `react-hooks/set-state-in-effect` disable warnings remain in the semester, theme, and objective clients. Final build passed; reliable full Vitest with `--maxWorkers=1` passed — 258 files passed, 2 skipped; 2,469 tests passed, 42 todo. A default-parallel rerun encountered cross-suite resource timeouts; all 8 implicated files passed serially, 70/70 tests. Cross-checked the `design-system` Form and Controls references plus `ui.md` required-field, semantic-interaction, and accessible-filter contracts.
- Cluster 6 — HR: focused HR accessibility and attendance tests passed — 2 files, 11 tests. Scoped ESLint reported 0 errors; two pre-existing unused-import warnings remain in `app/admin/(hr)/employees/[id]/page.tsx` for `ArrowLeft` and `Link`. Final build passed; reliable full Vitest with `--maxWorkers=1` passed — 258 files passed, 2 skipped; 2,469 tests passed, 42 todo. Cross-checked the `design-system` Form, Controls, and attendance-grid references plus `ui.md` required-field and accessible-label contracts.
- Playwright: local run refused because `DATABASE_URL` points to remote Supabase and tests mutate data; required CI `Playwright E2E` gates merge; CTO will not merge on red. No remote DB override was used.

## Ship Notes

- Migrations: none.
- Environment variables: none.
- Preview smoke:
  1. Admissions/enrollment search and status filters, plus conversion confirmation failure and retry.
  2. Assessment score autosave, failure rollback, retry, and publish.
  3. Journal/attendance destructive-action failure retry and past-day attendance correction.
  4. Theme and HR keyboard plus screen-reader semantics.
- Rollback: revert the cycle commits.
