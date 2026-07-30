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
3. Cluster 2 — Admissions + Enrollments
4. Cluster 3 — Assessments + Raport
5. Cluster 4 — Attendance + Journal
6. Cluster 5 — Classes + Academic
7. Cluster 6 — HR

Clusters 1-6 touch disjoint files and only consume Cluster 0's shared components (don't edit them) — safe to implement in parallel once Cluster 0 lands and gates green.

## Implementation

_(filled by /build)_

- `c3c2e2f2` updated shared components: `app/globals.css` contrast tokens; `components/ui/button.tsx` default-button contrast; `components/ui/checkbox.tsx` indeterminate state; `components/ui/status-badge.tsx` admission/enrollment/audit mappings; `components/admin/dashboard/pending-actions.tsx` count-badge contrast; and `components/portal/week-grid.tsx` today-state, editable-past-day, and Jakarta-date fixes. Review fixes also updated the WeekGrid callers in `app/admin/student-journal/students/[id]/page.tsx` and `app/admin/students/[id]/page.tsx`. Added focused mapping coverage in `components/ui/__tests__/status-badge.test.tsx` and WeekGrid coverage in `components/portal/__tests__/week-grid.test.ts`.
- Cluster 1 — Settings: `app/admin/settings/{campuses,holidays,roles}/page.tsx`, `app/admin/settings/roles/__tests__/page.test.tsx`, `components/admin/deactivate-confirm-dialog.tsx`, and `components/admin/__tests__/deactivate-confirm-dialog.test.tsx` — corrected DialogClose composition and filter state semantics, paired required role fields with labels, standardized the role delete confirmation to `Ya, Hapus`, and ensured a failed delete keeps the dialog open for retry.
- Subagent plan: driver=`gpt-5.5`; dirty-work=`gpt-5.6-terra` (low). Clusters 2–6 are independent and run in parallel by cluster after sequential Cluster 0/1 repair.

## Verification

_(filled by /build)_

- Focused StatusBadge assertions: `npx vitest run components/ui/__tests__/status-badge.test.tsx` — 10 passed. Cross-checked the `design-system` status-badge palette families for representative admission/enrollment/audit statuses.
- Focused WeekGrid assertions: 2 passed. Full gate: build and Vitest passed — 253 files passed, 2 skipped; 2,455 tests passed, 42 todo.
- Cluster 1 — Settings: focused dialog and role-delete retry tests passed — 2 files, 3 tests. Final full gate passed: build and Vitest — 254 files passed, 2 skipped; 2,456 tests passed, 42 todo. Cross-checked the `design-system` AlertDialog reference and `ui.md` destructive-confirm contract for the exact `Ya, Hapus` label, pending behavior, and failure retry.

## Ship Notes

_(filled by /ship)_
