-- Schema drift fix: ProgramFeeStructure — add tenantId + status, realign amount type.
-- Cycle: docs/cycles/2026-04-21-schema-drift-pfs.md
--
-- Idempotent. Safe on:
--   * staging (columns already present from ghost migration 20260420194038) — all steps no-op.
--   * CI fresh DB (columns absent, table empty) — ADD + SET NOT NULL proceed on empty rows.
--   * prod (table not yet created) — requires prior migrations to create the table first.

-- ═══════════════════════════════════════════════════════════════
-- STEP 1 — ADD COLUMNS (nullable tenantId first to allow backfill)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "ProgramFeeStructure" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProgramFeeStructure" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- ═══════════════════════════════════════════════════════════════
-- STEP 2 — BACKFILL tenantId via Program FK
-- ═══════════════════════════════════════════════════════════════

UPDATE "ProgramFeeStructure" pfs
SET "tenantId" = p."tenantId"
FROM "Program" p
WHERE pfs."programId" = p."id"
  AND pfs."tenantId" IS NULL;

-- Guard: fail loudly if any rows remain unassigned.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM "ProgramFeeStructure"
  WHERE "tenantId" IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'ProgramFeeStructure backfill: % rows have NULL tenantId after Program FK join. Orphaned PFS rows must be resolved manually.',
      orphan_count;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 3 — Promote tenantId to NOT NULL
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "ProgramFeeStructure" ALTER COLUMN "tenantId" SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- STEP 4 — FK to Tenant (idempotent)
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProgramFeeStructure_tenantId_fkey'
  ) THEN
    ALTER TABLE "ProgramFeeStructure"
      ADD CONSTRAINT "ProgramFeeStructure_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 5 — Compound index [tenantId, status]
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_tenantId_status_idx"
  ON "ProgramFeeStructure"("tenantId", "status");

-- ═══════════════════════════════════════════════════════════════
-- STEP 6 — Realign `amount` to DECIMAL(15, 2)
-- Staging drifted to `double precision`; schema.prisma declares Decimal(15,2).
-- Currency must not be stored as float. Safe: staging has only 12 rows.
-- No-op on CI fresh DBs where the column was created with the correct type.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'ProgramFeeStructure' AND column_name = 'amount';

  IF current_type = 'double precision' THEN
    ALTER TABLE "ProgramFeeStructure"
      ALTER COLUMN "amount" TYPE DECIMAL(15, 2) USING "amount"::numeric;
  END IF;
END $$;
