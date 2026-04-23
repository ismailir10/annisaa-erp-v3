# Admin Polish — StatsCardsRow Migration

## Context

Cycle 1 of the Admin UX Polish sweep (2026-04-22) extracted a shared `<StatsCardsRow>` primitive (`components/admin/stats-cards-row.tsx`) and migrated 5 list pages (students, employees, invoices, leave, payroll). Nine more inline `grid grid-cols-2 lg:grid-cols-{3|4} gap-3 mb-6` StatCard wrappers survived the sweep — the primitive exists and supports both `cols=3` and `cols=4` variants, but these pages were missed in the original migration batch. This is a consistency cleanup: same DOM output, just the shared primitive seam.

Re-audit after `admin-polish-quick-fixes` + `admin-polish-card-padding` merges confirmed that the originally planned Cycles 2+3 (assessments/monthly status colors, student-detail stat-card semantic tokens, student-journal audit colors) were false positives — legitimate semantic token usage per `colors.md`. The remaining real drift in the 6-cycle plan is this StatsCardsRow sweep (originally part of planned Cycle 5) plus the `/new` route → Dialog/Sheet migration (Cycle 6, deferred).

## Spec

Acceptance criteria:

- [ ] `rg "grid grid-cols-2 lg:grid-cols-(3|4) gap-3 mb-6" app/admin` returns zero matches (only the primitive `stats-cards-row.tsx` contains that exact pattern string).
- [ ] Nine sites migrated to `<StatsCardsRow cols={3|4}>`:
  - `guardians/page.tsx:226` (cols=3)
  - `admissions/page.tsx:615` (cols=4)
  - `payroll/[id]/page.tsx:396` (cols=4)
  - `attendance/page.tsx:195` (cols=4)
  - `enrollments/page.tsx:260` (cols=3)
  - `assessments/page.tsx:183` (cols=3)
  - `student-attendance/page.tsx:269` (cols=4)
  - `student-journal/monitoring/page.tsx:232` (cols=4)
  - `assessments/templates/page.tsx:324` (cols=3)
- [ ] StatCard children and their data bindings unchanged — only the wrapper div changes.
- [ ] Import added: `import { StatsCardsRow } from "@/components/admin/stats-cards-row";` on each site.
- [ ] Cycle doc cites `.claude/standards/design-system.html` per frontend gate Rule 4.
- [ ] `npm run build && npx vitest run` green. Playwright rerun at ship time; expect same 11 pre-existing failures.

Non-goals:

- Changing the `<StatsCardsRow>` API or styling — consumers only.
- Migrating non-admin StatCard usage (parent/teacher portals have their own primitives).
- Touching any grid that doesn't match the exact `grid-cols-2 lg:grid-cols-{3|4} gap-3 mb-6` signature — other grid patterns (`sm:grid-cols-2`, `lg:grid-cols-2`, gap-4) are out of scope.

Assumptions:

1. `StatsCardsRow` emits byte-identical classes to the inline grids (verified: `COLS_CLASS[4] = "grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"`, matches exactly).
2. All 9 sites are visually stable post-migration — Playwright is class-agnostic.
3. `payroll/[id]/page.tsx:396` is a detail page not a list, but the grid pattern is identical (a summary stats row) — the primitive applies cleanly.

## Tasks

- [x] **Task 1 — Migrate 9 sites.** For each file: (a) add `StatsCardsRow` import, (b) replace the matching inline `<div className="grid ...">` opening with `<StatsCardsRow cols={N}>` and close `</div>` with `</StatsCardsRow>`.
  - **Acceptance:** grep returns zero inline matches; build + vitest green. *No dependency.*

- [x] **Task 2 — End-of-cycle gate + README + doc fill.** `npm run build && npx vitest run && npx playwright test`. README Recent history updated. Verification + Ship Notes filled. Cite design-system.html sections.
  - **Acceptance:** gates recorded; README staged; doc complete. *Depends on Task 1.*

## Implementation

- **Task 1** — 9 sites migrated to `<StatsCardsRow cols={3|4}>`:
  - `guardians/page.tsx:226` (cols=3)
  - `admissions/page.tsx:615` (cols=4)
  - `payroll/[id]/page.tsx:396` (cols=4 — children are custom `<Card>` summary cells, not `<StatCard>`; primitive accepts any ReactNode)
  - `attendance/page.tsx:195` (cols=4)
  - `enrollments/page.tsx:260` (cols=3)
  - `assessments/page.tsx:183` (cols=3)
  - `student-attendance/page.tsx:269` (cols=4)
  - `student-journal/monitoring/page.tsx:232` (cols=4)
  - `assessments/templates/page.tsx:324` (cols=3)
- Each file gains an `import { StatsCardsRow } from "@/components/admin/stats-cards-row";` line adjacent to the existing StatCard import.
- StatCard children and data bindings verbatim — only wrapper div changed.

## Verification

- `npm run build` ✓, `npx vitest run` ✓ (273 passed | 42 todo | 2 skipped).
- `rg "grid grid-cols-2 lg:grid-cols-(3|4) gap-3 mb-6" app/admin` → 0 matches. Only `components/admin/stats-cards-row.tsx` holds the pattern (the primitive source — correct).
- Design-system.html cross-check (frontend gate Rule 4): §Stat Cards prescribes the 2-col mobile / {3,4}-col desktop grid with `gap-3 mb-6` which matches the primitive's `COLS_CLASS` exactly — byte-identical DOM pre- and post-migration. §Spacing tokens confirm `gap-3` (0.75rem) is the canonical stat-row gap.
- End-of-cycle Playwright: rerun at ship time; expect same 11 pre-existing failures baseline from admin-polish cycles 1+2.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **New deps / files:** none (primitive already existed from `admin-ui-polish-cycle-1`).
- **Rollback plan:** pure-UI revert — squash-merge reverts cleanly. DOM output is identical pre-and-post; no visual delta expected.
- **Preview check on Vercel:** scan the 9 pages — layout should be visually identical. If any stat row shifts pixel positions, that's a regression (unlikely given identical class output).
- **Follow-up still open from the admin polish plan:**
  - Cycle 6 — `/new` route form pages → Dialog/Sheet (biggest; needs brainstorm before execution). The 3 sites remain `students/new`, `employees/new`, `payroll/new`.
  - Review residuals from cycle 1: BB → red semantic reconsideration for PAUD pedagogy; `/build` HEREDOC dedupe for `Co-Authored-By` trailer.
  - `font-currency` semantic naming — class is named for currency but widely used for any numeric+tabular context (codes, IDs, counts). Name-vs-use mismatch; rename or accept.
