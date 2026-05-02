#!/usr/bin/env bash
# setup-worktree.sh — create a clean worktree for a product-builder session
#
# Usage (from the main checkout root):
#   ./scripts/setup-worktree.sh <slug>
#
# Example:
#   ./scripts/setup-worktree.sh crud-sweep
#
# What it does:
#   1. Creates .worktrees/<slug> with branch feat/<slug>
#   2. Symlinks .env, .env.local, and node_modules from the main checkout
#      so the worktree can run `npm run dev` and `npm run build` immediately
#   3. Installs git hooks in the worktree
#   4. Writes .claude/session-role as product-builder (override on first AI turn)
#
# Why symlinks instead of copies:
#   .env — symlinked so secrets stay in one place; changes in main propagate automatically
#   .env.local — same
#   node_modules — symlinked so the worktree doesn't need `npm install` (~1-2 min saved)
#     NOTE: if your branch adds/changes dependencies, run `npm install` inside the
#     worktree to replace the symlink with a real node_modules for that branch.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Guards ──────────────────────────────────────────────────────────────────

if [ $# -lt 1 ]; then
  echo "usage: ./scripts/setup-worktree.sh <slug>" >&2
  echo "  example: ./scripts/setup-worktree.sh crud-sweep" >&2
  exit 1
fi

SLUG="$1"
WORKTREE_PATH="$ROOT/.worktrees/$SLUG"
BRANCH="feat/$SLUG"

# Must run from main checkout (not already inside a worktree)
GIT_DIR=$(git -C "$ROOT" rev-parse --git-dir 2>/dev/null || echo "")
COMMON_DIR=$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null || echo "")
if [ "$GIT_DIR" != "$COMMON_DIR" ]; then
  echo "setup-worktree: ERROR — run this from the main checkout root, not from inside a worktree." >&2
  exit 1
fi

if [ -d "$WORKTREE_PATH" ]; then
  echo "setup-worktree: ERROR — .worktrees/$SLUG already exists. Choose a different slug or remove it first:" >&2
  echo "  git worktree remove .worktrees/$SLUG" >&2
  exit 1
fi

# ── Create worktree ──────────────────────────────────────────────────────────

echo "setup-worktree: creating .worktrees/$SLUG on branch $BRANCH (base: origin/staging) ..."
git fetch origin staging --quiet
git worktree add "$WORKTREE_PATH" -b "$BRANCH" origin/staging

# ── Symlink .env files ───────────────────────────────────────────────────────

echo "setup-worktree: symlinking .env files ..."

if [ -f "$ROOT/.env" ]; then
  ln -sf "$ROOT/.env" "$WORKTREE_PATH/.env"
  echo "  linked .env"
else
  echo "  WARNING: $ROOT/.env not found — skipping. The worktree won't have DB access." >&2
fi

if [ -f "$ROOT/.env.local" ]; then
  ln -sf "$ROOT/.env.local" "$WORKTREE_PATH/.env.local"
  echo "  linked .env.local"
fi

# ── Symlink node_modules ─────────────────────────────────────────────────────

if [ -d "$ROOT/node_modules" ]; then
  echo "setup-worktree: symlinking node_modules ..."
  ln -sf "$ROOT/node_modules" "$WORKTREE_PATH/node_modules"
  echo "  linked node_modules (run 'npm install' inside the worktree if you change deps)"
else
  echo "setup-worktree: node_modules not found in main checkout — running npm install in worktree ..." >&2
  npm --prefix "$WORKTREE_PATH" install
fi

# ── Install git hooks ────────────────────────────────────────────────────────

echo "setup-worktree: installing git hooks ..."
bash "$WORKTREE_PATH/scripts/install-hooks.sh"

# ── Write session-role placeholder ───────────────────────────────────────────

mkdir -p "$WORKTREE_PATH/.claude"
cat > "$WORKTREE_PATH/.claude/session-role" <<'EOF'
role=product-builder
model=unknown
EOF
echo "setup-worktree: wrote .claude/session-role (AI will overwrite model on first turn)"

# ── Smoke check: env symlinks are actually readable ─────────────────────────

echo "setup-worktree: smoke-checking .env symlinks ..."
if [ ! -r "$WORKTREE_PATH/.env" ]; then
  echo "setup-worktree: FAIL — $WORKTREE_PATH/.env is missing or unreadable." >&2
  echo "  The worktree will not be able to run npm run dev / build / prisma." >&2
  echo "  Recover with: (cd $WORKTREE_PATH && bash scripts/bootstrap-env-symlinks.sh)" >&2
  exit 1
fi
if [ -f "$ROOT/.env.local" ] && [ ! -r "$WORKTREE_PATH/.env.local" ]; then
  echo "setup-worktree: FAIL — .env.local present in main but unreadable in worktree." >&2
  echo "  Recover with: (cd $WORKTREE_PATH && bash scripts/bootstrap-env-symlinks.sh)" >&2
  exit 1
fi
echo "  .env ok"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "setup-worktree: ready."
echo "  Worktree : $WORKTREE_PATH"
echo "  Branch   : $BRANCH"
echo ""
echo "Next step — open a new Claude Code session pointed at this worktree:"
echo "  cd $WORKTREE_PATH"
echo "  claude"
echo ""
echo "Cleanup when the cycle is merged:"
echo "  git worktree remove .worktrees/$SLUG"
echo "  git branch -D $BRANCH"
