-- Performance: add missing FK indexes — Phase 5
-- docs/cycles/2026-04-16-perf-phase5.md

-- Guard each CREATE INDEX with a table-existence check so the migration
-- succeeds even when some tables haven't been created yet.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Campus') THEN
    CREATE INDEX IF NOT EXISTS "Campus_tenantId_idx" ON "Campus"("tenantId");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EmployeeSalaryValue') THEN
    CREATE INDEX IF NOT EXISTS "EmployeeSalaryValue_componentDefId_idx" ON "EmployeeSalaryValue"("componentDefId");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PayrollItem') THEN
    CREATE INDEX IF NOT EXISTS "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PayrollItemLine') THEN
    CREATE INDEX IF NOT EXISTS "PayrollItemLine_payrollItemId_idx" ON "PayrollItemLine"("payrollItemId");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PayrollItemLine') THEN
    CREATE INDEX IF NOT EXISTS "PayrollItemLine_componentDefId_idx" ON "PayrollItemLine"("componentDefId");
  END IF;
END $$;
