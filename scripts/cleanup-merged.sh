#!/usr/bin/env bash
# cleanup-merged.sh — remove merged feat/* worktrees + delete their branches,
# plus dangling local feat/* branches (no worktree, no remote, content in
# staging).
#
# Default: --report (dry-run; prints candidates with reasons; safe to call
#          from SessionStart without confirming with the user).
# --yes:   actually run `git worktree remove` + `git branch -D` on each
#          candidate. Run this manually after merging a PR.
#
# Two passes:
#
#   PASS 1 — worktrees. Iterate `git worktree list`, find feat/* worktrees
#   whose PR was merged, remove worktree + delete branch in one go.
#
#   PASS 2 — dangling branches. Iterate `git for-each-ref refs/heads/feat/*`,
#   find branches with no worktree + no remote ref + tree matching staging
#   (squash-merged orphan), delete the branch. These accumulate when a
#   feature branch is built on top of another feature branch and the parent
#   is force-deleted before its child branches were cleaned (the orphan
#   parent is what produced the original "feat/workflow-cleanup-script"
#   left-behind during /ship cycle.)
#
# Detection — a feat/* branch is considered "merged" if EITHER:
#   * the remote branch ref is gone (PR was squash-merged with
#     --delete-branch — the standard /ship flow) AND tree matches
#     origin/staging, OR
#   * the branch is a strict ancestor of origin/staging (FF merge).
#
# Safety guards (the candidate is SKIPPED if any apply):
#   * worktree path is the main checkout (we never touch it)
#   * branch name is not feat/* (claude/* and one-off branches are not
#     /ship outputs and are out of scope)
#   * worktree is the one currently checked out by this shell (you can't
#     remove the worktree you're standing in)
#   * working tree is dirty (uncommitted files, untracked files)
#   * branch has local commits NOT on origin (unpushed work that would
#     be lost)
#   * (Pass 2 only) branch is checked out by ANY worktree — handled by
#     pass 1 already; pass 2 only walks branches with no worktree
#
# Output is line-oriented and parseable: each candidate gets one line
# prefixed `[would-remove]`, `[remove]`, or `[skip] ... — <reason>`.
# Exit code is always 0 unless there is a hard error (e.g. not in a git
# repo).

set -eu

MODE="${1:---report}"
case "$MODE" in
  --report|--yes) ;;
  *)
    echo "usage: $0 [--report|--yes]" >&2
    echo "  --report  dry-run; print candidates only (default)" >&2
    echo "  --yes     actually remove worktrees + delete branches" >&2
    exit 2
    ;;
esac

# Must be inside a git repo. Resolve the main checkout root so we never
# accidentally remove it as a worktree candidate.
COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null) || {
  echo "cleanup-merged: not inside a git repository" >&2
  exit 1
}
MAIN_ROOT=$(cd "$(dirname "$COMMON_DIR")" && pwd)

# Refresh remote refs so PR-deleted branches show as gone.
git fetch origin --prune --quiet 2>/dev/null || true

CURRENT_WT=$(git rev-parse --show-toplevel)

# Build a set of branches currently checked out by any worktree, used by
# pass 2 to skip branches that pass 1 already considered.
WORKTREE_BRANCHES=$(git worktree list --porcelain \
  | awk '/^branch refs\/heads\//{sub("refs/heads/","",$2); print $2}')

# ─── Pass 1: worktrees ─────────────────────────────────────────────────────
# Iterate worktrees via process substitution so the loop body runs in the
# current shell (not a subshell), letting us exit cleanly on hard errors.
while read -r WT; do
  # Skip the main checkout — never operate on it.
  if [ "$WT" = "$MAIN_ROOT" ]; then
    continue
  fi

  BR=$(git -C "$WT" branch --show-current 2>/dev/null || echo "")
  case "$BR" in
    feat/*) ;;
    *)
      echo "[skip] $WT — branch '$BR' is not feat/* (out of scope)"
      continue
      ;;
  esac

  if [ "$WT" = "$CURRENT_WT" ]; then
    echo "[skip] $WT ($BR) — currently checked out by this shell"
    continue
  fi

  if [ -n "$(git -C "$WT" status --porcelain 2>/dev/null)" ]; then
    echo "[skip] $WT ($BR) — working tree is dirty"
    continue
  fi

  # Determine merged-state.
  MERGED=0
  REASON=""
  if ! git ls-remote --exit-code origin "refs/heads/$BR" >/dev/null 2>&1; then
    # Remote ref is gone — PR was likely squash-merged with --delete-branch.
    # BUT another session could have continued committing locally after the
    # merge. Compare CONTENT (working tree) not COMMITS — squash-merge
    # produces a different SHA on staging, so commit-level comparisons
    # (`git diff A...B`) always look "ahead" even when the file content is
    # identical. Use two-arg `git diff --quiet` which compares trees:
    #   exit 0 → trees identical → safe to remove
    #   exit 1 → trees differ → another session has new work → skip
    if ! git -C "$WT" diff --quiet "origin/staging" HEAD 2>/dev/null; then
      echo "[skip] $WT ($BR) — remote branch gone but worktree content differs from origin/staging (likely another session still working)"
      continue
    fi
    MERGED=1
    REASON="remote branch deleted + tree matches origin/staging"
  else
    # Remote still exists. Check unpushed commits FIRST so we don't lose
    # work even if the FF-ancestor heuristic accidentally matches.
    UNPUSHED=$(git -C "$WT" rev-list --count "$BR..origin/$BR" >/dev/null 2>&1 \
                 && git -C "$WT" rev-list --count "origin/$BR..$BR" 2>/dev/null \
                 || echo "?")
    if [ "$UNPUSHED" != "0" ] && [ "$UNPUSHED" != "" ]; then
      echo "[skip] $WT ($BR) — $UNPUSHED local commits not on origin/$BR"
      continue
    fi
    AHEAD_OF_STAGING=$(git -C "$WT" rev-list --count "origin/staging..$BR" 2>/dev/null || echo "?")
    BEHIND_STAGING=$(git -C "$WT" rev-list --count "$BR..origin/staging" 2>/dev/null || echo "?")
    if [ "$AHEAD_OF_STAGING" = "0" ] && [ "$BEHIND_STAGING" != "?" ] && [ "$BEHIND_STAGING" != "0" ]; then
      MERGED=1
      REASON="ancestor of origin/staging (FF-merged)"
    fi
  fi

  if [ "$MERGED" = "0" ]; then
    echo "[skip] $WT ($BR) — not merged into staging yet"
    continue
  fi

  if [ "$MODE" = "--report" ]; then
    echo "[would-remove] $WT ($BR) — $REASON"
  else
    echo "[remove] $WT ($BR) — $REASON"
    if git worktree remove "$WT" 2>&1 | sed 's/^/  worktree: /'; then
      :
    else
      echo "  worktree: removal failed; leaving branch intact"
      continue
    fi
    git branch -D "$BR" 2>&1 | sed 's/^/  branch:   /' || true
  fi
done < <(git worktree list --porcelain | awk '/^worktree/{print $2}')

# ─── Pass 2: dangling local feat/* branches (no worktree) ──────────────────
# Catches the "orphan parent" pattern: a branch whose worktree was already
# removed (or which never had one) and whose remote was deleted by a PR
# squash-merge. Pass 1 misses them because it only iterates worktrees.
while read -r BR; do
  # Skip if this branch is checked out by any worktree — pass 1 handled it.
  if echo "$WORKTREE_BRANCHES" | grep -Fxq "$BR"; then
    continue
  fi

  # Skip if remote ref still exists — branch is not "dangling" yet, the PR
  # may not have merged.
  if git ls-remote --exit-code origin "refs/heads/$BR" >/dev/null 2>&1; then
    echo "[skip] (no worktree) $BR — remote branch still exists"
    continue
  fi

  # Resolve branch SHA + check tree vs origin/staging. Use `git diff --quiet`
  # with two refs (compares the trees of the two commits without checking
  # anything out — works on dangling refs).
  if ! git diff --quiet "origin/staging" "refs/heads/$BR" 2>/dev/null; then
    echo "[skip] (no worktree) $BR — tree differs from origin/staging (unmerged work)"
    continue
  fi

  if [ "$MODE" = "--report" ]; then
    echo "[would-remove] (no worktree) $BR — remote branch deleted + tree matches origin/staging"
  else
    echo "[remove] (no worktree) $BR — remote branch deleted + tree matches origin/staging"
    git branch -D "$BR" 2>&1 | sed 's/^/  branch:   /' || true
  fi
done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/feat/*')
