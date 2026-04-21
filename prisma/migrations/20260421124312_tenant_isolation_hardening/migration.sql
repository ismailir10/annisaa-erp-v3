-- Tenant isolation hardening
-- Cycle: docs/cycles/2026-04-21-tenant-isolation-hardening.md
--
-- 1. EmailLog.tenantId: ADD nullable, backfill (Employee → User → single-tenant), SET NOT NULL, FK, index
-- 2. User.tenantId: guard against NULL rows, SET NOT NULL
-- 3. FeeComponentDef.status: ADD with default 'ACTIVE'
-- 4. Indexes: Role / Program / AcademicYear / Holiday (tenantId); SalaryComponentDef (tenantId + tenantId,isEnabled); FeeComponentDef (tenantId,status)

-- ═══════════════════════════════════════════════════════════════
-- STEP 1 — EmailLog.tenantId (nullable first, then backfill)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "EmailLog" ADD COLUMN "tenantId" TEXT;

-- Backfill pass 1: derive tenantId from Employee.email (salary-slip recipients)
UPDATE "EmailLog" el
SET "tenantId" = e."tenantId"
FROM "Employee" e
WHERE el."to" = e."email" AND el."tenantId" IS NULL;

-- Backfill pass 2: residual rows via User.email
UPDATE "EmailLog" el
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE el."to" = u."email" AND el."tenantId" IS NULL;

-- Backfill pass 3: single-tenant fallback for orphans.
-- Aborts with RAISE EXCEPTION if orphans remain AND tenant count != 1.
DO $$
DECLARE
  orphan_count INT;
  tenant_count INT;
  sole_tenant TEXT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "EmailLog" WHERE "tenantId" IS NULL;
  IF orphan_count = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO tenant_count FROM "Tenant";
  IF tenant_count = 1 THEN
    SELECT id INTO sole_tenant FROM "Tenant" LIMIT 1;
    UPDATE "EmailLog" SET "tenantId" = sole_tenant WHERE "tenantId" IS NULL;
    RAISE NOTICE 'EmailLog backfill: % orphan rows assigned to sole tenant %', orphan_count, sole_tenant;
  ELSE
    RAISE EXCEPTION
      'EmailLog backfill: % orphan rows remain and tenant count = % (need = 1 for fallback). Resolve manually before re-running migration.',
      orphan_count, tenant_count;
  END IF;
END $$;

-- Promote EmailLog.tenantId to NOT NULL + attach FK + index
ALTER TABLE "EmailLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EmailLog"
  ADD CONSTRAINT "EmailLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EmailLog_tenantId_idx" ON "EmailLog"("tenantId");

-- ═══════════════════════════════════════════════════════════════
-- STEP 2 — User.tenantId: guard + SET NOT NULL
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "User" WHERE "tenantId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot promote User.tenantId to NOT NULL: % rows have NULL tenantId. Assign them to a tenant before re-running.',
      null_count;
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- STEP 3 — FeeComponentDef.status
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "FeeComponentDef" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- ═══════════════════════════════════════════════════════════════
-- STEP 4 — Missing tenantId indexes (+ compound indexes)
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");
CREATE INDEX "Program_tenantId_idx" ON "Program"("tenantId");
CREATE INDEX "AcademicYear_tenantId_idx" ON "AcademicYear"("tenantId");
CREATE INDEX "Holiday_tenantId_idx" ON "Holiday"("tenantId");
CREATE INDEX "SalaryComponentDef_tenantId_idx" ON "SalaryComponentDef"("tenantId");
CREATE INDEX "SalaryComponentDef_tenantId_isEnabled_idx" ON "SalaryComponentDef"("tenantId", "isEnabled");
CREATE INDEX "FeeComponentDef_tenantId_status_idx" ON "FeeComponentDef"("tenantId", "status");
