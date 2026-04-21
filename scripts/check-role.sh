#!/usr/bin/env bash
# check-role.sh — session-start role check
#
# This script does NOT detect the model or prompt the user. It only checks
# whether .claude/session-role exists and is fresh (< 12 hours old). If it's
# missing or stale, it prints a one-line instruction that the assistant must
# act on as the first thing it does in the session.
#
# The assistant then uses AskUserQuestion to ask the user which role to take
# (naming its own model, which it knows from its system prompt), and writes
# .claude/session-role.
#
# Why no detection: Claude Code does not reliably export CLAUDE_MODEL to hook
# subprocesses, and other CLIs (GLM, GPT) use different variables. A file the
# assistant writes on turn one works universally.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROLE_FILE="$ROOT/.claude/session-role"
MAX_AGE_HOURS=12

if [ ! -f "$ROLE_FILE" ]; then
  echo "[check-role] Session role not set. Assistant: ask the user to pick 'cto' or 'product-builder' using AskUserQuestion (include your own model name in the question), then write $ROLE_FILE with two lines: role=<cto|product-builder> and model=<your-model-id>. Do not run /spec, /build, or /ship until this is done." >&2
  exit 0
fi

# Check age (macOS + Linux compatible)
if command -v stat >/dev/null 2>&1; then
  if stat -f %m "$ROLE_FILE" >/dev/null 2>&1; then
    # macOS
    MTIME=$(stat -f %m "$ROLE_FILE")
  else
    # Linux
    MTIME=$(stat -c %Y "$ROLE_FILE")
  fi
  NOW=$(date +%s)
  AGE_HOURS=$(( (NOW - MTIME) / 3600 ))
  if [ "$AGE_HOURS" -ge "$MAX_AGE_HOURS" ]; then
    echo "[check-role] Session role is stale (${AGE_HOURS}h old). Assistant: re-confirm the role with the user and rewrite $ROLE_FILE." >&2
    exit 0
  fi
fi

# Role is set and fresh — but the user may be starting a NEW session with a different role.
# Always remind the assistant to check the user's first message for a role declaration.
ROLE=$(grep '^role=' "$ROLE_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo "unknown")
MODEL=$(grep '^model=' "$ROLE_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo "unknown")
echo "[check-role] Last session: role=$ROLE, model=$MODEL. IMPORTANT: If the user's opening message declares a role ('you are cto', 'act as product-builder', 'i am cto', etc.), write $ROLE_FILE immediately (role=<declared> and model=<your-model-id>) before any other action, even though the file already exists. Do not silently inherit the previous session's role." >&2

# Worktree isolation check: EVERY session (regardless of role) MUST work in a git worktree,
# not in the main checkout. This prevents parallel sessions from stomping on each
# other's working tree state.
#
# A linked worktree has --git-dir != --git-common-dir. The main checkout has them equal.
# We check this UNCONDITIONALLY so that all roles are covered.
if command -v git >/dev/null 2>&1; then
  GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
  COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || echo "")
  if [ -n "$GIT_DIR" ] && [ -n "$COMMON_DIR" ] && [ "$GIT_DIR" = "$COMMON_DIR" ]; then
    echo "[check-role] REQUIRED ACTION — do this NOW before anything else: You are in the main checkout (role=$ROLE). ALL sessions must work in a worktree. Set up a worktree yourself (do NOT ask the user to do it). Steps: (1) derive a short kebab-case slug from the user's request, e.g. 'crud-sweep' or 'attendance-fix' — if the request is unclear use a generic slug like 'feature-work'; (2) run 'bash scripts/setup-worktree.sh <slug>' using the Bash tool; (3) use the EnterWorktree tool to move into .worktrees/<slug>; (4) rewrite .claude/session-role inside the worktree with your actual model ID; (5) then proceed with the user's original request as if nothing happened. The user should never have to touch the worktree setup." >&2
  fi
fi

exit 0
