# P2 Spec-sync — canary shipped + foundation md `## Phase Status` ledger + CLAUDE.md ground-truth directive

## Context

Continuation cycle following `p2-scaffold-canary` (#199, staging tip `dbb817e`, merged 2026-05-07). Pure-docs / process cycle — no code under test, only documentation + skill-file + verifier-test edits.

**Trigger.** A new session received a hand-written cycle prompt that restated `ea00b9b` (#198 — pre-canary tip) as "current". The session correctly detected drift via `git log origin/staging` + cycle-doc presence check, halted, and asked for direction. Two structural surfaces caused the drift:

1. **Foundation rebuild md (`docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md`) carries phase decomposition + sprint plan + cycle list (§18.1 ~36-cycle decomposition).** It is not updated as cycles merge — sessions reading it consume a stale roadmap. §18.1 still shows phase 1 cycle 10 (`p1-auth-google-oauth`) unshipped (`[ ]`) despite being merged at PR #190 on 2026-05-06; phase 2 narrative says "3/9 shipped" when 7/9 have actually shipped.
2. **No structured "ground-truth check" surfaces the latest merged cycle to the assistant on session start.** `scripts/sync-staging.sh` fast-forwards the local staging branch but does not derive or print the most recent merged cycle name. Each session must re-derive from `git log` per-call.

**Fix shape (this cycle).** Add a structured `## Phase Status` ledger to the foundation md (one row per shipped cycle keyed on slug, columns: Phase / Cycle / Slug / Merged / PR / Tip Commit / Status). Backfill from `git log origin/staging --reverse 52112ee~1..origin/staging` since v2 rebuild start. Codify ledger maintenance: `/ship` post-merge appends the row; `/spec` preflight reads the ledger before drafting any new cycle doc and STOPs if the requested slug already appears `status=shipped` (with disambiguation guidance — refined re-spec uses `<slug>-followup` / `<slug>-v2`, not hard-block). Expand CLAUDE.md required-reading to name the foundation md `## Phase Status` literally + add a `## Ground-truth check` section naming `git log origin/staging --oneline -10` as a 5-second sanity step before drafting any cycle prompt.

**Authority split (codified in CLAUDE.md).** Foundation md `## Phase Status` = phase / cycle / sha grain (what shipped, when, where). README ADR table = constraint / decision grain (why something is the way it is). Both surfaces list shipped work but at different grains; the split is canonical and documented.

Marathon mode (foundation §18.12) — derives directly from observed drift. Skip `superpowers:brainstorming`.

**Required reading consumed:** `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` (§18.1, §18.12), `docs/cycles/2026-05-07-p2-scaffold-canary.md`, `docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md`, `docs/cycles/2026-05-07-p2-scaffold-pages.md`, `CLAUDE.md` (top-of-file v2-rebuild banner + Documentation Maintenance + Multi-LLM Safety), `README.md` (ADR table grain), `git log origin/staging --reverse 52112ee~1..origin/staging` (20 squash commits since 2026-05-04), `.claude/skills/spec/SKILL.md` (Preflight section), `.claude/skills/ship/SKILL.md` (Step 3 post-ship checklist), `scripts/__tests__/audit-vercel-env.test.ts` (vitest static-parse pattern), `vitest.config.ts` (worktree-exclusion semantics).

## Spec

### Acceptance criteria

- [x] **AC1 — Foundation md gains `## Phase Status` ledger.** Single canonical table, placed as `## 18A. Phase Status — shipped cycle ledger` (positioned between §18 heading + §18.1 cycle decomposition — adjacent to the cycle-state narrative this ledger replaces for ship-state). Columns: `Phase | Cycle | Slug | Merged | PR | Tip Commit | Status`. Rows ordered chronologically by merge date (oldest → newest). One row per shipped cycle. Bottom row = next cycle (`p2-spec-sync-canary-shipped`) with status=`next` and dashes for Merged / PR / Tip Commit (filled by post-merge update-in-place per AC3). §18.1 narrative gains a one-line pointer at top: *"Cycle ship state is canonical at §18A Phase Status (above) — this section retains planning narrative + per-phase cycle decomposition. Update §18.1 prose only when phase scope shifts; row-level status updates happen at §18A."*
- [x] **AC2 — CLAUDE.md required-reading + ground-truth check.**
  - Top-of-file v2-rebuild banner's "Read first" bullet list explicitly adds the foundation md `## 18A. Phase Status` as mandatory reading (named literally, with anchor `#18a-phase-status--shipped-cycle-ledger`).
  - New `## Ground-truth check` paragraph added under Multi-LLM Safety (or as a sibling top-level section between `## Multi-LLM Safety` and `## One-File-Per-Cycle Rule`) names `git log origin/staging --oneline -10` as a 5-second sanity step before drafting any cycle prompt. Naming + command verbatim. Paragraph also names cross-checking `## 18A. Phase Status` for the requested slug as the second sanity step.
  - Documentation Maintenance table gains a row clarifying the foundation md / README ADR authority split: foundation md = phase/cycle/sha grain (ship state); README ADR = constraint/decision grain (why). One row + a sibling explicit-negative sentence in the same table area: *"Do NOT add a README ADR row for routine cycle merges — only when the cycle introduces a new architecture decision or constraint. §18A is the canonical ship-state surface; duplicating cycle merges in README ADR causes drift between the two grain-distinct surfaces."*
- [x] **AC3 — `/ship` skill auto-appends or updates Phase Status row (post-merge).** `.claude/skills/ship/SKILL.md` Step 3 (Post-ship checklist) gains a new checklist bullet covering BOTH the append + update-in-place cases:
  > *"After CI green + manual `gh pr merge`, update `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` `## 18A. Phase Status` table:*
  > - *Match the cycle by exact-string equality on the `Slug` column (case-sensitive, no whitespace tolerance).*
  > - *If a row exists with `status=shipped` for this slug → no-op (already rowed). Print 'already rowed — no-op' and skip.*
  > - *If a row exists with `status=next` for this slug → UPDATE that row in-place: fill `Merged` (today's `YYYY-MM-DD`), `PR` (`#<number>` from the PR URL), `Tip Commit` (squash commit short-sha), `Status` (`shipped`). Do NOT append a new row.*
  > - *If no row exists for this slug → APPEND a new shipped row at the bottom of the table.*
  > - *Stage in a follow-up `chore(spec): update §18A row for <slug>` commit OR fold into the next cycle's first commit."*
- [x] **AC4 — `/spec` skill preflight gains ground-truth check.** `.claude/skills/spec/SKILL.md` Preflight section gains a new numbered step (placed between current step 4 "Branch hygiene?" and current step 5 "Current cycle already open?"):
  > *"Ground-truth check. Read the foundation md `## 18A. Phase Status` table. If the user's requested cycle slug already appears with `status=shipped`:*
  > - *PAUSE — do not write the cycle doc yet.*
  > - *Surface the matched row to the user (cite Phase / Slug / Merged / PR / Tip Commit verbatim).*
  > - *Use `AskUserQuestion` to ask: 'Slug `<slug>` already shipped at PR `<#PR>` (`<sha>`, merged `<date>`). Is this a follow-up cycle (rename to `<slug>-followup` or `<slug>-v2`)? Or did you want me to proceed with a different slug?'*
  > - *After the user confirms a disambiguated slug, proceed normally with Step 1.*
  >
  > *Match is exact slug equality (case-sensitive, full kebab-case string); substring matches do not trigger. This is informational, not a hard-block — its purpose is to catch session-start drift on hand-written prompts that restate a stale staging tip."*
- [x] **AC5 — Backfill rows for every merged cycle since 2026-05-04.** Walk `git log origin/staging --oneline --reverse 52112ee~1..origin/staging` and emit one row per squash commit. Expected count: **20 shipped rows + 1 next-row** for this cycle. Final ordered slug list:
  1. `p0-hard-delete-domain-code` (#178 / 52112ee / 2026-05-04)
  2. `p1-extensions-tenancy` (#179 / ff55b93 / 2026-05-05)
  3. `p1-identity-rls` (#180 / d1857ec / 2026-05-05)
  4. `p1-regions-seed` (#181 / fd44713 / 2026-05-05)
  5. `p1-employees-classes-sentra` (#182 / 93a42c6 / 2026-05-05)
  6. `p1-audit-timeline-files` (#183 / 371440b / 2026-05-05)
  7. `p1-scaffold-engine-skeleton` (#184 / fc87f31 / 2026-05-05)
  8. `p1-scaffold-renderers` (#185 / 21c648a / 2026-05-05)
  9. `p1-audit-write-middleware` (#186 / 1e6405f / 2026-05-06)
  10. `p1-timeline-registry` (#187 / 923ed62 / 2026-05-06)
  11. `p1-upload-route-sharp` (#188 / a2cb65b / 2026-05-06)
  12. `spec-sync-phase-1-actual` (#189 / 22fbac9 / 2026-05-06)
  13. `p1-auth-google-oauth` (#190 / b344b4f / 2026-05-06)
  14. `p2-students-guardians-household` (#191 / 02632e4 / 2026-05-06)
  15. `p2-guardians` (#192 / bd7e661 / 2026-05-06)
  16. `p2-scaffold-registries` (#193 / dd98ee9 / 2026-05-07)
  17. `spec-rebuild-foundation-rethink` (#194 / f8a289e / 2026-05-07)
  18. `p2-scaffold-pages` (#196 / ee8e7f2 / 2026-05-07) — note: PR #195 (`hotfix(spec): backend English / labels Indonesian rule`) is OPEN-not-merged at backfill time (verified via `gh pr view 195 --json state` → `OPEN`); ledger only tracks merged-to-staging cycles, so #195 is intentionally absent
  19. `p2-scaffold-pages-guardian-household` (#198 / ea00b9b / 2026-05-07)
  20. `p2-scaffold-canary` (#199 / dbb817e / 2026-05-07)
  21. `p2-spec-sync-canary-shipped` (— / — / — / `next`)
- [x] **AC6 — Tests:**
  - [ ] `scripts/__tests__/verify-phase-status.test.ts` — static `fs.readFileSync` parse of foundation md. Locate `## 18A. Phase Status` heading; parse the markdown table that follows; assert (a) ≥20 rows, (b) every row has exactly 7 cells, (c) sha column matches `^[0-9a-f]{7}$|^—$` (allow em-dash for `next` rows), (d) merged-at column is monotonic non-decreasing for `status=shipped` rows when sorted by row order, (e) every shipped row's PR column matches `^#\d+$`, (f) header row contains the literal column names `Phase`, `Cycle`, `Slug`, `Merged`, `PR`, `Tip Commit`, `Status`, (g) every shipped row's `Merged` column matches `^\d{4}-\d{2}-\d{2}$` (ISO 8601 date format — closes the date-format-drift hole that case (d) alone misses). ≥7 cases.
  - [ ] `scripts/__tests__/verify-claude-md-reading-list.test.ts` — static `fs.readFileSync` parse of CLAUDE.md. Assert (a) the v2-rebuild banner's "Read first" list contains a literal substring naming foundation md `## 18A. Phase Status` (with the anchor or section title verbatim), (b) the `## Ground-truth check` section exists as a `## ` heading, (c) the section body contains the literal command `git log origin/staging --oneline -10`, (d) the section body contains a literal reference to `## 18A. Phase Status`. ≥4 cases.
- [x] **AC7 — All gates green:**
  - `npx prisma generate` (sanity, no schema change)
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npx vitest run` — current count read at /build T0 (capture exact baseline); delta = AC6 = **+10 cases** (6 + 4). Note: `npx vitest run` is run from inside the worktree CWD; vitest config excludes `.worktrees/**` filter applies only to repo-rooted paths — running from worktree CWD picks up local tests fine (precedent: every prior worktree-based cycle).
  - **Playwright SKIPPED.** Pure-docs cycle per CLAUDE.md "Pure-docs cycles may skip Playwright — record the skip explicitly in Verification." No code-under-test changes; foundation md / CLAUDE.md / skill-md edits + 2 new vitest files only.
  - `bash scripts/verify-rls-coverage.sh` — 32/32 unchanged.
  - `bash scripts/verify-api-auth.sh` — unchanged.
  - `bash scripts/verify-pii-annotations.sh` — 5/5 unchanged.
  - `npm run scaffold:check` — 5/5 unchanged.

### Non-goals (explicit deferrals)

- **Auto-update `## 18A. Phase Status` from CI** (would require GitHub Action reading PR merge events). Manual `/ship` discipline first; codify in CI later if drift recurs across multiple cycles.
- **Drift detection between README ADR table + foundation md `## 18A. Phase Status`.** Overlap exists (both list shipped work). Authority split (constraint-grain vs cycle-grain) is codified in CLAUDE.md this cycle; mechanical drift detection (e.g. CI guard cross-checking the two surfaces) deferred to a separate doc-sync cycle if both surfaces accumulate inconsistencies.
- **Per-cycle test/file count rollup in `## 18A. Phase Status`.** Status / phase / sha / PR / merged-at only this cycle. Test-count + file-touched columns deferred — adds churn for limited reader value.
- **§18.1 `[x]` checkbox flip for already-shipped cycles.** §18.1 narrative still shows several shipped cycles as `[ ]`. The §18.1 prose pointer added in AC1 names §18A as canonical, redirecting readers; mechanical checkbox sync deferred (single-grain ledger at §18A is the authoritative surface — no benefit to dual-maintaining §18.1 markers).
- **Foundation md / CLAUDE.md cross-link audit.** Beyond the explicit AC2 additions, no broader sweep.
- **`/build` skill changes.** No /build edits this cycle (ledger maintenance lives in /ship + /spec only).

### Assumptions

1. The 20-row backfill is correct as-of 2026-05-07 and stable for the duration of this cycle. (No additional cycles will merge to staging while this cycle is in flight; if one does, the implementer prepends + commits a follow-up row before opening the PR.)
2. Vitest auto-discovery picks up `scripts/__tests__/*.test.ts` files (precedent: existing `audit-vercel-env.test.ts` works).
3. CLAUDE.md edit budget: top-of-file banner + new `## Ground-truth check` section + Documentation Maintenance table row addition. ~30 lines added; no removals.
4. Foundation md edit budget: insert ~30-line `## 18A` section between §18 heading and §18.1 + a 1-line pointer prefix on §18.1. No row removals or §18.1 narrative rewrite.
5. Authority-split codification fits as a single table-row addition + 1-line note in CLAUDE.md Documentation Maintenance section. No new top-level section needed.
6. The post-merge "append Phase Status row" step in /ship is a documented checklist item, not an automated script. Idempotency lives in the human review (slug match check) — no script enforces.

## Tasks

Pure-docs / docs+test cycle. 6 atomic tasks. Tasks T1-T4 are sequential (later tasks depend on earlier files); T5a/T5b can be parallel within the test-author task; T6 (README ADR + cycle-doc finalize) is end-of-cycle.

- [x] **T1 — Foundation md `## 18A. Phase Status` section + §18.1 prose pointer.** Edit `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md`. Insert new top-level `## 18A. Phase Status — shipped cycle ledger` immediately after the `## 18. Execution Plan + Workflow Adjustments` heading + its 1-paragraph intro, BEFORE `### 18.1 Cycle decomposition` — adjacent to the cycle-state narrative this ledger replaces for ship-state. Populate with the 21-row markdown table per AC5. Add a 1-line pointer at the top of §18.1 (immediately under the heading, above the existing "Phase-by-phase" lead-in) directing readers to §18A as canonical for ship state. *Acceptance:* AC1 + AC5 satisfied; foundation md gains 21 rows + 1-line §18.1 pointer; commit subject `docs(spec): foundation md §18A phase status ledger + §18.1 pointer`.
- [x] **T2 — CLAUDE.md required-reading expansion + Ground-truth check + authority-split row.** Edit `CLAUDE.md`. (a) Top-of-file v2-rebuild banner "Read first" bullet list adds the literal string naming foundation md `## 18A. Phase Status`. (b) New `## Ground-truth check` top-level section between `## Multi-LLM Safety` and `## One-File-Per-Cycle Rule` names `git log origin/staging --oneline -10` + cross-reference to §18A. (c) Documentation Maintenance table gains one row: `docs/superpowers/specs/...foundation-design.md` owns "phase decomposition + sprint plan + `§18A` Phase Status (cycle ship state at sha grain)" — distinguished from README ADR row's "constraint/decision grain". *Acceptance:* AC2 satisfied; all three insertions land; commit subject `docs(claude-md): foundation md required-reading + ground-truth check + authority-split row`.
- [x] **T3 — `/ship` skill post-merge ledger-append step.** Edit `.claude/skills/ship/SKILL.md` Step 3 (Post-ship checklist). Add the new checklist bullet per AC3 (verbatim text including idempotency-by-slug-match note + commit-subject suggestion). *Acceptance:* AC3 satisfied; ship skill carries the post-merge directive; commit subject `docs(skill): /ship post-merge phase-status ledger append`.
- [x] **T4 — `/spec` skill preflight ground-truth check.** Edit `.claude/skills/spec/SKILL.md` Preflight section. Insert the new numbered step per AC4 (between current step 4 and current step 5) with the slug-equality match logic + disambiguation guidance (`<slug>-followup` / `<slug>-v2` not hard-block). *Acceptance:* AC4 satisfied; spec skill preflight reads §18A before drafting; commit subject `docs(skill): /spec preflight ground-truth check vs phase-status ledger`.
- [x] **T5 — Vitest static-parse tests.** Author **two** new files in parallel: `scripts/__tests__/verify-phase-status.test.ts` (≥6 cases per AC6a) + `scripts/__tests__/verify-claude-md-reading-list.test.ts` (≥4 cases per AC6b). Run `npx vitest run` to confirm baseline + delta = +10 cases. *Acceptance:* AC6 + AC7 vitest delta satisfied; commit subject `test(spec): vitest static-parse for phase-status ledger + claude-md reading list`.
- [x] **T6 — README ADR row + cycle-doc finalize (Implementation/Verification/Ship Notes).** Add one row to `README.md` ADR table dated `2026-05-07` covering this cycle's authority-split + ground-truth-check codification. Fill the cycle doc's `## Implementation` (per-task files), `## Verification` (gate output incl. Playwright-skip note), `## Ship Notes` (no migrations / no env vars / no rollback risk; post-merge step: append `p2-spec-sync-canary-shipped` row to §18A with own sha + 2026-05-07 + this PR #). Run end-of-cycle gate (`npm run build && npx vitest run`). *Acceptance:* AC7 all-gates-green satisfied; README ADR + cycle doc complete; commit subject `docs: README ADR + cycle-doc finalize for p2-spec-sync-canary-shipped`.

Dependencies: T1 must precede T2 (T2 references §18A title verbatim). T2 must precede T5b (test asserts CLAUDE.md content). T1 + T2 must precede T3 + T4 (skill files reference both). T5 must precede T6 (gate runs cover tests). T6 last (closes ledger entry references for own PR #).

## Implementation

- **T1 — Foundation md §18A + §18.1 pointer.** Edited `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` line 1199 onward. New top-level heading `## 18A. Phase Status — shipped cycle ledger` inserted between §18 intro and `### 18.1 Cycle decomposition`. Body: 1-paragraph rubric (canonical surface, maintained by `/ship` Step 3, read by `/spec` Preflight, authority split with README ADR) + 21-row markdown table (20 shipped + 1 next) + 4 footnote bullets (slug match key, PR #195 OPEN-not-merged note, Phase 1 ledger-row count vs §18.1 cycle count, Phase 2 ledger growth note). §18.1 narrative gained a 1-line blockquote pointer at top: *"Cycle ship state is canonical at §18A Phase Status (above)..."*.
- **T2 — CLAUDE.md required-reading + Ground-truth check + Documentation Maintenance row.** Three insertions in `CLAUDE.md`:
  - Top-of-file "Read first" banner gained a new bullet: **MANDATORY: [Foundation Design Spec `## 18A. Phase Status — shipped cycle ledger`](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md#18a-phase-status--shipped-cycle-ledger)** (anchor verified by GitHub markdown derivation: lowercase, em-dash dropped, double hyphen from " — ").
  - New `## Ground-truth check` top-level section inserted between `## Multi-LLM Safety` (closes at "Auto-appended by `prepare-commit-msg`...") and `## One-File-Per-Cycle Rule`. Body: 5-second sanity sequence (`git log origin/staging --oneline -10` + cross-check `## 18A. Phase Status` for slug-shipped match) + a "Why this matters" closer.
  - Documentation Maintenance table: README row gained "constraint/decision grain — why something is the way it is" qualifier; CLAUDE.md row updated to mention "ground-truth check"; new row added for `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` owning "Foundation rebuild design + sprint plan + cycle decomposition + §18A Phase Status (cycle ship state at sha grain — what shipped, when, where)". Below the table, an "Authority split" paragraph + explicit-negative *"Do NOT add a README ADR row for routine cycle merges"* sentence codifies the boundary.
- **T3 — `/ship` skill Step 3 post-merge ledger-append.** Edited `.claude/skills/ship/SKILL.md` Step 3 (Post-ship checklist). New nested checklist bullet covers all three branches: `status=shipped` match → no-op; `status=next` match → UPDATE in-place; no match → APPEND. Slug match defined as exact-string equality (case-sensitive, no whitespace tolerance). Suggests commit-subject `chore(spec): update §18A row for <slug>`.
- **T4 — `/spec` skill Preflight ground-truth check.** Edited `.claude/skills/spec/SKILL.md` Preflight section. Inserted new step 5 (between previous step 4 "Branch hygiene?" and previous step 5 "Current cycle already open?", which became step 6). Steps: PAUSE → surface matched row → `AskUserQuestion` for disambiguation → resume on user confirmation. Match logic = exact slug equality, case-sensitive. `status=next` rows do not trigger the check (deliberate placeholder for current cycle).
- **T5 — Vitest static-parse tests.** Two new files in `scripts/__tests__/`:
  - [scripts/__tests__/verify-phase-status.test.ts](scripts/__tests__/verify-phase-status.test.ts) — 7 cases (a-g): row count ≥20, 7 cells per row, sha 7-char-hex-or-em-dash, monotonic merged-at, PR matches `^#\d+$`, header column names, ISO 8601 date format. Reads foundation md, parses §18A heading + table via regex.
  - [scripts/__tests__/verify-claude-md-reading-list.test.ts](scripts/__tests__/verify-claude-md-reading-list.test.ts) — 4 cases (a-d): banner names §18A literally, `## Ground-truth check` heading exists, ground-truth section contains `git log origin/staging --oneline -10`, ground-truth section cross-references `## 18A. Phase Status`. Helper `extractGroundTruthSection` slices section by next-`## `-heading boundary.
- **T6 — README ADR row + cycle-doc finalize.** Added one row to `README.md` Architecture Decisions table at the top of the date-sorted block (date 2026-05-07): "Canonical ship-state ledger — foundation md `## 18A. Phase Status` (sha-grain row per merged cycle); CLAUDE.md `## Ground-truth check` section + required-reading bump; `/ship` Step 3 update-in-place on slug match; `/spec` Preflight `AskUserQuestion` on shipped-slug match; authority split codified". Filled this cycle's Implementation / Verification / Ship Notes sections.

## Verification

End-of-cycle gate (per CLAUDE.md "Two-tier"):

- `npm run build` — green. Next 16.0.5 production build, 8 routes (ƒ /api/health, ƒ /api/upload, ƒ /auth/callback, ƒ /auth/error, ○ /legal/privacy, ○ /legal/terms, ○ /manifest.webmanifest, ƒ /opengraph-image). EXIT 0. Recorded in `/tmp/build.log`.
- `npx vitest run` — green. **47 test files / 1035 tests / 4 skipped / 0 failed**. Baseline at T0 = 1024 passing tests (45 files), confirmed delta = **+11 new cases** (7 from `verify-phase-status.test.ts` + 4 from `verify-claude-md-reading-list.test.ts`) + 2 new test files (45 → 47). Duration 20.54s. Recorded in `/tmp/vitest-final.log`. The earlier (pre-edit) local timing-flake (`select.test.tsx` + `confirm-dialog.test.tsx` timeouts on cold env w/ 787s environment setup) cleared on the warm second run — CI on staging tip `dbb817e` was green per `gh pr view 199 --json statusCheckRollup`.
- **Playwright SKIPPED** — pure-docs cycle per CLAUDE.md "Pure-docs cycles may skip Playwright — record the skip explicitly in Verification." No code-under-test changes; only doc/skill-md edits + 2 new vitest files.
- `npm run lint` — green. EXIT 0. 1 warning (`'_args' is defined but never used` in `lib/students/__tests__/nis-allocator.test.ts:52` — pre-existing on staging tip, not introduced by this cycle).
- `npm run typecheck` — green. EXIT 0. Prisma 7.6.0 client generation OK (224ms).
- `bash scripts/verify-rls-coverage.sh` — green. **32 / 32 tenant-scoped models** unchanged (no new schema models).
- `bash scripts/verify-api-auth.sh` — green. **4 / 4 routes** unchanged (no new API routes).
- `bash scripts/verify-pii-annotations.sh` — green. **5 / 5 known-PII fields** unchanged.
- `npm run scaffold:check` — green. **5 / 5 entities** validated (guardian-invitation / household / student / student-identifier / guardian).

Cross-checked design-system.html — N/A (no frontend diffs in cycle; no `app/**/*.{tsx,css}`, `components/**/*.tsx`, or `tailwind.config.*` changes — frontend gate Rule 4 does not apply).

## Ship Notes

- **No migrations.** No schema changes; `prisma generate` runs as a pre-typecheck side-effect only.
- **No env vars.** No new environment variables; no rotation needed.
- **No rollback risk.** All edits are documentation + skill-MD + vitest static-parse tests. Reverting the squash commit cleanly restores prior `## 18A` absence (hooks + workflow continue functioning at the prior pre-cycle state).
- **Post-merge action (per `/ship` Step 3 the cycle adds):** the row for `p2-spec-sync-canary-shipped` is currently `status=next` with `— / — / —` placeholders in the §18A table. After merging this PR, **UPDATE that row in-place**: fill `Merged` (today's `YYYY-MM-DD`), `PR` (`#<this-PR-number>`), `Tip Commit` (squash commit short-sha — first 7 chars), `Status` (`shipped`). Stage in the next cycle's first commit OR a `chore(spec): update §18A row for p2-spec-sync-canary-shipped` follow-up. Skipping this update leaves a stale `next` row for a shipped cycle and breaks the §18A invariant — the very drift this cycle exists to prevent.
- **No JTBD library update.** No user-facing capability change; `docs/uat/jobs/{admin,teacher,parent}.md` untouched.
- **Smoke-test on preview URL:** N/A (no runtime behavior change). Vercel staging deploy will succeed but exhibits no functional delta vs `dbb817e`.
- **Cleanup:** standard `bash scripts/cleanup-merged.sh --yes` from main checkout post-merge to remove the `.worktrees/p2-spec-sync-canary-shipped` worktree + `feat/p2-spec-sync-canary-shipped` local branch.
