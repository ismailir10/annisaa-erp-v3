#!/usr/bin/env bash
# wait-preview-ready: poll for Vercel preview deployment URL on a PR.
#
# Usage: scripts/wait-preview-ready.sh <PR_NUMBER>
#
# Polls `gh pr view <PR> --json comments,statusCheckRollup` every 10s until:
#   - the vercel[bot] comment contains a preview URL (https://*.vercel.app) AND
#   - the Vercel deployment status check is "success" or "completed"
#
# Prints the preview URL on stdout. Exits 0 on success, 1 on timeout, 2 on
# usage error, 3 if `gh` is not available.
#
# Note: when invoked from /ship via Claude Code, the agent should prefer the
# Vercel MCP tool `mcp__2037f9b7-455d-46a1-965a-fe464b218823__get_deployment`
# for a richer signal (build logs, region, runtime status). This script is the
# CLI fallback for shells and CI.

set -eu

PR="${1:-}"
if [ -z "$PR" ]; then
  echo "usage: $0 <PR_NUMBER>" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not available — cannot poll PR for preview URL" >&2
  exit 3
fi

POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-10}"
TIMEOUT_SEC="${TIMEOUT_SEC:-300}"  # 5 minutes

START=$(date +%s)
ATTEMPT=0

while true; do
  ATTEMPT=$((ATTEMPT + 1))
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))

  if [ "$ELAPSED" -ge "$TIMEOUT_SEC" ]; then
    echo "wait-preview-ready: timed out after ${TIMEOUT_SEC}s (PR #$PR)" >&2
    exit 1
  fi

  # Extract any preview URL the Vercel bot posted in the PR comments.
  URL=$(gh pr view "$PR" --json comments 2>/dev/null \
    | python3 -c '
import json, re, sys
try:
  data = json.load(sys.stdin)
except Exception:
  sys.exit(0)
for c in data.get("comments", []):
  author = (c.get("author") or {}).get("login", "")
  body = c.get("body") or ""
  if author == "vercel" or author.startswith("vercel"):
    m = re.search(r"https://[^ )\n]+\.vercel\.app(?:/[^ )\n]*)?", body)
    if m:
      print(m.group(0))
      sys.exit(0)
' 2>/dev/null || true)

  # Look for a Vercel deployment check that has reached a terminal state.
  STATE=$(gh pr view "$PR" --json statusCheckRollup 2>/dev/null \
    | python3 -c '
import json, sys
try:
  data = json.load(sys.stdin)
except Exception:
  sys.exit(0)
for s in data.get("statusCheckRollup", []):
  ctx = s.get("context") or s.get("name") or ""
  state = (s.get("state") or s.get("conclusion") or "").lower()
  if "vercel" in ctx.lower():
    print(state)
    sys.exit(0)
' 2>/dev/null || true)

  if [ -n "$URL" ] && { [ "$STATE" = "success" ] || [ "$STATE" = "completed" ] || [ -z "$STATE" ]; }; then
    echo "$URL"
    exit 0
  fi

  if [ "$STATE" = "failure" ] || [ "$STATE" = "error" ]; then
    echo "wait-preview-ready: Vercel deployment failed (state=$STATE) on PR #$PR" >&2
    exit 1
  fi

  printf 'wait-preview-ready: attempt %d, elapsed %ds, state=%s, url=%s\n' \
    "$ATTEMPT" "$ELAPSED" "${STATE:-pending}" "${URL:-none}" >&2

  sleep "$POLL_INTERVAL_SEC"
done
