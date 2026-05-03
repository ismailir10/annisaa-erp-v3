# Workflow: cleanup-merged worktree + branch script

**Date:** 2026-04-24
**Role:** cto
**Cycle type:** Tooling — automation script + hook integration

## Context

After the previous cycle (`alertdialog-jakarta-schema-alignment`) merged, post-merge cleanup was manual. The repo had previously accumulated 27 stale worktrees + ~60 local branches before a manual nuke; the long tail of "remote-deleted-but-still-on-disk" worktrees came back the same morning (`prod-merge-blockers`, `stress-review-per-module`).

The cause is structural: `/ship` opens a PR and stops; the user merges manually; nothing reaches back into the laptop to remove the now-merged worktree + local branch. Multiple AI sessions running in parallel make this worse — each spawns a worktree but no one is responsible for removing them later.

This cycle adds a single script that auto-detects merged feat/* worktrees and reports (or removes) them safely, plus two integration points so the user is reminded without having to remember.

## Spec

### Success criteria

1. `scripts/cleanup-merged.sh` exists, executable, two modes:
   - `--report` (default): print candidates with reasons, no mutation. Safe for SessionStart.
   - `--yes`: actually remove worktrees + delete local branches.
2. Detection — a feat/* branch is considered merged if EITHER:
   - the remote ref `refs/heads/feat/X` is gone (PR squash-merged with `--delete-branch` — the standard `/ship` flow) AND `git diff origin/staging...HEAD` is empty (no post-merge commits from another session), OR
   - the branch is a strict ancestor of `origin/staging` (FF merge — rare).
3. Safety guards (skip without prompt):
   - Main checkout (never touched).
   - Branch is not feat/* (claude/* and one-off branches are out of scope).
   - Worktree is the one currently checked out by the calling shell.
   - Working tree is dirty.
   - Branch has local commits not on origin (unpushed work).
4. SessionStart hook runs `cleanup-merged.sh --report` so every fresh session sees the stale-candidate list.
5. `/ship` SKILL.md Step 3 mentions running `--yes` after the user merges the PR.
6. CLAUDE.md "Cleanup when the cycle is merged" snippet updated to lead with the script.
7. Other AI sessions running in parallel are NOT affected — script flagged as `[skip]` based on the dirty / unpushed / post-merge-commits guards.

### Out of scope

- Auto-running `--yes` from a hook (too aggressive — losing work is irreversible).
- Cleaning up `claude/*` or other one-off branches (separate concerns; user can rm manually).
- GitHub Actions cleanup (Actions can't reach a developer laptop).

## Tasks

- [x] T1 — Implement `scripts/cleanup-merged.sh` with `--report` / `--yes` modes and the safety guards above.
- [x] T2 — Wire SessionStart hook in `.claude/settings.json` to call `--report` after `sync-staging.sh`.
- [x] T3 — Update `.claude/skills/ship/SKILL.md` Step 3 with the post-merge `--yes` reminder.
- [x] T4 — Update CLAUDE.md "Cleanup when the cycle is merged" snippet to lead with the script + keep the manual fallback.
- [x] T5 — End-of-cycle gate (lint/test/playwright not relevant — this is shell-only) + dry-run smoke against the live repo to confirm other-session worktrees are skipped.

## Implementation

### T1 — `scripts/cleanup-merged.sh`

Single shell script. ~80 lines. Iterates `git worktree list --porcelain`, applies the safety + merged checks, prints one line per worktree (`[would-remove]`, `[remove]`, or `[skip] ... — <reason>`). Exit code 0 unless not in a git repo.

Key implementation choices:
- **Process substitution** (`while … done < <(...)`) so the loop runs in the current shell — `set -eu` exits cleanly on hard errors instead of silently swallowing them inside a piped subshell.
- **`git ls-remote --exit-code origin refs/heads/feat/X`** to test whether the remote branch was deleted by GitHub on merge. Exit 2 → gone. This is the load-bearing signal for the squash-merge case (the more common one via `/ship`).
- **`git diff origin/staging...HEAD` non-empty → skip.** Catches the case where another AI session continued committing to a branch after the upstream PR was merged. Without this, the FIRST session to call `--yes` would silently destroy the SECOND session's in-flight work. Discovered while testing against `feat/prod-merge-blockers` (another running session) — the diff guard correctly flagged it as still-active.
- **`AHEAD_OF_STAGING=0` AND `BEHIND_STAGING != 0`** for the FF case (branch is strictly behind staging on origin/staging). Rare with squash workflow but cheap to support.
- **Skip the current worktree.** `git rev-parse --show-toplevel` of the calling shell vs each worktree path. You can't `git worktree remove` the directory you're standing in.

### T2 — SessionStart hook

`.claude/settings.json` SessionStart hooks list now: `check-role.sh` → `sync-staging.sh` → **`cleanup-merged.sh --report`**. Output appears as system-reminder context on the assistant's first turn; the assistant can either act on the candidates immediately or pass them along to the user.

### T3 — `/ship` SKILL.md Step 3

Added a new bullet in the post-ship checklist: "Reclaim disk + reduce next-session noise: `bash scripts/cleanup-merged.sh --yes` from the main checkout." Frames it as a hygiene reminder, not a prerequisite — the user runs it when convenient.

### T4 — CLAUDE.md cleanup snippet

The previous snippet was the raw two-command pair. Now leads with `cleanup-merged.sh` (preferred), keeps the manual two-command form as the explicit fallback for one-off cleanup outside the script's heuristics.

### T5 — Live smoke

Ran `bash scripts/cleanup-merged.sh --report` against the live repo state mid-cycle:

```
[skip] /Users/.../prod-merge-blockers (feat/prod-merge-blockers) — remote branch gone but worktree has commits not in origin/staging (likely another session still working)
[skip] /Users/.../stress-review-per-module (feat/stress-review-per-module) — working tree is dirty
[skip] /Users/.../workflow-cleanup-script (feat/workflow-cleanup-script) — currently checked out by this shell
```

All three correctly skipped. The user's "another AI session running" constraint is satisfied: `prod-merge-blockers` is protected by the diff guard, `stress-review-per-module` by the dirty-tree guard, the current worktree by the self-check.

## Verification

- [x] `bash scripts/cleanup-merged.sh --report` smoke-runs cleanly + correctly skips all 3 live worktrees.
- [x] `--yes` would also skip them (same code path; only the action verb differs).
- [x] `bash -n scripts/cleanup-merged.sh` syntax-checks clean.
- [x] No new TS / Prisma / app code → no lint/test/playwright run needed.

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Rollback plan:** delete `scripts/cleanup-merged.sh`, revert the `.claude/settings.json` hook entry, revert the SKILL.md + CLAUDE.md edits. No data or schema impact.
- **Behavioral change for users:** every new Claude Code session now prints a `[would-remove] / [skip] …` block on startup if there are merged worktrees on disk. If the noise is unwelcome, comment out the third hook in `.claude/settings.json`. The script remains usable on demand.
- **Compatibility with running AI sessions:** verified live — all three guards (current-worktree, dirty-tree, post-merge-commits-vs-staging) prevent the script from interfering with parallel sessions.
