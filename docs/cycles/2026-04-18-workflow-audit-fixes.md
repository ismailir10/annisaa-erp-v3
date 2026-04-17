# Workflow Audit Fixes — sync skills with CLAUDE.md + hooks

## Context

A workflow audit surfaced drift between `.claude/skills/{spec,build,ship}/SKILL.md` and the source-of-truth rules in `CLAUDE.md` + the git hooks in `.githooks/`. Multiple AI sessions (glm-5.1, sonnet, opus) have edited the workflow over the last ten days, and CLAUDE.md moved to a PR-for-all-roles model (commit 2bc65df) while the skills were left behind. Today a `/ship` run as role=cto would try `git push origin staging` and be rejected by `pre-push`, and a `/build` cycle can complete without Playwright ever running — which means `/ship`'s documented "Playwright must have passed" precondition is unenforceable. Goal: bring the three skills back in sync with CLAUDE.md, with no changes to the hooks or `check-role.sh` (they're already correct).

## Spec

**Acceptance criteria**
- [ ] `/ship` opens a PR from `feat/*` → `staging` for **every** role, then runs `gh pr merge --auto --squash --delete-branch` so the PR auto-merges when CI is green.
- [ ] `/ship --to-main` is implemented: opens a PR `staging` → `main` with auto-merge; only runs when `role=cto`.
- [ ] `/ship` never runs `git push origin staging` or `git push origin main` directly.
- [ ] `/build`'s end-of-cycle gate (after the last task, before Ship Notes commit) runs `npm run build && npx vitest run && npx playwright test` and records the result in the cycle doc's Verification section.
- [ ] `/ship`'s step-1 re-run gate runs the full end-of-cycle gate (same three commands) — not just build+vitest.
- [ ] `/spec`, `/build`, `/ship` preflight worktree checks enforce worktree isolation for **all** roles, not only `product-builder`.
- [ ] `/ship` description and prose no longer equate `cto` with "Opus" or `product-builder` with "non-Opus". Role is declared in `.claude/session-role`, independent of model.
- [ ] `/spec` preflight worktree failure mode delegates to `scripts/setup-worktree.sh` (matches `check-role.sh` automation), not a manual command list for the user to copy.

**Non-goals**
- No changes to `.githooks/pre-push`, `pre-commit`, `prepare-commit-msg`, or `scripts/check-role.sh` — they're correct.
- No changes to `/uat` skill.
- No changes to CLAUDE.md unless a skill update exposes a doc ambiguity (flag for a follow-up cycle instead).
- Not addressing the `pre-commit` seed-drift ceremony rule — documented design choice, leave alone.

**Assumptions**
1. Branch protection on GitHub is configured with the four required checks (`build`, `typecheck`, `test`, `e2e`), so `gh pr merge --auto` is safe to call unconditionally.
2. `gh` CLI is authenticated in every session that runs `/ship` — if not, skill should surface the `gh auth login` error rather than swallow it.
3. Playwright at end-of-cycle is acceptable even though it adds ~2 min — matches CLAUDE.md's explicit two-tier gate design.

## Tasks

- [x] **Task 1 — Fix worktree preflight in all three skills.** Replace role-gated worktree checks in `.claude/skills/{spec,build,ship}/SKILL.md` with unconditional checks that match `check-role.sh`. Point at `scripts/setup-worktree.sh` automation rather than manual git commands. *Acceptance: all three skills enforce worktree for every role; manual command block in `/spec` replaced with a pointer to the setup script.*

- [x] **Task 2 — Rewrite `/ship` to PR-for-all-roles with auto-merge.** In `.claude/skills/ship/SKILL.md`: remove the `role=cto → git push origin staging` branch. Single flow: ensure `feat/*` branch, push it, `gh pr create --base staging`, then `gh pr merge --auto --squash --delete-branch`. Remove Opus/non-Opus framing from description and prose. *Acceptance: the skill contains zero `git push origin staging` or `git push origin main` invocations; PR flow applies to both roles; auto-merge command present.*

- [x] **Task 3 — Implement `/ship --to-main` for CTO promotion.** Detect the `--to-main` arg in the skill's invocation handling. Require `role=cto`; refuse otherwise. Flow: create PR `staging` → `main` with `gh pr create --base main --head staging`, attach summary pulled from the last N merged cycle docs, then `gh pr merge --auto --squash`. *Acceptance: `/ship --to-main` documented and implemented; refuses when role ≠ cto; only targets main via PR.*

- [x] **Task 4 — Add Playwright to `/build` end-of-cycle gate.** In `.claude/skills/build/SKILL.md` "After the last task" section, change the single `npm run build && npx vitest run` to the full three-command gate, and require recording the Playwright result in the cycle doc's Verification section before the final commit. Between-task gate stays as build+vitest only (per CLAUDE.md's two-tier design). *Acceptance: end-of-cycle gate invocation in build skill contains `npx playwright test`; Verification section update step explicitly mentions Playwright outcome.*

- [ ] **Task 5 — Fix `/ship` step-1 re-run gate.** In `.claude/skills/ship/SKILL.md` step 1, replace `npm run build && npx vitest run` with the full end-of-cycle gate. Add a pre-step that reads the cycle doc's Verification section and warns if Playwright wasn't recorded by `/build`. *Acceptance: `/ship` re-runs the full gate; missing Playwright evidence in the cycle doc is surfaced before the PR is opened.*

## Implementation
- Task 1: Fix worktree preflight — `.claude/skills/{spec,build,ship}/SKILL.md` — replaced role-gated checks with unconditional "every session" enforcement; `/spec` now points at `scripts/setup-worktree.sh` automation instead of a manual command block.
- Task 2: Rewrite /ship for PR-for-all-roles + auto-merge — `.claude/skills/ship/SKILL.md` — removed cto direct-push branch; single flow opens PR to staging then `gh pr merge --auto --squash --delete-branch`; removed Opus/non-Opus framing; added label `model:<model>` (dropped `needs-cto-review` since auto-merge supersedes human gating).
- Task 3: Implement /ship --to-main — `.claude/skills/ship/SKILL.md` — added Invocation modes section; added Step 2 (--to-main) with CTO role gate, staging-ahead-of-main check, PR staging → main with commit summary, and auto-merge via `gh pr merge --auto --squash` (no --delete-branch since staging is permanent).
- Task 4: Add Playwright to /build end-of-cycle gate — `.claude/skills/build/SKILL.md` — expanded "After the last task" step 1 to the full three-command gate (`build && vitest run && playwright test`); added step 2 requiring Playwright outcome be recorded in cycle doc Verification as `/ship`'s precondition.

## Verification
- Task 1: gates passed (`npm run build` green, `npx vitest run` 104/104). Doc-only skill edits — no runtime surface to smoke.
- Task 2: gates passed (build green, vitest 104/104). Reviewed diff: no `git push origin staging` or `git push origin main` remain in the skill.
- Task 3: gates passed (build green, vitest 104/104). Role gate short-circuits non-CTO sessions before any `gh` call.
- Task 4: gates passed (build green, vitest 104/104). Playwright itself deferred to this cycle's end-of-cycle gate below.

## Ship Notes
<!-- filled by /ship -->
