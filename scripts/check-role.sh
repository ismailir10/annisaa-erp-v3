#!/usr/bin/env bash
# check-role.sh — session-start role check
#
# This script does NOT detect the model. It checks whether .claude/session-role
# exists and is fresh (< 12 hours old). If it is missing, stale, or carries the
# deleted product-builder role, it prints a one-line instruction that the
# assistant must act on as the first thing it does in the session.
#
# The assistant knows its own model from its system prompt and rewrites
# .claude/session-role directly. It should not ask the user to re-confirm the
# role: cto is the only role.
#
# Why no detection: Claude Code does not reliably export CLAUDE_MODEL to hook
# subprocesses, and other CLIs (GLM, GPT) use different variables. A file the
# assistant writes on turn one works universally.
#
# Every message goes to STDOUT, deliberately. Claude Code folds only a
# SessionStart hook's stdout into the assistant's context; stderr on a zero exit
# is dropped. These messages were written to stderr until 2026-09-17, so the
# staleness warning and the worktree-isolation demand below had never once
# reached an assistant — a role file sat 193h stale while the hook "worked".
# audit-docs.sh now fails on an `Assistant:` line sent to stderr from any
# SessionStart hook script, so this cannot silently regress.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROLE_FILE="$ROOT/.claude/session-role"
MAX_AGE_HOURS=12

if [ ! -f "$ROLE_FILE" ]; then
  echo "[check-role] Session role not set. Assistant: write $ROLE_FILE now with two lines: role=cto and model=<your-model-id>. cto is the only role; the file exists so every commit carries honest attribution. Do not start a cycle until it is written."
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
    echo "[check-role] Session role is stale (${AGE_HOURS}h old). Assistant: rewrite $ROLE_FILE now with role=cto and model=<your-model-id>. cto is the only role; do not ask the user to re-confirm it."
    exit 0
  fi
fi

# Role is set and fresh, but a previous session may have left the deleted role
# or a different model ID behind. Always remind the assistant to refresh it
# directly when it does not match the current session.
ROLE=$(grep '^role=' "$ROLE_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo "unknown")
MODEL=$(grep '^model=' "$ROLE_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo "unknown")
echo "[check-role] Last session: role=$ROLE, model=$MODEL. IMPORTANT: if role is not 'cto' or your own model ID differs from '$MODEL', rewrite $ROLE_FILE now (role=cto and model=<your-model-id>) before any other action, even though the file already exists. prepare-commit-msg copies this file into every commit's Model-Trailer, so inheriting a deleted role or previous model mis-attributes your work."

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
    echo "[check-role] REQUIRED ACTION — do this NOW before anything else: You are in the main checkout. ALL sessions must work in a worktree. Set up a worktree yourself (do NOT ask the user to do it). Steps: (1) derive a short kebab-case slug from the user's request, e.g. 'crud-sweep' or 'attendance-fix' — if the request is unclear use a generic slug like 'feature-work'; (2) run 'bash scripts/setup-worktree.sh <slug>' using the Bash tool; (3) use the EnterWorktree tool to move into .worktrees/<slug>; (4) rewrite .claude/session-role inside the worktree with your actual model ID; (5) then proceed with the user's original request as if nothing happened. The user should never have to touch the worktree setup."
  fi
fi

exit 0
