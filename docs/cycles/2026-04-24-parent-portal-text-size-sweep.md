# Parent Portal Text-Size Sweep

## Context

Comprehensive code review cycle (`2026-04-24-comprehensive-code-review.md` §T6 #1 + #2) flagged 35+ `text-[11px]` hits plus a `text-[10px]` DAY_BASE label in `components/parent/kid-card.tsx:62`, breaching the `portal.md` banned-size grep gate. Standard says minimum text size is `text-xs` (12 px) across `app/parent/**`, `components/parent/**`, `components/portal/**`. The teacher portal was cleaned in cycle `parent-portal-polish-cycle-2` (2026-04-22) but the parent portal still leaks below-floor sizes after the recent visual overhaul. The gate exists because Pak Budi (PAUD/TKIT parent, mid-range Android + 4G) consistently missed 10–11 px muted labels in UAT and WCAG AA fails at that size on muted-foreground. This cycle restores the gate, fixes Day-strip overflow risk at 12 px, and lands a pre-commit hook rule so regressions cannot re-enter. We also sweep three residual `text-[9px]` hits (attendance day-row micro label, KidCard day-footnote, WeekGrid day micro) because Rule 5 will gate them and they are below-floor anyway.

## Spec

**Acceptance criteria**
- [ ] `grep -rn 'text-\[9px\]\|text-\[10px\]\|text-\[11px\]' app/parent components/parent components/portal` returns zero hits.
- [ ] All below-floor sizes replaced with `text-xs` (never `text-[12px]` arbitrary).
- [ ] KidCard day-strip renders the 5 weekday pills at 12 px without vertical overflow or letter clipping at 360 px width (iPhone SE baseline).
- [ ] `.githooks/pre-commit` Rule 5 rejects any staged diff introducing `text-[9px|10px|11px]` under `app/parent`, `components/parent`, `components/portal` with a clear error message pointing at `portal.md`.
- [ ] Playwright MCP visual verification on parent home (`/parent`), parent attendance (`/parent/attendance`), and parent invoices detail sheet shows legible copy with no layout regressions at 390×844.
- [ ] Cross-checked `design-system.html` §Portal text-size scale; no conflicts.
- [ ] `npm run build && npx vitest run` green between tasks; `npx playwright test` green before final commit.

**Non-goals**
- Household Overview ≥3-kid branch (separate cycle — review §T6 #6).
- Student-journal optimistic toggle (separate cycle — review §T6 #7).
- Teacher `error.tsx` fix (separate cycle — review §T6 #3).
- Any layout/typography redesign beyond the minimum needed to absorb 10 → 12 px in KidCard day-strip.

**Assumptions**
1. `text-xs` (12 px / 0.75rem with `line-height: 1rem`) is the one-size target for every below-floor hit; no label needs `text-sm` (14 px) for hierarchy reasons after sweep.
2. The 5 day pills in KidCard DAY_BASE fit 2 characters ("Sen", "Sel", etc. — actually 3 chars, abbreviated) inside `h-11 w-8` at 12 px; if not, loosen gap from `gap-1` and/or swap to `h-12`. Taken from portal.md rationale: "loosen layout rather than shrink text."
3. Rule 5 wording should match existing `pre-commit` Rule 4 (frontend-gate) style — fail-with-hint, print banned matches, suggest `text-xs`.
4. Playwright MCP == `mcp__plugin_playwright_playwright__*` in this session; dev server will be started by `preview_start` (or equivalent) for verification.
5. Dev server running against demo mode is sufficient for visual check — no seed changes needed.

## Tasks

- [x] **T1 — Bulk replace `text-[11px]` → `text-xs` across 7 parent files.**
  Files: `app/parent/page.tsx` (4 hits), `app/parent/attendance/page.tsx` (8 hits), `app/parent/invoices/client.tsx` (5 hits), `app/parent/invoices/invoice-detail-sheet.tsx` (13 hits), `app/parent/assessments-table.tsx` (2 hits), `app/parent/profile/page.tsx` (5 hits), `components/parent/kid-card.tsx` (2 hits at :93 and :126).
  Acceptance: `grep -rn 'text-\[11px\]' app/parent components/parent` returns zero; `npm run build && npx vitest run` green.
  Dependencies: none.

- [ ] **T2 — Fix `components/parent/kid-card.tsx:62` DAY_BASE + 9 px residues.**
  Change DAY_BASE `text-[10px]` → `text-xs`. Also sweep residual `text-[9px]`: `app/parent/attendance/page.tsx:243`, `components/parent/kid-card.tsx:113`, `components/portal/week-grid.tsx:87` → `text-xs`. Visually verify KidCard day-strip at 360 px and 390 px widths; if overflow, loosen gap or bump `h-11` → `h-12`. Commit adjustment with the text-size change.
  Acceptance: `grep -rn 'text-\[9px\]\|text-\[10px\]' app/parent components/parent components/portal` returns zero; KidCard day-strip legible and non-overflowing at 360 px.
  Dependencies: none (parallel with T1 possible — distinct hunks; sequence to avoid merge conflict in `kid-card.tsx`).

- [ ] **T3 — Add pre-commit Rule 5: block `text-[9px|10px|11px]` in parent-scope paths.**
  Edit `.githooks/pre-commit`. Rule 5 runs before existing rules exit OK; scans staged additions (`git diff --cached --`) for `text-\[(9|10|11)px\]` under `app/parent/`, `components/parent/`, `components/portal/`. If any, print banned matches with file:line, point at `portal.md`, suggest `text-xs`, exit 1. Add a test row in `scripts/test-hooks.sh` if that file is the living test table. Verify by staging a contrived `text-[11px]` elsewhere and confirming the hook blocks it.
  Acceptance: contrived `text-[11px]` in any of the three scope paths blocks commit with clear error; `text-[11px]` in `app/admin/` (out of scope) does NOT block; staging untouched code commits fine.
  Dependencies: T1 + T2 must land first (otherwise the hook self-blocks when committing T1/T2 themselves).

## Implementation

- Subagent plan: all 3 tasks sequential (T1/T2 share `components/parent/kid-card.tsx`; T3 depends on T1+T2). Executed inline in the loop.
- Task 1: bulk `text-[11px]` → `text-xs` — `app/parent/page.tsx`, `app/parent/attendance/page.tsx`, `app/parent/invoices/client.tsx`, `app/parent/invoices/invoice-detail-sheet.tsx`, `app/parent/assessments-table.tsx`, `app/parent/profile/page.tsx`, `components/parent/kid-card.tsx` (lines 93, 126). Mechanical `replace_all`; 39 occurrences swept. `feature-dev:code-reviewer` clean — cross-checked design-system.html §Portal text-size scale (min floor 12 px) and portal.md §69-72 banned list.

## Verification

- Task 1: `grep -rn 'text-\[11px\]' app/parent components/parent components/portal` → 0 hits. `npm run build` green. `npx vitest run` 233 passed / 2 skipped / 42 todo.

## Ship Notes
