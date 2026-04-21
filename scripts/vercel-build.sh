#!/usr/bin/env bash
# vercel-build.sh — build step for Vercel deploys.
#
# Applies Prisma migrations ONLY when building the staging branch. The
# production DB (main branch) is still Phase-1 stale; running migrate
# deploy against it would fail or half-apply. Once that DB is rebuilt,
# extend the whitelist below.

set -eu

echo "vercel-build: VERCEL_GIT_COMMIT_REF=${VERCEL_GIT_COMMIT_REF:-unset} VERCEL_ENV=${VERCEL_ENV:-unset}"

case "${VERCEL_GIT_COMMIT_REF:-}" in
  staging)
    echo "vercel-build: branch is staging — running prisma migrate deploy"
    npx prisma migrate deploy
    ;;
  *)
    echo "vercel-build: branch is ${VERCEL_GIT_COMMIT_REF:-unknown} — skipping migrate deploy (only staging is wired up)"
    ;;
esac

npx prisma generate
next build
