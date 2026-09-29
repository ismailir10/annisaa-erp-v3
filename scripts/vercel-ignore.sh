#!/usr/bin/env bash
# vercel-ignore.sh — Vercel "Ignored Build Step" (vercel.json `ignoreCommand`).
#
# Vercel runs this before every git-triggered build. Exit 1 = build,
# exit 0 = skip (the deployment is cancelled before it spends build minutes).
#
# Only two deployments exist: `staging` (shared pre-production) and `main`
# (production). Feature/claude/dependabot branches and their PRs are verified
# by the four required GitHub CI checks plus local demo-auth browser checks,
# never by a per-PR Vercel preview. Auth-impacting changes get their
# signed-in check on the staging deployment after merge — see the ship skill.

set -u

REF="${VERCEL_GIT_COMMIT_REF:-}"

case "$REF" in
  staging|main)
    echo "vercel-ignore: branch '$REF' deploys — building"
    exit 1
    ;;
  *)
    echo "vercel-ignore: branch '${REF:-unknown}' is not staging/main — skipping build"
    exit 0
    ;;
esac
