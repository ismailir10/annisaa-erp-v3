# Migration Ordering Fix + Fresh-DB Bootstrap Runbook

## Context
Surfaced during today's `/ship --to-main` (PR #161 → prod): the production Supabase project (`vxwywmvpxetdgnxejjgk`) had never run prisma migrations. First `migrate deploy` failed on `20260421000002_rls_fk_indexes` because that migration creates `CREATE INDEX ... ON "ProgramFeeStructure"("tenantId")` while the column is added by a sibling migration `20260421150000_program_fee_structure_tenant_status` whose lexicographic timestamp (`150000`) sorts AFTER `000002`. Staging passed only because its `ProgramFeeStructure` already had the column when the index migration ran (legacy `db push` provenance). Recovery on prod required `DROP SCHEMA public CASCADE` + `prisma db push` + `prisma migrate resolve --applied <each>` for all 38 migrations. Two latent bombs remain in `prisma/migrations/`: (a) the ordering bug will refire on any future fresh-DB bootstrap, (b) there is no init/baseline migration so `prisma migrate deploy` has no starting point on a clean DB. This cycle closes both before another tenant onboards.

## Spec

### Acceptance criteria

- [ ] Migration `20260421000002_rls_fk_indexes` renamed to a timestamp that sorts AFTER `20260421150000_program_fee_structure_tenant_status`. Specifically: `20260421160000_rls_fk_indexes`.
- [ ] `_prisma_migrations` history rewritten on staging + prod to use the new name (UPDATE statement).
- [ ] `npx prisma migrate status` reports clean against both staging and prod after the rename.
- [ ] `docs/runbooks/fresh-db-bootstrap.md` documents the recovery path used today (DROP SCHEMA → db push → resolve --applied) so the next operator does not have to re-derive it under deploy pressure.
- [ ] README.md ADR row added.

### Non-goals
- Generating a true baseline `_init` migration via `prisma migrate diff`. Heavier change; runbook covers the same operational outcome with less ceremony.
- Reordering any other migrations; only the one with the demonstrated ordering bug.

### Assumptions
- Both staging + prod currently have `20260421000002_rls_fk_indexes` marked finished_at IS NOT NULL in `_prisma_migrations`.
- Renaming via SQL UPDATE preserves the `checksum` column (Prisma doesn't recompute on resolve), so future `migrate deploy` will still match the renamed file's content.
- Renaming the file changes its content (`migration_lock.toml` is unaffected). Prisma's checksum is over the migration.sql contents, not the directory name — so checksum stays valid.

## Tasks

1. [x] Renamed via `git mv prisma/migrations/20260421000002_rls_fk_indexes prisma/migrations/20260421160000_rls_fk_indexes`. New name sorts AFTER `20260421150000_program_fee_structure_tenant_status` (the column-add).
2. [x] Staging `_prisma_migrations` UPDATE — 1 row updated (finished_at preserved 2026-04-21 15:03:44).
3. [x] Prod `_prisma_migrations` UPDATE — 1 row updated (finished_at 2026-05-02 16:30:34 from today's bootstrap).
4. [x] `npx prisma migrate status` against staging → "Database schema is up to date!".
5. [x] `npx prisma migrate status` against prod → "Database schema is up to date!".
6. [x] `docs/runbooks/fresh-db-bootstrap.md` created. Documents `db push` → `migrate resolve --applied` loop pattern with the 2026-05-02 prod incident as the worked example.
7. [x] README ADR row added.

### Out of scope
- Generating a true `_init` baseline migration. Tracked as separate cycle.
- Migrating any other repo conventions. Touch only what's needed.

## Implementation

- Single-commit cycle (no subagent dispatch — every task is a one-shot file rename / SQL UPDATE / doc add).
- Migration directory renamed: `prisma/migrations/20260421160000_rls_fk_indexes/migration.sql` (content unchanged, checksum preserved per Prisma's content-only hash).
- Staging `_prisma_migrations`: UPDATE returned 1 row (old `finished_at` 2026-04-21 15:03:44 preserved on rename).
- Prod `_prisma_migrations`: UPDATE returned 1 row (`finished_at` 2026-05-02 16:30:34 from today's recovery bootstrap, preserved).
- `docs/runbooks/fresh-db-bootstrap.md`: new file. 4-step procedure (verify empty → `db push` → `migrate resolve --applied` loop → verify status). Includes the 2026-05-02 prod incident as the worked example.
- `README.md`: ADR row appended below the lemburCompliant entry.

## Verification

- `npx prisma migrate status` against staging: ✓ "Database schema is up to date!"
- `npx prisma migrate status` against prod: ✓ "Database schema is up to date!"
- `npm run build`: ✓ green.
- `npx vitest run`: ✓ 967 passed | 42 todo (1009 total).
- Lex-sort verification: `ls prisma/migrations/ | grep -E 'rls_fk_indexes|program_fee'` returns the column-add migration first, the index-create migration second — ordering bug closed.

## Ship Notes

### Migrations to run on prod after merge

None. The rename is metadata-only; both staging and prod `_prisma_migrations` were UPDATE'd in this cycle. `prisma migrate deploy` will see all 38 as already applied and no-op.

### What to verify after Vercel deploy

1. Vercel build logs should show `vercel-build: branch is staging — running prisma migrate deploy` followed by no "Applying migration" lines (everything already applied) and successful `next build`.
2. Future tenants: bring up a new Supabase project, follow `docs/runbooks/fresh-db-bootstrap.md`. The previously-broken first run (failure on `20260421000002_rls_fk_indexes`) is now eliminated — the index migration sees `ProgramFeeStructure.tenantId` present.

### Rollback

- Rename file back: `git mv prisma/migrations/20260421160000_rls_fk_indexes prisma/migrations/20260421000002_rls_fk_indexes`.
- UPDATE both `_prisma_migrations` tables back to the old name.
- The original ordering bug returns; defer to a real `_init` baseline migration.

### Out-of-scope follow-ups

- Generate a true `_init` baseline migration via `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` so `prisma migrate deploy` works on a fresh DB without the runbook detour.
- Consider banning bare-suffix migration names (`20260415_enable_rls`) in CI — those sort BEFORE any timestamped migration and break the assumed chronological ordering.
