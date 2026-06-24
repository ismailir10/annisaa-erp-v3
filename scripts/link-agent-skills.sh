#!/usr/bin/env bash
# link-agent-skills.sh — point Codex's gitignored .agents/skills/* at the
# canonical .claude/skills/* so every harness reads ONE source of truth.
#
# Why this exists: Codex resolves its slash-command skills from .agents/skills/,
# which is gitignored (harness-local) and therefore drifts from .claude/skills/.
# A stale .agents/skills/ship/SKILL.md is how a fixed canonical skill fails to
# reach Codex. Because .agents is gitignored we cannot commit the symlinks; this
# script (idempotent) recreates them at setup + SessionStart instead.
#
# Scope: only the workflow skills Codex invokes. Adding a new workflow skill?
# add its name here.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.claude/skills"
DST="$ROOT/.agents/skills"

WORKFLOW_SKILLS="spec build ship audit-docs uat"

[ -d "$SRC" ] || { echo "link-agent-skills: $SRC missing — nothing to link." >&2; exit 0; }

mkdir -p "$DST"
linked=0
for s in $WORKFLOW_SKILLS; do
  if [ -d "$SRC/$s" ]; then
    # Replace any existing dir/symlink with a fresh relative symlink to canonical.
    rm -rf "$DST/$s"
    ln -sfn "../../.claude/skills/$s" "$DST/$s"
    linked=$((linked + 1))
  fi
done

echo "link-agent-skills: linked $linked workflow skill(s) .agents/skills → .claude/skills"
