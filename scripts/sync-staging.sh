#!/usr/bin/env bash
# sync-staging.sh — SessionStart hook.
#
# When the session opens on staging or main, fetch the matching remote and
# fast-forward if the local branch lags. Refuse to touch a dirty tree.
#
# - Runs only on `staging` or `main` so feature branches are never auto-moved.
# - Only fast-forwards; never merges, rebases, or rewrites history.
# - Silent when already up to date or when the fetch fails (offline).
# - Dirty tree => warn only; assistant must surface and ask the user.
#
# Feature-branch drift (base branch moving ahead of the feature) is handled in
# /spec preflight, not here, since rebasing a feature branch is a judgment call.

set -eu

# Skip inside linked worktrees — every worktree already tracks its own
# feat/* branch and should not be fast-forwarded by a staging/main check.
if command -v git >/dev/null 2>&1; then
  GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
  COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
  if [ -n "$GIT_DIR" ] && [ -n "$COMMON_DIR" ] && [ "$GIT_DIR" != "$COMMON_DIR" ]; then
    exit 0
  fi
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
case "$BRANCH" in
  staging|main) ;;
  *) exit 0 ;;
esac

git fetch origin --quiet "$BRANCH" 2>/dev/null || exit 0

LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
[ -z "$LOCAL" ] || [ -z "$REMOTE" ] && exit 0
[ "$LOCAL" = "$REMOTE" ] && exit 0

BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")
AHEAD=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "0")

if [ "$AHEAD" != "0" ]; then
  echo "[sync-staging] $BRANCH has $AHEAD local commits not on origin. Assistant: surface this — direct pushes to $BRANCH are blocked by pre-push; the user likely wants to open a PR via /ship." >&2
  exit 0
fi

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "[sync-staging] $BRANCH is $BEHIND commits behind origin/$BRANCH, but the working tree is dirty. Not pulling. Assistant: tell the user to commit or stash, then run 'git pull --ff-only'." >&2
  exit 0
fi

if git merge --ff-only "origin/$BRANCH" --quiet 2>/dev/null; then
  echo "[sync-staging] fast-forwarded $BRANCH ($BEHIND commits) to origin/$BRANCH." >&2
else
  echo "[sync-staging] fast-forward of $BRANCH failed. Assistant: investigate with 'git status' before acting." >&2
fi

exit 0
