# Fresh-DB Bootstrap

How to bring a brand-new empty Supabase project (or any Postgres without `_prisma_migrations` history) up to the current schema.

## When to use

- New tenant onboarding to its own Supabase project.
- Fresh production project replacing a previous one.
- Local dev DB reset where you want migration history populated rather than running `db push` alone.

**Do NOT use** if the target DB already has tables or `_prisma_migrations` rows — that's a migration drift problem, not a bootstrap problem.

## Why not just `prisma migrate deploy`?

The `prisma/migrations/` folder has no init/baseline migration. The earliest migrations (`20260415_enable_rls`, `20260415_rls_policies`, etc.) assume tables already exist — they were added incrementally after the original schema was created via `prisma db push` on the first dev DB. Running `migrate deploy` against an empty DB fails on the first migration because `Tenant` table doesn't exist yet.

## Procedure

### Step 0 — Confirm the target

```bash
# Inspect DATABASE_URL / DIRECT_URL
echo "$DATABASE_URL"
# Expect: a fresh DB. Verify zero tables.
psql "$DIRECT_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# Should be 0.
```

If non-zero, stop. This is a drift recovery problem; don't apply this runbook.

### Step 1 — Push schema directly

```bash
npx prisma db push --url "$DIRECT_URL" --accept-data-loss
```

This creates every table, index, FK, and RLS-enable directive from `prisma/schema.prisma`. No migration history is recorded yet — just schema.

### Step 2 — Mark every migration in the folder as applied

```bash
export DATABASE_URL=...
export DIRECT_URL=...
for m in $(ls prisma/migrations/ | grep -v migration_lock | sort); do
  npx prisma migrate resolve --applied "$m"
done
```

This populates `_prisma_migrations` so future `prisma migrate deploy` calls correctly skip everything that's already applied.

### Step 3 — Verify

```bash
npx prisma migrate status
# Expect: "Database schema is up to date!"

psql "$DIRECT_URL" -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
# Expect: same count as `ls prisma/migrations/ | grep -v migration_lock | wc -l`
```

### Step 4 — Run any policy/RLS migrations not in `prisma/migrations/`

If your tenant needs the Supabase advisor cleanup migrations (`enable_rls`, `advisor_fixes_prod`), apply them now via Supabase MCP / Studio. These live outside `prisma/migrations/` because they were applied as one-off fixes.

## Known incident: 2026-05-02 prod recovery

Prod project `vxwywmvpxetdgnxejjgk` had never run prisma migrations. First `migrate deploy` triggered by `vercel-build.sh` failed on `20260421000002_rls_fk_indexes` (migration ordering bug, since fixed and renamed to `20260421160000_*`). Recovery: `DROP SCHEMA public CASCADE` → followed this runbook → done. Cycle: [`docs/cycles/2026-05-02-migration-ordering-fix.md`](../cycles/2026-05-02-migration-ordering-fix.md).

## Future improvement

A real `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` baseline migration would let `prisma migrate deploy` work on a fresh DB without this runbook. Tracked as a separate cycle. Until then, this runbook is the supported path.
