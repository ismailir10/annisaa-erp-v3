# Schema Drift Fix — ProgramFeeStructure

## Context

`ProgramFeeStructure` (PFS) has drifted between `prisma/schema.prisma` and the staging Postgres DB.

**Staging DB (`jzhujpqaxyeeokgexerc`) has columns schema.prisma does not declare:**

- `tenantId TEXT NOT NULL` (no default, no FK in schema)
- `status TEXT NOT NULL DEFAULT 'ACTIVE'`
- `amount` type = `double precision` (schema says `Decimal(15, 2)`)

**Source:** ghost migration `20260420194038_program_fee_structure_status_tenant` exists in staging's `_prisma_migrations` tracker but has no corresponding file in `prisma/migrations/` on any branch. Someone applied it out-of-band.

**Symptom:** `prisma.programFeeStructure.create({ data })` fails on staging with `P2011 NullConstraintViolation` because client doesn't know to pass `tenantId`. The seed script worked around this in commit `60a2a7c` by detecting columns at runtime and branching between raw `INSERT` and typed `create`. Workaround masks the drift.

**Prod DB (`qrnbanxcrmrwganpmzmn`)** lags far behind staging — no `ProgramFeeStructure` table exists yet. Only 3 migrations tracked (stuck at 20260415). This cycle's migration will therefore be benign on prod's next full catch-up.

**Out of scope (Cycle 2):** reconciling ghost migration entries in staging's `_prisma_migrations` tracker and the timestamp mismatch on `tenant_isolation_hardening` (repo `20260421124312` vs DB `20260421040632`). Those need destructive tracker edits and their own review.

## Spec

1. `prisma/schema.prisma` PFS model declares the drift columns so the Prisma client knows about them.
2. A new idempotent migration creates the columns on fresh DBs (CI, prod) **and** is a no-op on staging where columns already exist.
3. `amount` type aligned to `Decimal(15, 2)` in the DB (currency must not be `double precision`).
4. `prisma/seed.ts` runtime workaround removed — seed uses the typed client path only.
5. All call sites (`app/api/fee-structure/route.ts`, `app/api/admin/seed/route.ts`, `prisma/seed.ts`) pass `tenantId` on create/upsert.
6. Between-task gate green: `npm run build && npx vitest run`.

## Tasks

1. Update `prisma/schema.prisma` — add `tenantId`, `status`, FK relation, `@@index([tenantId, status])`, and reverse relation on `Tenant`.
2. Hand-author migration `prisma/migrations/20260421150000_program_fee_structure_tenant_status/migration.sql` — idempotent via `IF NOT EXISTS` + `pg_constraint` guard, backfills `tenantId` from `Program.tenantId`, realigns `amount` type.
3. Run `npx prisma generate`. Update all PFS call sites to pass `tenantId`. Remove the seed-side runtime workaround.
4. Gate: `npm run build && npx vitest run`.

## Implementation

**Task 1 — schema.prisma**

- `prisma/schema.prisma`:
  - `ProgramFeeStructure` model: added `tenantId String`, `status String @default("ACTIVE")`, `tenant Tenant @relation(...)` FK, `@@index([tenantId, status])`.
  - `Tenant` model: added `feeStructures ProgramFeeStructure[]` reverse relation.
- `npx prisma generate` regenerated `lib/generated/prisma` client.

**Task 2 — migration**

- `prisma/migrations/20260421150000_program_fee_structure_tenant_status/migration.sql` — hand-authored, idempotent:
  1. `ADD COLUMN IF NOT EXISTS` for `tenantId` (nullable) and `status` (NOT NULL DEFAULT 'ACTIVE').
  2. Backfill `tenantId` from `Program.tenantId` via FK join.
  3. `DO $$ ... RAISE EXCEPTION ...` guard if orphan rows remain.
  4. `SET NOT NULL` on `tenantId`.
  5. FK `ProgramFeeStructure_tenantId_fkey → Tenant(id)` (idempotent via `pg_constraint` lookup).
  6. `CREATE INDEX IF NOT EXISTS ProgramFeeStructure_tenantId_status_idx`.
  7. `ALTER COLUMN "amount" TYPE DECIMAL(15,2)` guarded by `information_schema` check — converts staging's `double precision` back to `Decimal`; no-op on CI fresh DBs where the column is already `numeric`.

**Task 3 — call-site patches**

- `prisma/seed.ts`: removed `information_schema`-based runtime detection + dual-path INSERT block (lines 824-870 previously). PFS creation now uses a single typed `prisma.programFeeStructure.create({ data: { tenantId, ... } })`.
- `app/api/admin/seed/route.ts:200`: added `tenantId` to `upsert.create`.
- `app/api/fee-structure/route.ts` PUT: added `tenantId: session.tenantId` to `upsert.create`.
- `app/api/invoices/generate/route.ts:49` (only `findMany` on PFS) — no patch needed.

## Verification

- `npx prisma generate` → success.
- `npx tsc --noEmit` → clean (no output = no errors).
- `npx vitest run` → `25 passed | 2 skipped · 215 passed | 42 todo` (100% of active tests green).
- `npm run build` → `✓ Compiled successfully` (Next 16.2.3 / Turbopack).
- Migration not yet applied against staging — intentional. `migrate deploy` will run on next staging deploy (via `scripts/vercel-build.sh`); idempotent guards mean it is safe even though staging already has the columns.
- `npx playwright test` (end-of-cycle gate, pre-`/ship`): 37 passed, 1 skipped (`invoice void flips status to CANCELLED` — pre-existing demo skip).

## Ship Notes

- **Migration**: idempotent; safe to run on staging (columns exist), CI fresh DB (creates columns on empty table), prod (PFS table doesn't exist yet — migration DDL will wait for earlier migrations that create the table).
- **Prod prerequisite**: prod catch-up of missed migrations (part of Cycle 2 reconciliation) must precede this migration landing in prod. Migration file order is correct — Postgres will error if `ProgramFeeStructure` table doesn't exist when this runs, which is the desired fail-loud behaviour.
- **Rollback**: `ALTER TABLE "ProgramFeeStructure" DROP COLUMN "tenantId", DROP COLUMN "status"; ALTER TABLE "ProgramFeeStructure" ALTER COLUMN "amount" TYPE double precision USING "amount"::double precision;` — but no sensible reason to roll back (staging already had the columns; we're only restoring declaration truth).
- **No new env vars.**
