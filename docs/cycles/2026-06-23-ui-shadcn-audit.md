# UI Shadcn Audit

## Context

CTO review of the existing UI implementation across admin, finance/HR, curriculum/raport, parent, teacher, public, and shared primitives found no P0 blockers, but several P1 consistency gaps in the surfaces users operate most: list pages that use `DataTable` without controlled search/filter/pagination, raw or pseudo tables where the admin list recipe requires `DataTable`, mobile forms still using desktop-only `Dialog`, stacked overlays in teacher leave, destructive mutations without `AlertDialog`/`ConfirmDialog`, and shared primitives that still permit drift from the Shadcn-first `design-system` standard. Intended outcome: make table/search/filter/form/modal behavior consistent enough that new modules can reuse one clear pattern instead of copying local exceptions.

## Spec

**Acceptance criteria**

- [ ] Shared primitives enforce the baseline: `DataTableToolbar` is controlled by parent state (`value` + `onValueChange` + reset affordance), deprecated `components/ui/form-field.tsx` is removed or rebuilt on `Field`, modal close labels use localized `Tutup`, and `ResponsiveFormDialog` remains the default form container.
- [ ] Admin list surfaces flagged by review are brought to the Recipe 1 block where row count can exceed 10: `DataTableToolbar`, search, status/domain filters, server-backed pagination where applicable, sortable `DataTableColumnHeader`, standard `DataTableRowActions`, `EmptyState`, and `Skeleton`.
- [ ] Finance/HR surfaces close the highest-value gaps: payments ledger gains search/filter/pagination and a view action; payroll-run detail table gains search/filter/pagination and standard view action; shared attendance override modal uses `ResponsiveFormDialog` + `Field`; fee/salary component lists get toolbar/status filtering and remove duplicate lifecycle controls.
- [ ] Curriculum/raport surfaces close P1 gaps: admin raport roster moves from raw table to `DataTable`; triwulan create/edit moves from inline card to `ResponsiveFormDialog`; unpublish/retract requires confirm; sentra assessment avoids manual sticky-save when daily-entry optimistic save applies; category/indicator builder gets labeled `Field` rows.
- [ ] Portal surfaces close P1 gaps: teacher leave no longer stacks `Sheet` + `Dialog`/`ConfirmDialog`; parent invoice history over 10 rows gets searchable/filterable table behavior; note compose uses responsive dialog/sheet and removes duplicate teacher modal; banned `text-[10px]`/`text-[11px]` portal text is gone.
- [ ] Public surfaces align with shared primitives: login card uses Shadcn `Card`, `Button`, `Separator`, `Field`, `Input`, `FieldError`/`Alert`, and `Skeleton`; `/daftar` gender selection uses `RadioGroup` + required field labels.
- [ ] Shared formatting/status drift is swept in touched surfaces: `StatusBadge`, `EmptyState`, `formatRupiah`, `formatDate`/`formatDateShort`, and `Progress` replace local badges, plain empty text, inline formatting, and hand-rolled progress bars.
- [ ] `design-system` verification is recorded for every frontend task, including relevant sections for DataTable, Forms, Overlays, Portal Shell, and Page Recipes.
- [ ] Tests cover primitive behavior and representative module flows: Vitest for controlled toolbar/reset and responsive/modal primitives; Playwright or component smoke for at least admin payments, admin raport, teacher leave, parent invoices, and public login.

**Non-goals**

- Redesigning visual identity, navigation IA, or color system beyond enforcing existing tokens and primitives.
- Solving data/business findings from UAT that are not UI component parity, such as multiple active academic years, staging fixture pollution, Xendit link failures, or admission source mutation.
- Rewriting every small static card list. Card lists under 10 items may remain if they have explicit empty/loading/error states and no table affordance is needed.
- Adding new Shadcn packages or alternate UI libraries.
- Changing API semantics except where server pagination/search/filter is required for an existing list.

**Review inputs**

- GPT-5.4 subagents reviewed admin core, curriculum/raport, finance/HR, teacher/parent portals, and public/shared primitives.
- Local grep review covered `DataTable`, `DataTableToolbar`, `DataTableRowActions`, `ResponsiveFormDialog`, raw `table`, raw `Label`, `window.confirm`, `animate-pulse`, inline formatting, banned portal text, hardcoded colors, and overlay usage.
- Chrome MCP staging smoke (2026-06-23, admin session on `annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`) verified representative findings: payments ledger has date/method filters but no search/pagination/view action; academic-years and fees have table/list gaps; salary components has 13 rows with no search/status filter and visible English `Close` in the dialog; student-journal monitoring shows one-page fabricated pagination; monthly attendance renders a dense 28-row raw grid.
- Chrome MCP staging smoke with the teacher account verified `/teacher/attendance`: `Cuti & Izin` is not exposed as a keyboard/accessibility action in the visible tree, opening it by visual click shows English `Close`, and `Ajukan Cuti` creates two simultaneous visible `role="dialog"` overlays (`Sheet` + nested form dialog).
- Chrome MCP staging smoke with the parent account verified `/parent/invoices`: 15 invoice/payment rows render as card-like buttons, with zero tables, zero search inputs, and no status/search/filter/pagination affordance despite 8 unpaid and 7 payment-history items.
- Fresh UAT input from `docs/uat/reports/2026-06-04-admin-teacher-full.md` contributed teacher assessment/empty-state and admin workflow context.
- Recent parent/teacher UAT reports from `docs/uat/reports/2026-04-25-parent.md` and `docs/uat/reports/2026-05-03-teacher.md` were read for portal context; findings are possibly stale where later cycles changed the same files.

**Assumptions** (correct now or `/build` proceeds with these)

1. Treat `app/admin/students/page.tsx`, `app/admin/guardians/page.tsx`, `app/admin/admissions/page.tsx`, `app/admin/invoices/page.tsx`, `app/admin/(hr)/employees/page.tsx`, `app/admin/assessment-templates/page.tsx`, and `app/teacher/class-attendance/page.tsx` as reference patterns to preserve and reuse.
2. Server-backed pagination/search is required for operational lists likely to grow, but small fixed configuration lists may keep client-side data if they still use the canonical toolbar/filter/action shape.
3. Portal long lists can use `DataTable` if the table is responsive and mobile-readable; if implementation proves poor on 375 px, a portal-specific table/list hybrid must still expose search/filter/sort equivalents.
4. `ConfirmDialog` is acceptable for destructive confirmation because it wraps `AlertDialog`; raw destructive `Dialog` submit is not.
5. This is one remediation cycle with prioritized slices. Lower-risk P2 polish not touched by these tasks becomes follow-up debt, not a blocker.

## Tasks

1. [x] **[T1] Shared primitive baseline** — update `DataTableToolbar` to controlled state with reset, remove/rebuild deprecated `FormField`, localize modal close copy, and add/adjust primitive tests. Acceptance: existing admin lists still compile; toolbar query can be reset from parent state; `rg "from \"@/components/ui/form-field\"" app components` returns no live consumers or only the rebuilt primitive.

2. [ ] **[T2] Admin list parity sweep** — apply the missing pieces of the canonical toolbar/search/filter/action/pagination shape to highest-impact admin-core gaps: classes list (preserve existing search/filters; add missing pagination/server contract if needed), semesters list, academic-years program/year lists, student-attendance monthly recap, student-journal class roll-up, and monitoring pagination. Acceptance: each touched list has explicit search/filter behavior where useful, proper empty/loading states, sortable headers, and no fake pagination.

3. [ ] **[T3] Finance/HR parity sweep** — fix payments ledger, payroll-run detail employee table, attendance override modal, fee components, salary components, monthly attendance empty state, and invoice batch progress. Acceptance: payments/payroll tables are operable with search/filter/pagination; override modal is responsive and `Field`-based; config lifecycle actions use one standard row action path; progress uses Shadcn `Progress`.

4. [ ] **[T4] Curriculum and raport sweep** — convert admin raport raw table to `DataTable`, move triwulan create/edit into `ResponsiveFormDialog`, confirm unpublish/retract, label category/indicator builder fields, and remove banned/raw controls in sentra assessment. Acceptance: no raw admin raport table; no inline triwulan create card; sentra UI matches daily-entry or has documented exception; `rg "text-\\[11px\\]" app/teacher components/teacher components/portal components/student-journal` returns no active portal UI hits.

5. [ ] **[T5] Portal flow sweep** — remove teacher leave overlay stacking, make note compose responsive/shared, add searchable/filterable parent invoice history for long lists, normalize portal dashboard header/quick-link recipe where low-risk, and sweep banned portal microtext/date formatting. Acceptance: one overlay open at a time in teacher leave; parent invoice history has search/filter/sort affordance for >10 rows; note compose uses one shared responsive component.

6. [ ] **[T6] Public form/auth sweep** — rebuild public login card with Shadcn primitives and migrate `/daftar` gender/required fields to shared form primitives. Acceptance: login states use `Button`, `Input`, `Field`, `Alert`/`FieldError`, `Skeleton`, and `Separator`; `/daftar` gender uses `RadioGroup`; visible behavior unchanged.

7. [ ] **[T7] Verification and docs** — run targeted Vitest, `npm run build`, targeted Playwright/component smoke for admin payments, admin raport, teacher leave, parent invoices, and login; update README/CLAUDE only if route/module counts or standards change; record `design-system` cross-checks in Verification. Acceptance: gates green or documented with exact blocker; no unrelated markdown files created.

## Implementation

- Subagent plan: all tasks sequential for now. T1 changes shared primitives used by T2-T6; after T1 stabilizes, later module sweeps may use bounded reviewer/worker subagents only when write sets are disjoint.
- Task 1: Shared primitive baseline — `components/ui/data-table-toolbar.tsx`, `components/ui/form-field.tsx`, `components/ui/dialog.tsx`, `components/ui/sheet.tsx`, primitive tests, and narrow Next 16 gate unblockers in API/page helper exports — made toolbar search parent-controllable with reset, rebuilt legacy `FormField` on `Field`, localized default close copy to `Tutup`, and moved test-only/page helper exports out of restricted route/page module exports.

## Verification

- Task 1: gates passed. Design-system cross-check: Forms, DataTable, and Overlays sections. Focused Vitest passed for toolbar/form-field/overlay primitives, campus route, Xendit health route, teacher slip helpers, and student-journal date helper. Production build passed via `prisma generate` + `next build --webpack` with local env loaded; default Turbopack build is blocked in this worktree by the existing `node_modules` symlink layout. Full Vitest passed: 210 files passed, 2 skipped; 2067 tests passed, 42 todo.

## Ship Notes
