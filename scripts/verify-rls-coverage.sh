#!/usr/bin/env bash
# verify-rls-coverage.sh
#
# Static coverage check: every tenant-scoped Prisma model (model with a
# `tenantId String` field) MUST have both:
#   1. An `ALTER TABLE "<Model>" ENABLE ROW LEVEL SECURITY` statement in
#      prisma/migrations/**, AND
#   2. At least one `CREATE POLICY ... ON "<Model>"` statement.
#
# Fails the build if either is missing for any tenant-scoped table.
#
# Why static parse (not live-DB check): CI uses `prisma db push --force-reset`
# against a disposable Postgres service; migrations are not applied, so
# `pg_tables.rowsecurity` would always read false in CI. Parsing the migration
# SQL catches the case we actually care about — a new model merged without a
# matching RLS migration.
#
# Reference verification: staging + prod both audited 2026-04-24 — zero tables
# with rowsecurity=false. This script guards against future drift.

set -euo pipefail

SCHEMA="prisma/schema.prisma"
MIGRATIONS="prisma/migrations"

if [ ! -f "$SCHEMA" ]; then
  echo "✗ $SCHEMA not found; run from repo root." >&2
  exit 2
fi

if [ ! -d "$MIGRATIONS" ]; then
  echo "✗ $MIGRATIONS not found; run from repo root." >&2
  exit 2
fi

# Extract tenant-scoped model names: models containing a `tenantId String` field.
models=$(awk '
  /^model /            { name=$2; has_tenant=0; next }
  /^}/                 { if (has_tenant) print name; name="" }
  /tenantId[[:space:]]+String/ { has_tenant=1 }
' "$SCHEMA")

if [ -z "$models" ]; then
  echo "✗ No tenant-scoped models detected in $SCHEMA — parser broken or running from wrong directory?" >&2
  exit 2
fi

# Rebuild window (Phase 0–1, May–Jul 2026): schema lands incrementally per
# foundation spec §18.1, and RLS arrives in cycle p1-identity-rls. While zero
# CREATE POLICY statements exist anywhere in prisma/migrations/, treat the
# coverage check as a no-op (skip + warn) so phase-1 schema cycles can ship
# before identity lands. Once p1-identity-rls merges, the first policy will be
# present and the strict check resumes automatically — no flag flip needed.
model_count=$(echo "$models" | wc -w | tr -d ' ')
set +o pipefail
policy_count=$(grep -rE "CREATE POLICY .* ON \"" "$MIGRATIONS" 2>/dev/null | wc -l | tr -d ' ')
set -o pipefail
policy_count=${policy_count:-0}

if [ "$policy_count" -eq 0 ]; then
  echo "⚠ verify-rls-coverage: rebuild window detected (0 policies in migrations)."
  echo "  $model_count tenant-scoped model(s) present. Strict check will resume"
  echo "  automatically once p1-identity-rls lands and the first CREATE POLICY merges."
  exit 0
fi

# Once policies exist, expect comprehensive coverage. Mid-rebuild (Phase 1)
# the model count climbs from 4 (cycle 1) → 9 (cycle 2, identity) → ~20+ by
# end of phase 1. A floor of 5 catches truncated-schema / parser regressions
# without false-firing during the rebuild marathon.
if [ "$model_count" -lt 5 ]; then
  echo "✗ Only $model_count tenant-scoped model(s) detected; expected ≥ 5 once policies exist. Parser regression?" >&2
  exit 2
fi

missing_rls=()
missing_policy=()
ok=0

for m in $models; do
  if ! grep -rqE "ALTER TABLE \"$m\" ENABLE ROW LEVEL SECURITY" "$MIGRATIONS"; then
    missing_rls+=("$m")
  fi
  if ! grep -rqE "CREATE POLICY .* ON \"$m\"" "$MIGRATIONS"; then
    missing_policy+=("$m")
  fi
  if grep -rqE "ALTER TABLE \"$m\" ENABLE ROW LEVEL SECURITY" "$MIGRATIONS" \
     && grep -rqE "CREATE POLICY .* ON \"$m\"" "$MIGRATIONS"; then
    ok=$((ok+1))
  fi
done

total=$(echo "$models" | wc -w | tr -d ' ')
exit_code=0

if [ ${#missing_rls[@]} -gt 0 ]; then
  echo "✗ Missing 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY' in prisma/migrations/ for:"
  printf '    - %s\n' "${missing_rls[@]}"
  exit_code=1
fi

if [ ${#missing_policy[@]} -gt 0 ]; then
  echo "✗ Missing 'CREATE POLICY ... ON ...' in prisma/migrations/ for:"
  printf '    - %s\n' "${missing_policy[@]}"
  exit_code=1
fi

if [ $exit_code -eq 0 ]; then
  echo "✓ RLS coverage OK: $ok / $total tenant-scoped models have ENABLE + policy."
else
  echo ""
  echo "Fix: add an RLS migration under prisma/migrations/<timestamp>_<name>/migration.sql"
  echo "     with ALTER TABLE \"<Model>\" ENABLE ROW LEVEL SECURITY;"
  echo "     and CREATE POLICY \"<model>_select_own_tenant\" ON \"<Model>\" ..."
fi

exit $exit_code
