-- Backfill-safe composite uniques.
--
-- ClassSection: prevents duplicate class names within the same tenant +
-- academic year. Stops seed re-runs from producing "TKIT A" twice and
-- breaking the count-by-name dashboards.
--
-- PayrollRun: prevents two DRAFT runs for the same period in the same
-- tenant. The /api/payroll/generate route already checks for overlapping
-- periods at app level, but DB-level constraint is the proper safety net.
--
-- ⚠ PRE-DEPLOY DATA INTEGRITY CHECKS (both must return 0 rows):
--
--   SELECT "tenantId", "academicYearId", name, COUNT(*)
--   FROM "ClassSection"
--   GROUP BY "tenantId", "academicYearId", name
--   HAVING COUNT(*) > 1;
--
--   SELECT "tenantId", "periodStart", "periodEnd", COUNT(*)
--   FROM "PayrollRun"
--   GROUP BY "tenantId", "periodStart", "periodEnd"
--   HAVING COUNT(*) > 1;
--
-- If rows are returned, fix the duplicates first.
--
-- Rollback: drop the indexes (no data loss):
--   DROP INDEX "ClassSection_tenantId_academicYearId_name_key";
--   DROP INDEX "PayrollRun_tenantId_periodStart_periodEnd_key";
--
-- Zero-downtime on Vercel Postgres: catalog-only swap on small tables.

CREATE UNIQUE INDEX "ClassSection_tenantId_academicYearId_name_key"
  ON "ClassSection"("tenantId", "academicYearId", "name");

CREATE UNIQUE INDEX "PayrollRun_tenantId_periodStart_periodEnd_key"
  ON "PayrollRun"("tenantId", "periodStart", "periodEnd");
