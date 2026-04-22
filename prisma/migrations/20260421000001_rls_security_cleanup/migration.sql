-- Security advisor cleanup (7 rls_disabled_in_public ERROR) + performance INFO (unused indexes).
-- Note: auth_leaked_password_protection WARN must be toggled via Supabase Dashboard
-- (Authentication > Providers > Email > "Prevent use of leaked passwords") — not fixable via SQL.

-- =========================================================================
-- 1. Enable RLS on 7 unprotected tables
-- =========================================================================

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalIndicator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentJournalAudit" ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. Policies — mirror existing pattern (service_role ALL + authenticated SELECT own tenant)
-- _prisma_migrations: RLS enabled but NO policies → deny all to authenticated/anon.
-- service_role bypasses RLS so Prisma migrations continue to work.
-- =========================================================================

-- StudentJournalTemplate (direct tenantId)
DROP POLICY IF EXISTS studentjournaltemplate_service_all ON "StudentJournalTemplate";
CREATE POLICY studentjournaltemplate_service_all ON "StudentJournalTemplate" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournaltemplate_select_own_tenant ON "StudentJournalTemplate";
CREATE POLICY studentjournaltemplate_select_own_tenant ON "StudentJournalTemplate" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

-- StudentJournalCategory (join via templateId → StudentJournalTemplate.tenantId)
DROP POLICY IF EXISTS studentjournalcategory_service_all ON "StudentJournalCategory";
CREATE POLICY studentjournalcategory_service_all ON "StudentJournalCategory" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournalcategory_select_own_tenant ON "StudentJournalCategory";
CREATE POLICY studentjournalcategory_select_own_tenant ON "StudentJournalCategory" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "StudentJournalTemplate" t
  WHERE t."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND t.id = "StudentJournalCategory"."templateId"
));

-- StudentJournalIndicator (join via categoryId → Category → Template.tenantId)
DROP POLICY IF EXISTS studentjournalindicator_service_all ON "StudentJournalIndicator";
CREATE POLICY studentjournalindicator_service_all ON "StudentJournalIndicator" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournalindicator_select_own_tenant ON "StudentJournalIndicator";
CREATE POLICY studentjournalindicator_select_own_tenant ON "StudentJournalIndicator" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "StudentJournalCategory" c
  JOIN "StudentJournalTemplate" t ON t.id = c."templateId"
  WHERE t."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND c.id = "StudentJournalIndicator"."categoryId"
));

-- StudentJournalEntry (direct tenantId)
DROP POLICY IF EXISTS studentjournalentry_service_all ON "StudentJournalEntry";
CREATE POLICY studentjournalentry_service_all ON "StudentJournalEntry" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournalentry_select_own_tenant ON "StudentJournalEntry";
CREATE POLICY studentjournalentry_select_own_tenant ON "StudentJournalEntry" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

-- StudentJournalNote (direct tenantId)
DROP POLICY IF EXISTS studentjournalnote_service_all ON "StudentJournalNote";
CREATE POLICY studentjournalnote_service_all ON "StudentJournalNote" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournalnote_select_own_tenant ON "StudentJournalNote";
CREATE POLICY studentjournalnote_select_own_tenant ON "StudentJournalNote" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

-- StudentJournalAudit (direct tenantId)
DROP POLICY IF EXISTS studentjournalaudit_service_all ON "StudentJournalAudit";
CREATE POLICY studentjournalaudit_service_all ON "StudentJournalAudit" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS studentjournalaudit_select_own_tenant ON "StudentJournalAudit";
CREATE POLICY studentjournalaudit_select_own_tenant ON "StudentJournalAudit" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

-- =========================================================================
-- 3. Drop unused indexes (performance INFO advisor)
-- All flagged "never been used" per pg_stat_user_indexes. IF EXISTS = idempotent.
-- =========================================================================

DROP INDEX IF EXISTS idx_attendance_status;
DROP INDEX IF EXISTS idx_invoice_duedate;
DROP INDEX IF EXISTS idx_invoice_status;
DROP INDEX IF EXISTS "Student_nis_idx";
DROP INDEX IF EXISTS "Payment_invoiceId_status_idx";
DROP INDEX IF EXISTS "Student_nisn_idx";
DROP INDEX IF EXISTS "Payment_createdAt_idx";
DROP INDEX IF EXISTS "AssessmentTemplate_tenantId_idx";
DROP INDEX IF EXISTS "PayrollItem_payrollRunId_employeeId_idx";
DROP INDEX IF EXISTS "Admission_tenantId_status_idx";
DROP INDEX IF EXISTS "ClassSection_tenantId_idx";
DROP INDEX IF EXISTS "Campus_tenantId_idx";
DROP INDEX IF EXISTS "StudentAttendance_isVoided_idx";
DROP INDEX IF EXISTS "TeachingAssignment_classSectionId_idx";
DROP INDEX IF EXISTS "ProgramFeeStructure_tenantId_idx";
DROP INDEX IF EXISTS "Program_tenantId_idx";
DROP INDEX IF EXISTS "AcademicYear_tenantId_idx";
DROP INDEX IF EXISTS "SalaryComponentDef_tenantId_isEnabled_idx";
DROP INDEX IF EXISTS "FeeComponentDef_tenantId_status_idx";
DROP INDEX IF EXISTS "StudentJournalEntry_tenantId_studentId_date_idx";
DROP INDEX IF EXISTS "StudentJournalAudit_tenantId_entityType_entityId_idx";
DROP INDEX IF EXISTS "StudentJournalAudit_tenantId_changedAt_idx";
DROP INDEX IF EXISTS "Admission_programId_idx";
DROP INDEX IF EXISTS "AssessmentCategory_templateId_idx";
DROP INDEX IF EXISTS "AssessmentIndicator_categoryId_idx";
DROP INDEX IF EXISTS "AssessmentTemplate_programId_idx";
DROP INDEX IF EXISTS "ClassSection_academicYearId_idx";
DROP INDEX IF EXISTS "ClassSection_campusId_idx";
DROP INDEX IF EXISTS "LeaveRequest_employeeId_idx";
DROP INDEX IF EXISTS "PayrollRun_tenantId_idx";
DROP INDEX IF EXISTS "ProgramFeeStructure_academicYearId_idx";
DROP INDEX IF EXISTS "ProgramFeeStructure_feeComponentId_idx";
DROP INDEX IF EXISTS "StudentAssessment_templateId_idx";
DROP INDEX IF EXISTS "StudentAssessmentScore_indicatorId_idx";
DROP INDEX IF EXISTS "StudentJournalEntry_indicatorId_idx";
DROP INDEX IF EXISTS "User_customRoleId_idx";
DROP INDEX IF EXISTS "User_parentId_idx";
