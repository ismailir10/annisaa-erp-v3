#!/usr/bin/env bash
# bootstrap-env-symlinks.sh — restore .env + .env.local symlinks in a worktree.
#
# Works from any path inside a git worktree (including Claude-harness-created
# worktrees at .claude/worktrees/<slug>, which bypass scripts/setup-worktree.sh
# and therefore never get symlinks at creation time).
#
# Usage (from anywhere inside a worktree):
#   bash scripts/bootstrap-env-symlinks.sh
#
# Behaviour:
#   - Locates the main checkout via `git rev-parse --git-common-dir`
#   - Symlinks .env and .env.local from main → cwd if they are missing or broken
#   - Idempotent: a successful run is a no-op on the next run
#   - Fails loudly if the main checkout has no .env (can't symlink nothing)

set -eu

# ── Locate main checkout ─────────────────────────────────────────────────────
# git-common-dir returns:
#   - "<main>/.git"                               when run from the main checkout
#   - "<main>/.git" (absolute)                    when run from a worktree (linked)
# It may be relative, so we cd into it to resolve an absolute path.

if ! COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null); then
  echo "bootstrap-env-symlinks: ERROR — not inside a git repo." >&2
  exit 1
fi

MAIN_GIT=$(cd "$COMMON_DIR" && pwd)
MAIN_ROOT=$(dirname "$MAIN_GIT")
CWD=$(pwd)

if [ "$MAIN_ROOT" = "$CWD" ]; then
  echo "bootstrap-env-symlinks: running inside the main checkout — nothing to do."
  exit 0
fi

echo "bootstrap-env-symlinks: main checkout = $MAIN_ROOT"
echo "bootstrap-env-symlinks: worktree      = $CWD"

# ── Guard: main must have .env to symlink from ───────────────────────────────

if [ ! -f "$MAIN_ROOT/.env" ]; then
  echo "bootstrap-env-symlinks: ERROR — $MAIN_ROOT/.env does not exist." >&2
  echo "  Cannot restore symlinks. Create .env in the main checkout first." >&2
  exit 1
fi

# ── Symlink a single file idempotently ───────────────────────────────────────
# Args: $1 = source (in main), $2 = target (in worktree)
link_if_needed() {
  src="$1"
  dst="$2"
  name=$(basename "$dst")

  # If target already resolves to a readable file, we're done.
  if [ -e "$dst" ] && [ -r "$dst" ]; then
    # Already good (symlink or real file). No-op.
    echo "  $name: ok"
    return 0
  fi

  # Broken symlink → remove before relinking.
  if [ -L "$dst" ]; then
    rm -f "$dst"
  fi

  ln -sf "$src" "$dst"
  if [ ! -r "$dst" ]; then
    echo "bootstrap-env-symlinks: ERROR — linked $name but target is not readable." >&2
    exit 1
  fi
  echo "  $name: linked ($src)"
}

echo "bootstrap-env-symlinks: ensuring symlinks ..."
link_if_needed "$MAIN_ROOT/.env" "$CWD/.env"

if [ -f "$MAIN_ROOT/.env.local" ]; then
  link_if_needed "$MAIN_ROOT/.env.local" "$CWD/.env.local"
else
  echo "  .env.local: skipped (not present in main checkout)"
fi

echo "bootstrap-env-symlinks: done."
