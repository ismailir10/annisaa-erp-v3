# Vercel Auto-Migrate + Prisma Tracker Baseline

## Context

The 2026-04-21 review sweep follow-up uncovered two infrastructure gaps around Prisma migrations:

1. **Vercel build never ran `prisma migrate deploy`.** The `build` script was `npx prisma generate && next build` — no migrate step. Every migration on disk had to be applied manually through Supabase's SQL editor or via the Supabase MCP `apply_migration` tool. That's error-prone: it's easy to merge a PR whose migration never lands in prod.
2. **Prisma's own `_prisma_migrations` tracker table didn't exist on the staging DB.** All 15 disk migrations had been applied manually, but Prisma had no record of them. If we had turned on `migrate deploy` without baselining, Prisma would have tried to re-apply every migration from scratch and failed on the first `ALTER TABLE ADD COLUMN` because the columns already existed.

This cycle wires Vercel up to run `prisma migrate deploy` during every build, and baselines Prisma's tracker on the staging DB so that step is a safe no-op for everything already applied. Future migrations land automatically on deploy.

## Spec

### Acceptance criteria

- [x] `_prisma_migrations` table exists on staging DB with 15 rows, one per disk migration, all marked finished — already baselined manually via Supabase MCP `apply_migration` before this PR opens.
- [x] `build` script runs `prisma migrate deploy` before `next build`. Same for `build:analyze`.
- [x] README §Development setup documents `DIRECT_URL` as **required** on Vercel, with instructions to grab it from Supabase dashboard.
- [x] `npx prisma validate` passes.

### Non-goals

- **Production DB (`qrnbanxcrmrwganpmzmn`, ap-south-1) left untouched.** Prod is stuck at Phase 1 — only 14/~30 tables exist. Baselining prod's Prisma tracker against disk migrations would lie to Prisma (migrations claim status that isn't actually applied). A separate "production schema rebuild" cycle is needed before prod can use `migrate deploy`.
- **Legacy Supabase-tracker entries** (6 pre-Phase-2 entries in staging's `supabase_migrations.schema_migrations` that have no disk file) are left as historical record. They don't affect Prisma.
- **Shadow DB** for `migrate dev` is still not configured. `migrate deploy` doesn't need one, but anyone wanting to use `migrate dev` locally for new migrations still has to bring their own shadow.

### Assumptions

1. **`DIRECT_URL` will be set on Vercel before this PR merges to staging.** If it's missing, `prisma migrate deploy` falls back to `DATABASE_URL` (the pooler) and hangs on advisory locks — the build will time out. This is why the README change is emphatic about it.
2. **Prisma tracker checksums match disk.** Checksums were computed with `tr -d '\r' < migration.sql | shasum -a 256` for each disk migration — matches Prisma's normalization of `\r\n → \n` before hashing.

## Tasks

### Task 1 — Baseline `_prisma_migrations` on staging (already done via MCP)

- [x] Compute SHA-256 checksum for each of the 15 disk migrations (stripped `\r`).
- [x] `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (…)` with Prisma's schema.
- [x] INSERT 15 rows: `(id, checksum, migration_name, started_at, finished_at, applied_steps_count)` — all `finished_at = now()`, `applied_steps_count = 1`.
- [x] Verified: 15 rows in table, all finished.

**Acceptance:** `SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL` returns 15 on staging.

### Task 2 — Wire `migrate deploy` into the build script

- [x] `package.json` — `build` and `build:analyze` now prefix `npx prisma migrate deploy &&` before `npx prisma generate && next build`.
- [x] `prisma/schema.prisma` datasource stays minimal; `prisma.config.ts` already has `datasource.url = DIRECT_URL ?? DATABASE_URL`.

**Acceptance:** `npx prisma validate` passes. `npm run build` locally would hang because there's no `DIRECT_URL` in local `.env` and the pooler can't hold advisory locks — this is expected and documented. On Vercel with `DIRECT_URL` set, the migrate step runs cleanly and is a no-op because `_prisma_migrations` is already baselined.

### Task 3 — Document `DIRECT_URL` requirement in README

- [x] `README.md` §Development setup env-var table adds a `DIRECT_URL` row with explicit "**required on Vercel**" notes for both staging and production columns.
- [x] Paragraph added below the table explaining why (pooler can't hold advisory locks) and where to get the value (Supabase → Project Settings → Database → Connection string → URI (Direct connection, port 5432)).

**Acceptance:** `git diff README.md` shows the env-var table + the `DIRECT_URL` paragraph and nothing else.

## Implementation

- Task 1: Staging DB baselined before PR opens — `CREATE TABLE _prisma_migrations` + 15 `INSERT` rows applied via Supabase MCP `apply_migration` (name: `baseline_prisma_migrations_tracker`).
- Task 2: `package.json` build scripts now run `npx prisma migrate deploy` before `next build`.
- Task 3: `README.md` updated with `DIRECT_URL` row + explainer paragraph.

## Verification

- `npx prisma validate` ✓
- `_prisma_migrations` row count on staging: 15 (all finished)
- Local `npm run build` will hang on migrate deploy unless `DIRECT_URL` is set — documented, not a regression.

## Ship Notes

**Pre-deploy — set Vercel env vars:**

1. Supabase dashboard → Project `annisaa-erp-v3-staging` → Settings → Database → Connection string → **URI (Direct connection)** → copy.
2. Vercel dashboard → Project → Settings → Environment Variables → add `DIRECT_URL` with that value, scope to all environments that matter (Preview + Production for this Vercel project).
3. For `main` branch / production Vercel deployment: do NOT enable this PR's build script on production until the prod DB (`qrnbanxcrmrwganpmzmn`) has its Prisma tracker baselined. Currently prod is Phase-1-only and would fail on migrate deploy.

**Post-merge smoke test:**
- Trigger a Vercel preview build. The build log should show `npx prisma migrate deploy` running and reporting "No pending migrations to apply."
- If it reports pending migrations, STOP — something is off with the baseline.

**Rollback:**
- Revert the `package.json` change to restore the old `build` script. Prisma tracker rows can stay — they're harmless idle data.

**No new dependencies. No DB schema changes in this PR.**
