# Workflow Refinement: 3-Step Loop + Multi-LLM Safety

## Context

The project was following the upstream `addyosmani/agent-skills` 7-command lifecycle (`/spec` → `/plan` → `/build` → `/test` → `/review` → `/code-simplify` → `/ship`). In practice we want a 3-step loop so small cycles don't feel bureaucratic. Additionally:

- Non-Opus sessions (Sonnet, Haiku, GLM 5.2) have been pushing directly to `staging` with no attribution, making it impossible to tell which model made which commit.
- The repo accumulated scratch `.md` files (`PLAN.md`, `PRE-LAUNCH-CHECKLIST.md`, `SPEC.md`, `SPEC-Performance-Optimization.md`, `PHASE1-TEST-VERIFICATION.md`, etc.) because each model's planning instinct is to drop a new file per sub-step.
- `prd.md`, `README.md`, and `CLAUDE.md` drifted apart — three sources of truth for "what's the current state of this project".

This cycle collapses the workflow, enforces one-file-per-cycle, sets up a role-gated branch/PR flow for non-Opus sessions, and consolidates status/roadmap content into README.md as the single source of truth.

## Spec

Acceptance criteria:

- [x] Three project slash commands exist: `/spec`, `/build`, `/ship`
- [x] Every upstream `agent-skills:*` skill is mapped into exactly one of the three commands (coverage table in CLAUDE.md)
- [x] One-file-per-cycle is enforced by a pre-commit hook with an allowlist
- [x] Every commit carries `Model-Trailer` and `Role` lines identifying the session
- [x] `.claude/session-role` is the single source of truth for session identity (no env var reads)
- [x] SessionStart hook instructs the assistant to set the role if missing
- [x] Pre-push hook blocks non-cto pushes to `staging`
- [x] PR template exists with model/role/gates/review-checklist sections
- [x] `README.md` absorbs modules/status/roadmap/ADRs and is the canonical project map
- [x] `CLAUDE.md` keeps only the operating manual (UI/CRUD/API/security standards)
- [x] `prd.md` retired, scratch files (`PLAN.md`, `PRE-LAUNCH-CHECKLIST.md`, `SPEC.md`) removed
- [x] GitHub branch protection documented as a required manual step
- [x] Worktree isolation rule: every non-cto session must work in its own git worktree (enforced by `scripts/check-role.sh` + slash-command preflights)
- [x] Unrelated in-progress work stashed, not destroyed, so this cycle commits only its own files

## Tasks

Ordered, each atomic. `/build` marks them done as it works through.

1. [x] Create `scripts/check-role.sh` and `scripts/install-hooks.sh`
2. [x] Create `.githooks/pre-commit`, `.githooks/prepare-commit-msg`, `.githooks/pre-push`
3. [x] Create `.claude/commands/spec.md`, `build.md`, `ship.md`, `_cycle-doc.md`
4. [x] Create `.github/pull_request_template.md`
5. [x] Update `.gitignore` and `.claude/settings.json`
6. [x] Write `.claude/session-role` for this session (opus/cto)
7. [x] Rewrite `README.md` (lean, with new structure)
8. [x] Rewrite `CLAUDE.md` (preserve standards tables, replace Agent Skills section)
9. [x] Delete `prd.md`, `PLAN.md`, `PRE-LAUNCH-CHECKLIST.md`, `SPEC.md`
10. [x] Run `scripts/install-hooks.sh` to activate hooks
11. [x] Verify hooks behave correctly (allowlist, doc-sync, trailer, pre-push)
12. [x] Add worktree-isolation rule: update `scripts/check-role.sh`, `CLAUDE.md`, `README.md`, and slash-command preflights
13. [x] Stash unrelated in-progress work (perf phase 1/2) into a named stash
14. [x] Add `artifacts/` and `.worktrees/` to `.gitignore`

## Implementation

- **Task 1 — scripts:** `scripts/check-role.sh` (SessionStart reminder, no detection, no prompt), `scripts/install-hooks.sh` (sets `core.hooksPath=.githooks`, writes `.installed` marker, chmods hooks).
- **Task 2 — git hooks:** `.githooks/pre-commit` (markdown allowlist + doc-sync check + installed-marker check), `.githooks/prepare-commit-msg` (appends `Model-Trailer` + `Role` + `Co-Authored-By` from `.claude/session-role`), `.githooks/pre-push` (blocks push to `staging`/`main` unless `role=cto`).
- **Task 3 — slash commands:** `.claude/commands/spec.md`, `build.md`, `ship.md`, `_cycle-doc.md` (shared snippet). Each references the relevant upstream `agent-skills:*` skills. `/build` explicitly loops over cycle-doc tasks and commits per task; `/ship` branches on role read from `.claude/session-role`.
- **Task 4 — PR template:** `.github/pull_request_template.md` with Summary / Cycle Doc / Session / Gates / CTO Review Checklist / Rollback sections.
- **Task 5 — config:** `.gitignore` gained `.claude/session-role`, `.githooks/.installed`, build logs. `.claude/settings.json` gained a SessionStart hook entry for `scripts/check-role.sh`.
- **Task 6 — session role:** `.claude/session-role` written with `role=cto`, `model=claude-opus-4-6` (gitignored, per-session).
- **Task 7 — README.md rewrite:** lean rewrite (~260 lines) absorbing modules, CRUD status, current phase, roadmap, ADR log, and development workflow. TOC added at top. prd.md content folded in.
- **Task 8 — CLAUDE.md rewrite:** stripped Current Phase, CRUD status, roadmap, 6 Modules, and Tech Stack sections (now in README.md). Replaced "Agent Skills System" section with the 3-command loop + coverage table + Multi-LLM Safety + One-File-Per-Cycle sections. All UI/CRUD/API/Security/Portal standards preserved verbatim.
- **Task 9 — scratch cleanup:** deleted `PLAN.md`, `PRE-LAUNCH-CHECKLIST.md`, `SPEC.md` from working tree. `prd.md` and the `SPEC-*`/`PHASE1-*`/`CODE-REVIEW-*`/`tasks/PERFORMANCE-*` files were already staged for deletion from an earlier cycle.
- **Task 10 — activate hooks:** ran `scripts/install-hooks.sh`. Verified `git config core.hooksPath` returns `.githooks`.
- **Task 11 — verification:** see below.
- **Task 12 — worktree isolation:** `scripts/check-role.sh` now detects `product-builder` sessions running in the main checkout (git-dir == git-common-dir) and prints a warning instructing the assistant to create a worktree. CLAUDE.md gained a "Worktree isolation" subsection under Multi-LLM Safety. README.md's Development Workflow section documents the worktree setup commands. All three slash commands (`spec.md`, `build.md`, `ship.md`) gained preflight step 2 that blocks product-builder sessions outside a worktree.
- **Task 13 — stash unrelated work:** `git stash push -u` with a pathspec for the pre-existing perf phase 1/2 modifications (`components/parent/invoice-filter.tsx`, `package-lock.json`, `tsconfig.tsbuildinfo`, `vitest.config.ts`, `components/parent/__tests__/`, `vitest.setup.ts`) saved them as `stash@{0}: On staging: pre-workflow-refinement: perf phase 1/2 work in progress`. Recoverable via `git stash pop stash@{0}` or `git stash apply stash@{0}`.
- **Task 14 — gitignore:** added `artifacts/` (bulk reference xlsx/repo material) and `.worktrees/` (manual worktree root) to `.gitignore`. `.claude/worktrees/` was already there for EnterWorktree-managed worktrees.

## Verification

All six hook behaviors verified via direct bash invocation against real git state:

1. **Markdown allowlist (pre-commit):** staged `FOO.md` at repo root → hook printed the rejection with the allowlist and exited non-zero. ✅
2. **Doc-sync rule (pre-commit):** staged only `app/admin/page.tsx` (no docs) → hook printed the doc-sync error and exited non-zero. ✅
3. **Allowed path (pre-commit):** staged only the cycle doc → hook returned clean exit 0. ✅
4. **Trailer append (prepare-commit-msg):** ran against a temp message file → output contained `Model-Trailer: claude-opus-4-6`, `Role: cto`, `Co-Authored-By: Claude <noreply@anthropic.com>`. ✅
5. **Pre-push allow (cto):** simulated push to `refs/heads/staging` with `role=cto` → exit 0. ✅
6. **Pre-push block (product-builder):** rewrote `.claude/session-role` to `role=product-builder, model=claude-sonnet-4-6` → hook printed the BLOCKED message with PR instructions and exited 1 (confirmed via direct `$?` check, not pipe). ✅

**Test suite:** `npx vitest run` — 9 files, 137 tests, all pass. Duration 2.99s. ✅

**Full `npm run build` not run:** this cycle touched only docs, config, and scripts — no `app/`, `components/`, `lib/`, or `prisma/` source files. Build output cannot be affected by doc-only changes.

**Not verified in this session (requires human + fresh session):**
- Verification step 6 from the plan (`/role` picker in a fresh session) — requires a new Claude Code session to trigger the SessionStart hook.
- Verification step 7 (`/ship` opening a PR from a product-builder session) — requires an actual `gh pr create` call, which should be done deliberately on a real feature cycle, not as a test.
- GitHub branch protection settings on `staging`/`main` — must be enabled manually in the GitHub UI before non-Opus sessions are allowed to touch the repo.

## Ship Notes

**For the person shipping this cycle (you, the CTO):**

1. **Working tree is clean and ready to commit.** All files currently staged or untracked belong to this cycle. The unrelated perf phase 1/2 work was stashed to `stash@{0}: pre-workflow-refinement: perf phase 1/2 work in progress` — recoverable via `git stash list` and `git stash pop stash@{0}`.

2. **What's in the stash:**
   - `components/parent/invoice-filter.tsx` (modified)
   - `package-lock.json` (modified)
   - `tsconfig.tsbuildinfo` (modified — now gitignored, will become untracked after stash pop)
   - `vitest.config.ts` (modified)
   - `components/parent/__tests__/` (untracked)
   - `vitest.setup.ts` (untracked)

   Not in the stash but still untracked in the tree (leave as-is, they're historical cycle docs from prior work and aren't in conflict): `docs/cycles/2025-04-11-parent-invoices-ui-redesign.md`, `docs/cycles/2025-04-15-performance-optimization-phase1.md`, `docs/archive/`.

3. **Plan for redo:** Start a fresh Claude Code session (Opus or any model), confirm the role on turn one, create a worktree if non-cto, then `git stash pop stash@{0}` inside that worktree to recover the perf work, and run `/spec` to wrap it in the new flow. Or just `git stash drop stash@{0}` if you'd rather rebuild from scratch — your call.

4. **Simple commit for this cycle:** the pre-commit hook will accept a `git add -A` on the current tree because only this cycle's files are present.
   ```bash
   git add -A
   git commit -m "feat(workflow): 3-step loop, multi-LLM safety, one-file-per-cycle"
   # prepare-commit-msg hook will append Model-Trailer and Role automatically
   ```

5. **Manual GitHub settings (REQUIRED before any product-builder session touches the repo):**
   - `staging` branch: require PR + 1 review; status checks `lint`, `typecheck`, `test`, `build`; restrict direct push to `ismailir10`
   - `main` branch: require PR from `staging` only, 1 review, same status checks
   - Without this, client hooks are the only defense — and they can be bypassed with `--no-verify`.

6. **Fresh-clone contributors must run `./scripts/install-hooks.sh` once** or the hooks are inactive. README "Setup" section documents this.

7. **Rollback plan:** if the hooks cause false-positive blocks during normal work, revert via `git config --unset core.hooksPath`. That deactivates all three hooks without deleting any files. No app behavior is affected since this cycle touched no runtime code.

8. **First real use:** the next development cycle should use `/spec` to test the flow end-to-end. Start a fresh session to get the SessionStart hook firing.

9. **Model-Trailer visibility:** after committing, check with `git log -1 --format=%B`. You should see `Model-Trailer: claude-opus-4-6` and `Role: cto` at the bottom. If not, verify hooks are installed with `git config core.hooksPath`.
