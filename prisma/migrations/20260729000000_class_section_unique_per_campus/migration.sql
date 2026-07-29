-- Cycle: 2026-07-29 class-picker-year-scoping (T6).
--
-- ClassSection names are scoped per (tenant, academic year) today via
-- ClassSection_tenantId_academicYearId_name_key (added in
-- 20260424000002_class_section_payroll_run_composite_unique). Class names
-- currently embed the campus token ("TK B Metland 3") purely to dodge that
-- constraint — kampus is already its own column and displayed separately.
-- A later task in this cycle strips the campus token from names, which is
-- only safe once two campuses can independently hold the same class name
-- within one academic year. This migration widens the unique key to
-- (tenantId, academicYearId, campusId, name).
--
-- Safe by construction: widening a unique key (adding a column) can only
-- relax the constraint, never violate it — no existing row can conflict
-- under the new, more specific key. No pre-deploy duplicate check needed.
--
-- Rollback: drop the new index and recreate the old one (no data loss):
--   DROP INDEX "ClassSection_tenantId_academicYearId_campusId_name_key";
--   CREATE UNIQUE INDEX "ClassSection_tenantId_academicYearId_name_key"
--     ON "ClassSection"("tenantId", "academicYearId", "name");
--
-- Zero-downtime on Vercel Postgres: catalog-only swap on a small table.

DROP INDEX "ClassSection_tenantId_academicYearId_name_key";

CREATE UNIQUE INDEX "ClassSection_tenantId_academicYearId_campusId_name_key"
  ON "ClassSection"("tenantId", "academicYearId", "campusId", "name");
