-- Performance: add missing indexes on high-traffic WHERE fields
-- Phase 3 — docs/cycles/2026-04-15-performance-optimization-phase3.md
-- Guard each CREATE INDEX with a table-existence check so the migration
-- succeeds even when some tables haven't been created yet.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User') THEN
    CREATE INDEX IF NOT EXISTS "User_tenantId_status_idx" ON "User"("tenantId", "status");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PayrollItem') THEN
    CREATE INDEX IF NOT EXISTS "PayrollItem_payrollRunId_employeeId_idx" ON "PayrollItem"("payrollRunId", "employeeId");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Admission') THEN
    CREATE INDEX IF NOT EXISTS "Admission_tenantId_status_idx" ON "Admission"("tenantId", "status");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClassSection') THEN
    CREATE INDEX IF NOT EXISTS "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
  END IF;
END $$;
