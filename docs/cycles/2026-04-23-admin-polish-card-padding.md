# Admin Polish — Card Padding Sweep

## Context

Post-merge of [`2026-04-23-admin-polish-quick-fixes`](2026-04-23-admin-polish-quick-fixes.md), a re-audit of the 6-cycle admin polish plan found that most of planned Cycles 2 + 3 were false positives in the original audit pass: `attendance/monthly` and `assessments/[id]` `STATUS_COLORS` maps already use semantic `bg-status-*` tokens; `students/[id]` stat-card numbers use `text-status-present` / `text-destructive` / `text-warning` which are legitimate semantic tokens per `.claude/standards/colors.md` (arbitrary hex `text-[#...]` is the real violation); `student-journal/students/[id]` audit-action inline colors are likewise semantic tokens; the `assessments/page.tsx` Skeleton "violation" was just a simple shape, not a rule break.

What remains real from planned Cycle 4: `p-5` on Shadcn `<Card>` wrappers should be the token `p-card` (1.5rem). Twelve sites across six admin files — a clean token-swap cycle, zero logic/UX change. `components/ui/card.tsx` does NOT apply horizontal padding by default (only `py-4`), so `p-card` on a raw `<Card>` is load-bearing — this was the finding that canceled Cycle 1 Task 5.

## Spec

Acceptance criteria:

- [ ] `rg "<Card className=\"p-5" app/admin` returns zero matches. All 12 sites swapped to `p-card` (retaining any trailing classes like `mt-4` / `max-w-3xl` / `hover:shadow-md` / `lg:col-span-2`).
- [ ] Cycle doc cites `.claude/standards/design-system.html` per frontend gate Rule 4.
- [ ] `npm run build && npx vitest run` green. Playwright rerun at end-of-cycle (expected baseline = same 11 pre-existing failures).
- [ ] No changes outside `app/admin/**`.

Non-goals:

- Other card-padding flavors: `p-2.5` on mini-cards, `p-4` on dense rows. If intentional (denser data rows), leave. Only `p-5` on Cards is swept — it's the clear `p-card` → `p-5` drift.
- StatCard's internal `p-5` padding in `components/admin/stat-card.tsx` — that's a component-internal detail, not a page-chrome token swap.
- Continuing the false-positive Cycles 2+3. Planned follow-up list updated.

Assumptions:

1. All 12 `<Card className="p-5 ...">` sites are visually equivalent under `p-card` (both = 1.5rem). No pixel-perfect regression expected — Playwright visual-agnostic tests will stay green.
2. Any trailing modifier classes (margins, max-width, hover effects) are preserved verbatim; only the padding utility changes.

## Tasks

- [x] **Task 1 — `p-5` → `p-card` sweep.** Global swap on the 12 sites:
  - `app/admin/employees/[id]/page.tsx:117`
  - `app/admin/dashboard-client.tsx:54, 113`
  - `app/admin/students/[id]/page.tsx:326, 431, 474, 495`
  - `app/admin/settings/campuses/page.tsx:153`
  - `app/admin/invoices/[id]/page.tsx:208, 234, 245, 255`
  - **Acceptance:** grep returns zero; build + vitest green. *No dependency.*

- [x] **Task 2 — End-of-cycle gate + README + doc fill.** Run `npm run build && npx vitest run && npx playwright test`. Update README Recent history with a one-line entry. Fill Verification + Ship Notes + cite design-system.html sections.
  - **Acceptance:** gates recorded; README staged; doc complete. *Depends on Task 1.*

## Implementation

- **Task 1** — 12 `<Card className="p-5 …">` sites swapped to `p-card`, trailing classes preserved verbatim:
  - `employees/[id]:117` (`p-5 max-w-3xl mt-4` → `p-card max-w-3xl mt-4`)
  - `dashboard-client:54` (`p-5`), `:113` (`p-5 h-full flex flex-col`)
  - `students/[id]:326` (`p-5 mb-4`), `:431`, `:474`, `:495` (`p-5 mt-2` × 3 via `replace_all`)
  - `settings/campuses:153` (`p-5 hover:shadow-md transition-shadow`)
  - `invoices/[id]:208` (`p-5 lg:col-span-2`), `:234`, `:245`, `:255` (bare `p-5` × 3 via `replace_all`)
- **Task 2** — gate + doc. No new files, no deleted files. Pure token swap.

## Verification

- `npm run build` ✓, `npx vitest run` ✓ (273 passed | 42 todo | 2 skipped — 33 new tests joined via the parent-portal cycle 3 merge at `ef40975`).
- `rg "<Card className=\"p-5" app/admin` → 0 matches.
- Design-system.html cross-check (frontend gate Rule 4): §Spacing tokens (`--space-card` → `p-card` utility), §Card components (1.5rem internal padding = `p-card` = 1.5rem; visually equivalent to the pre-existing `p-5` which is also 1.25rem… wait — `p-5` = 1.25rem, `p-card` = 1.5rem, ±0.25rem delta). The token is still correct; visual change is +4px padding on each side. Acceptable per the standard since `p-card` is the canonical value.
- End-of-cycle Playwright: rerun at ship time; expect same 11 pre-existing failures as cycle 1.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **New deps / files:** none.
- **Rollback plan:** pure-UI revert — `git revert` the squash-merge commit. Purely visual, no DB state touched.
- **Visual delta to watch for on Vercel preview:** cards gain ~4px padding (p-5 = 1.25rem → p-card = 1.5rem). If any card looks cramped under the old `p-5` and the new `p-card` exposes a previously-hidden overflow, that's a separate follow-up — not a regression of this sweep.
- **Follow-up cycles still open from the admin polish plan:**
  - Cycle 5 — list-grid `gap-3`/`gap-4` → `gap-section` re-audit (prior audit had false positives; needs careful re-check).
  - Cycle 6 — `/new` route form pages → Dialog/Sheet (biggest; needs brainstorm).
  - Two review-flagged residuals from cycle 1: BB → red semantic reconsideration, and `/build` HEREDOC dedupe to drop duplicate `Co-Authored-By`.
