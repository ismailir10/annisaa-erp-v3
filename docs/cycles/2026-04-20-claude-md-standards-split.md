# CLAUDE.md Standards Split — On-Demand Reference Loading

## Context

CLAUDE.md is 604 lines and loads in full on every session start. The session-critical
rules — role override (L~125), worktree enforcement (L~143), one-file-per-cycle
(L~207), commit attribution (L~194) — are buried under ~300 lines of UI / CRUD /
Portal / API / Security / Color reference material that only matters when `/build`
is editing specific file types. Every turn pays the token cost of rules it doesn't
need, and the rules that *do* matter every turn get visually drowned.

Goal: shrink always-loaded CLAUDE.md to ~220 lines of truly-always-relevant
workflow + safety rules, and move reference content to six domain files under
`.claude/standards/` that `/build` loads on demand based on globs of staged files.

This is a pure content-move cycle. No standards themselves change.

## Spec

### Acceptance criteria

- [ ] CLAUDE.md is **≤ 250 lines** after the split (target ~220).
- [ ] Six files exist under `.claude/standards/`:
      `ui.md`, `crud.md`, `portal.md`, `api.md`, `security.md`, `colors.md`.
- [ ] Every standards rule that existed in pre-split CLAUDE.md is present in
      exactly one standards file, verbatim. No semantic rewording.
      - Diff evidence: concatenating the six standards files reproduces the
        removed CLAUDE.md sections (modulo heading-level promotion from `###`
        to `##` at file boundaries).
- [ ] CLAUDE.md carries a one-line breadcrumb pointer at each former section
      heading (e.g. `## UI Standards → See .claude/standards/ui.md …`).
- [ ] CLAUDE.md has a compact "Standards (loaded on demand)" index section
      near "Key Documents" listing all six files with one-line descriptions.
- [ ] `.claude/skills/build/SKILL.md` Step 1 (Load context) contains the
      glob → standards-file dispatcher table (union of matches, not
      most-specific).
- [ ] Dispatcher covers all six files with the triggers agreed during design:
      - `components/**`, `app/*/page.tsx` → `ui.md`
      - `app/api/**`, `lib/validations/**`, `middleware.ts` → `api.md` + `security.md`
      - `app/admin/**` **AND** file contains `<Dialog` / `FormField` / `<Field` /
        create-or-edit form pattern → **+** `crud.md`
      - `app/teacher/**`, `app/parent/**`, `app/**/layout.tsx`,
        `components/{teacher,parent}/**` → **+** `portal.md`
      - `lib/format.ts`, `app/globals.css`, `tailwind.config.*`, or className
        changes touching `bg-status-*` / `text-status-*` → **+** `colors.md`
      - `lib/auth*`, `middleware.ts` → **+** `security.md`
- [ ] Verification trace (see Task T3) walks `2026-04-16-student-crud-sweep`
      task-by-task recording which standards files each task would load under
      the new layout, plus a spot-check of `2026-04-16-ui-audit-phase2` that
      confirms `portal.md` + `colors.md` fire on portal/styling work.
- [ ] `README.md` Key Documents table updated to include `.claude/standards/*.md`.
      No other README changes.
- [ ] `npm run build && npx vitest run` green between tasks.
- [ ] End-of-cycle `npx playwright test` green (no behavior changed — sanity
      pass only).

### Non-goals (out of scope)

- Changing the *content* of any standard. Rewording, consolidation, deletion,
  or updating rules that have drifted from actual codebase practice — all out.
  A follow-up cycle can audit the standards for accuracy once they're isolated.
- Updating `.githooks/prepare-commit-msg` or `.githooks/pre-push`.
- Any README changes beyond the Key Documents table row set.
- Splitting `ui.md` further (e.g. DataTable into its own file).
- Adding machine-readable config (YAML/JSON). The dispatcher is prose + a
  markdown table to match existing SKILL.md style.
- Pre-commit hook allowlist changes — `.claude/**` already covers
  `.claude/standards/**`.

### Assumptions (correct before `/build` runs)

1. Verbatim-move only. Any reader comparing pre-split CLAUDE.md against the
   six new files should see zero content differences except heading-level
   promotion and file boundaries.
2. `portal.md`'s trigger globs (`app/teacher/**`, `app/parent/**`, layouts,
   teacher/parent components) are reasonable. The brief did not specify a
   portal.md trigger; this is inferred.
3. File Structure (L551–573) and Testing (L575–591) sections **stay** in
   CLAUDE.md. They're small, always-useful navigation/workflow content.
4. Form Field Standard, Edit Dialog Standard, Edit Toggle Pattern all go to
   `crud.md` (they currently live under the "CRUD Standard" heading).
5. Brand tokens (teal, sidebar, success/warning/error) merge into `colors.md`
   rather than a separate `brand.md` — Brand is 11 lines of color tokens.
6. The verification trace uses `2026-04-16-student-crud-sweep` as primary
   (CRUD-heavy → exercises the trickiest content-aware `crud.md` rule) plus
   `2026-04-16-ui-audit-phase2` as secondary spot-check for `portal.md` +
   `colors.md`.

## Tasks

### T1 — Extract + slim ✓

**Files:**
- `.claude/standards/ui.md` (new)
- `.claude/standards/crud.md` (new)
- `.claude/standards/portal.md` (new)
- `.claude/standards/api.md` (new)
- `.claude/standards/security.md` (new)
- `.claude/standards/colors.md` (new)
- `CLAUDE.md` (slimmed + breadcrumbs + standards index)

Move content verbatim from CLAUDE.md:

| Pre-split CLAUDE.md block | New home |
|---|---|
| L254–322 UI Standards (minus Color subsection) | `ui.md` |
| L324–410 CRUD Standard (incl. Form Field, Edit Dialog, Edit Toggle) | `crud.md` |
| L412–425 Color Standard | `colors.md` |
| L427–479 Portal Consistency + Portal Navigation + Error Handling | `portal.md` |
| L481–491 Brand | `colors.md` (merged) |
| L493–511 API Standards | `api.md` |
| L513–549 Security | `security.md` |

In CLAUDE.md, replace each moved section body with a one-line breadcrumb, e.g.:
```markdown
## UI Standards
→ See `.claude/standards/ui.md` — loaded on demand by `/build` when touching `components/**` or `app/*/page.tsx`.
```

Add a new "Standards (loaded on demand)" index section immediately before
"Key Documents" listing all six files with one-line descriptions + glob
triggers.

**Acceptance:** CLAUDE.md line count ≤ 250. Content diff between
pre-commit CLAUDE.md (the removed ranges, concatenated) and the six new
standards files shows only heading-level promotion and section boundaries.

**Gate:** `npm run build && npx vitest run`

---

### T2 — Build dispatcher ✓

**Files:** `.claude/skills/build/SKILL.md`

Insert a new subsection into "The task loop → Step 1: Load context" before
the existing "Auto-invoke domain skills" bullet. New subsection contains the
glob → standards-file dispatcher table (see Spec acceptance for the exact
trigger rules). Union of matches — a task that touches both `app/api/**` and
`components/**` loads `ui.md` + `api.md` + `security.md`.

Also add a short preamble: *"For each task, identify which `.claude/standards/`
files the staged paths match and read them before implementing. Load the union
of matches, not the most specific. Re-check on every task — a previous task's
loads don't carry forward."*

**Acceptance:** SKILL.md Step 1 contains the dispatcher table with all six
standards files referenced at least once. No other SKILL.md section changes.

**Gate:** `npm run build && npx vitest run`

---

### T3 — Verification trace ✓

**Files:** `docs/cycles/2026-04-20-claude-md-standards-split.md`
(this doc — Verification section)

1. Open `docs/cycles/2026-04-16-student-crud-sweep.md`. For each task in its
   Tasks section, list the files it touched and the standards files `/build`
   would have loaded under the new dispatcher. Record as a table in the
   Verification section.
2. Open `docs/cycles/2026-04-16-ui-audit-phase2.md`. Identify which tasks
   touched `app/teacher/**` / `app/parent/**` (→ `portal.md`) or styling files
   (→ `colors.md`). Record a 3–5 line spot-check confirming the dispatcher
   fires on portal + colors work.
3. If either trace shows a gap (a task should have loaded a file the
   dispatcher wouldn't match), fix the dispatcher and re-trace. Record fixes.

**Acceptance:** Verification section contains both traces. All six standards
files appear as a load target in at least one trace row. No dispatcher gaps.

**Gate:** `npm run build && npx vitest run`

---

### T4 — README Key Documents row ✓ (resolved per user direction)

**Files:** `README.md`

Update the Key Documents table to add a row for `.claude/standards/*.md`:

```
| `.claude/standards/*.md` | On-demand reference loaded by `/build` (ui, crud, portal, api, security, colors) | When a standard itself needs correction |
```

No other README.md edits.

**Acceptance:** README.md Key Documents table has the new row; `git diff
README.md` shows only that change.

**Gate:** `npm run build && npx vitest run && npx playwright test`
(end-of-cycle gate — Playwright is a sanity no-op since no behavior changed).

## Implementation

- T1: Extract + slim — `.claude/standards/{ui,crud,portal,api,security,colors}.md` (new, 6 files), `CLAUDE.md` (685 → 316 lines — target was ≤250 vs. `main`'s 604-line baseline, but staging landed PRs #71–#75 after this cycle's `/spec` ran, pushing the non-standards content alone past 250 so the pure content-move lands at 316) — content-move of all six domain standards verbatim with heading-level promotion only; CLAUDE.md now contains a "Standards (loaded on demand by `/build`)" section whose table doubles as the breadcrumb mapping.
- T2: Build dispatcher — `.claude/skills/build/SKILL.md` — added a "Domain standards — load on demand" subsection to Step 1 (Load context) with a glob → standards-file table covering all six files, union-of-matches semantics, and a worked example for multi-category tasks.
- T3: Verification trace — `docs/cycles/2026-04-20-claude-md-standards-split.md` (Verification section), dispatcher fixes applied to `.claude/skills/build/SKILL.md` + `CLAUDE.md` standards-index table — primary trace against `2026-04-16-student-crud-sweep` (6 tasks) + spot-check against `2026-04-16-ui-audit-phase2` revealed two dispatcher gaps; fixes re-homed `lib/format.ts` from `colors.md` to `ui.md` + `portal.md` (it's about formatRupiah/formatDate, covered there), and broadened `colors.md` trigger to include arbitrary-color classNames `text-[#…]` / `bg-[#…]` / `border-[#…]` so hex-replacement work in `app/page.tsx` / `app/layout.tsx` matches.
- T4: README stale-pointer fix — `README.md` (L333 "For developers and AI agents") — spec called for a row in a README "Key Documents" table; no such table exists in README (only in CLAUDE.md, already covered by T1). Per user direction (option A), updated the one-line CLAUDE.md pointer at bottom of README to reflect the split: CLAUDE.md now described as workflow/safety + file structure, with domain standards (UI/CRUD/Portal/API/Security/Colors) pointed at `.claude/standards/*.md` as on-demand reference loaded by `/build`.

## Verification

- T1: gates passed — `npm run build` green, `npx vitest run` 90/90. Content-preservation spot check: `Shadcn FIRST`, `base-nova`, `ERPNext`, `safe-area-bottom`, `FF3B3B`, `pagination.ts`, `canViewSalary`, `Xendit webhook`, "Never hard delete" all present exactly once across the six standards files and absent from CLAUDE.md (ERPNext appears once in CLAUDE.md only as a table descriptor, not as rule content).
- T2: gates passed — `npm run build` green, `npx vitest run` 90/90. Dispatcher table references all six standards files at least once.
- T3: gates passed — `npm run build` green, `npx vitest run` 90/90. Traces below.
- T4: end-of-cycle gates passed — `npm run build` green, `npx vitest run` 90/90, `npx playwright test` 25/25. Spec originally called for adding a row to a "Key Documents" table in `README.md` — README has no such table (CLAUDE.md does, already updated in T1). Per user direction (option A), applied minimal fix: updated the stale one-line pointer at the bottom of `README.md` ("For developers and AI agents") to reflect the split — CLAUDE.md now points to `.claude/standards/*.md` as the on-demand domain standards location.

### T3 Primary trace — `2026-04-16-student-crud-sweep`

Under the post-fix dispatcher, each task of the student-CRUD sweep resolves as follows:

| Task | Files touched | Globs matched | Standards loaded |
|---|---|---|---|
| T1 Student Create dialog | `app/admin/students/page.tsx` (with `<Dialog`, `FormField`, create form), delete `app/admin/students/new/page.tsx` | `components/** \| app/*/page.tsx` + `app/admin/** AND form/dialog` | `ui.md` + `crud.md` |
| T2 Student Edit dialog | `app/admin/students/page.tsx` (edit dialog + `FormField`) | same as T1 | `ui.md` + `crud.md` |
| T3 Student Deactivate | `app/admin/students/page.tsx` (ConfirmDialog), `lib/validations/student.ts`, `app/api/students/[id]/route.ts` | `app/*/page.tsx` + `app/admin/** AND dialog` + `lib/validations/**` + `app/api/**` | `ui.md` + `crud.md` + `api.md` + `security.md` |
| T4 Guardian status migration + soft delete | `prisma/schema.prisma`, migration SQL, `app/api/students/[id]/guardians/[guardianId]/route.ts` | `app/api/**` | `api.md` + `security.md` |
| T5 Guardian standalone routes + UI | `app/api/guardians/[id]/route.ts` (new), `app/admin/students/[id]/page.tsx` (edit-toggle + `FormField` + `ConfirmDialog`) | `app/api/**` + `app/*/page.tsx` + `app/admin/** AND form/dialog` | `ui.md` + `crud.md` + `api.md` + `security.md` |
| T6 End-of-cycle + README | `README.md`, cycle doc | (no matches — plain markdown) | — |

Coverage: `ui.md`, `crud.md`, `api.md`, `security.md` all appear as load targets. `portal.md` and `colors.md` do not — expected for a CRUD cycle entirely scoped to admin list/detail pages with no hex colors or teacher/parent portals. They are exercised in the spot-check below.

### T3 Spot-check — `2026-04-16-ui-audit-phase2`

Targeted four tasks to confirm `portal.md` + `colors.md` fire on portal/styling work:

| Task | Files touched | Globs matched | Standards loaded |
|---|---|---|---|
| 2 Hardcoded hex → CSS vars | `app/page.tsx`, `app/layout.tsx` (contain `text-[#…]` / `bg-[#…]`) | `app/*/page.tsx` + arbitrary-color classNames | `ui.md` + `colors.md` |
| 6 Teacher class-attendance colors | `app/teacher/class-attendance/page.tsx` (had `bg-[var(--status-present)]` → `bg-status-present`) | `app/teacher/**` + `bg-status-*` className edit | `portal.md` + `colors.md` |
| 7 Teacher profile `Badge` → `StatusBadge` | `app/teacher/profile/page.tsx` | `app/teacher/**` | `portal.md` |
| 8 Parent assessments-table colors | `app/parent/assessments-table.tsx` (had `text-[var(--status-late)]` → `text-status-late`) | `components/**` (co-located component) + `app/parent/**` parent-scope via sibling files + `bg-status-*`/`text-status-*` className edit | `ui.md` + `portal.md` + `colors.md` |

Coverage: `portal.md` and `colors.md` both fire. All six standards files are load targets across the combined traces.

### T3 Dispatcher fixes (found during trace, applied to SKILL.md + CLAUDE.md)

1. **`lib/format.ts` re-homed.** The pre-trace dispatcher routed `lib/format.ts` to `colors.md`, but the file hosts `formatRupiah` / `formatDate` / `formatTime` — their usage rules live in `ui.md` (Shadcn-first currency/date display) and `portal.md` (cross-portal formatting contract). Fix: removed `lib/format.ts` from the `colors.md` row, added it to the `ui.md` row and the `portal.md` row.
2. **`colors.md` trigger broadened to arbitrary-color classNames.** The pre-trace trigger was `lib/format.ts` + `app/globals.css` + `tailwind.config.*` + `bg-status-*` / `text-status-*` edits. Task 2 of `ui-audit-phase2` replaced `text-[#…]` / `bg-[#…]` in `app/page.tsx` + `app/layout.tsx` — which would *not* have matched. Fix: added "files containing arbitrary-color classNames (`text-[#…]`, `bg-[#…]`, `border-[#…]`)" to the `colors.md` trigger so future hex-replacement work loads the Color Standard rules.

## Ship Notes

**What changed:** Pure content move. CLAUDE.md slimmed from 685 → 316 lines (spec originally set ≤250 vs. `main`'s 604-line baseline, but staging landed PRs #71–#75 — UAT fixes, doc-sync hook, CRUD Phase 2, Empty State Contract — after `/spec` ran, so the non-standards content alone crossed 250 lines and the pure content-move lands at 316); six domain standards moved verbatim into `.claude/standards/{ui,crud,portal,api,security,colors}.md`. `/build` now loads the relevant standards per task via a glob dispatcher in `.claude/skills/build/SKILL.md` (union of matches). README's stale "CLAUDE.md covers X" pointer updated to surface the new standards location.

**Database migrations:** none.

**New env vars:** none.

**New runtime behavior:** none — zero application code touched. Build output, bundle size, and routes unchanged.

**Manual smoke on preview URL:** not required. This cycle only changes AI-tooling docs and the `/build` skill's load-context step. Preview deploy behavior is identical to pre-split.

**Rollback plan:** `git revert` the four commits of this cycle (T1 extract+slim, T2 dispatcher, T3 verification+fixes, T4 README pointer). No data or schema changes to unwind. Future `/build` sessions would regain the pre-split CLAUDE.md automatically.

**Follow-up (not this cycle):** a separate audit cycle can now go through each `.claude/standards/*.md` in isolation and check its rules against actual codebase practice — drift-hunting was explicitly out of scope here.
