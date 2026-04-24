# cleanup-merged: handle dangling local branches with no worktree

**Date:** 2026-04-24
**Role:** cto
**Cycle type:** Tooling — extend `scripts/cleanup-merged.sh` with a second pass

## Context

`scripts/cleanup-merged.sh` (landed in PR #122 + #123) iterates `git worktree list`. Each entry has a worktree directory + a branch; the script removes the worktree and deletes the branch in one step.

Gap surfaced immediately after the script's own self-cleanup: when the script removed `.worktrees/workflow-cleanup-script`, the branch `feat/cleanup-merged-diff-fix` (the rebased follow-up branch) went with it — but the original parent branch `feat/workflow-cleanup-script` was left behind because no worktree was pointing at it. The user had to run `git branch -D feat/workflow-cleanup-script` manually.

The pattern is general: any time a branch is built on top of another feature branch (rebase, follow-up fix, branch-from-branch), the parent ends up as a "dangling" local ref — no worktree, no remote (deleted by squash-merge), no way for pass 1 to find it.

## Spec

### Success criteria

1. Add a second pass to `scripts/cleanup-merged.sh` that walks `git for-each-ref refs/heads/feat/*` and finds dangling branches.
2. Skip if branch is already in any worktree (pass 1 handled it).
3. Skip if remote ref still exists (PR may not have merged).
4. Skip if branch tree differs from `origin/staging` (unmerged work — protect even orphan branches with new content).
5. Output line uses `(no worktree)` prefix to disambiguate from pass 1 output.
6. `--report` and `--yes` both flow through cleanly.
7. Verified live with a synthesised dangling branch.

### Out of scope

- Cleaning up `claude/*` or other one-off branches (still out of scope; only `/ship`-produced `feat/*` branches).
- Auto-removing in `--report` mode (still safety-first; `--yes` required for mutation).

## Tasks

- [x] T1 — Refactor header doc-comment to describe the two-pass model.
- [x] T2 — Build a `WORKTREE_BRANCHES` set before pass 1 iteration.
- [x] T3 — Add pass 2 after pass 1, walking `git for-each-ref refs/heads/feat/*`.
- [x] T4 — Verify with a synthesised dangling branch.

## Implementation

### T1 — Header doc

Header comment now describes both passes + their purpose. Pass 2 explicitly references the orphan-parent pattern that triggered this cycle.

### T2 — Worktree-branch set

Before pass 1, capture the set of branches currently checked out by any worktree:

```bash
WORKTREE_BRANCHES=$(git worktree list --porcelain \
  | awk '/^branch refs\/heads\//{sub("refs/heads/","",$2); print $2}')
```

Used by pass 2's first guard (`grep -Fxq "$BR"`).

### T3 — Pass 2

After pass 1's `done`, a second `while read -r BR ... done < <(git for-each-ref ...)` block. For each `feat/*` branch:

1. Skip if in `WORKTREE_BRANCHES` — pass 1 already considered it.
2. Skip if `git ls-remote origin refs/heads/$BR` exits 0 — remote still exists, branch is not dangling.
3. Skip if `git diff --quiet origin/staging refs/heads/$BR` exits non-zero — tree differs, has unmerged work.
4. Otherwise: `[would-remove]` in `--report` mode, `git branch -D` in `--yes` mode.

Output uses `(no worktree)` prefix on the branch name so the line is unambiguous against pass-1 output.

### T4 — Live verification

Pass 2 didn't fire on the unmodified repo state — all 3 local `feat/*` branches were already checked out by worktrees. Synthesised a dangling branch to confirm:

```
$ git branch feat/test-dangling-fake origin/staging
$ bash scripts/cleanup-merged.sh --report
[skip] .../cleanup-merged-dangling-branches (feat/cleanup-merged-dangling-branches) — currently checked out by this shell
[skip] .../prod-merge-blockers (feat/prod-merge-blockers) — remote branch gone but worktree content differs from origin/staging
[skip] .../stress-review-per-module (feat/stress-review-per-module) — not merged into staging yet
[would-remove] (no worktree) feat/test-dangling-fake — remote branch deleted + tree matches origin/staging
$ git branch -D feat/test-dangling-fake
```

Pass 2 correctly identified the synthetic dangling branch as cleanable while every active session-owned branch was protected.

## Verification

- [x] `bash -n scripts/cleanup-merged.sh` — syntax OK.
- [x] `--report` with synthesised dangling branch — correctly flags it as `[would-remove]`.
- [x] All 3 active worktrees still skipped (current-shell, content-differs, not-merged).
- [x] No new TS / Prisma / app code → no lint/test/playwright run needed.

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Rollback plan:** revert the script edit; pass 1 behavior is unchanged so the script still works as before.
- **Behavioral change:** SessionStart `--report` may now print additional `(no worktree)` lines if dangling branches accumulate. Each is a hint to run `--yes`.
- **Compatibility with running AI sessions:** all four guards still apply; pass 2 also explicitly skips branches checked out by ANY worktree, so an active session's feature branch can never be deleted from under it.
