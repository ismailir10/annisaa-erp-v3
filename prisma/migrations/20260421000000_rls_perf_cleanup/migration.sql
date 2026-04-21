-- RLS performance cleanup (staging advisors: 36 auth_rls_initplan + 34 multiple_permissive_policies).
-- Strategy:
--   (1) *_service_all: recreate with role=service_role (was authenticated). service_role bypasses RLS,
--       so this is a documented no-op but removes the (table, authenticated, SELECT) overlap.
--   (2) *_select_own_tenant + User/Tenant specials: wrap auth.uid() in (SELECT auth.uid()) so the
--       planner evaluates it once per query instead of once per row.
-- Idempotent: DROP POLICY IF EXISTS → CREATE POLICY.

-- =========================================================================
-- 1. *_service_all: re-scope to service_role
-- =========================================================================

DROP POLICY IF EXISTS academicyear_service_all ON "AcademicYear";
CREATE POLICY academicyear_service_all ON "AcademicYear" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS admission_service_all ON "Admission";
CREATE POLICY admission_service_all ON "Admission" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS assessmentcategory_service_all ON "AssessmentCategory";
CREATE POLICY assessmentcategory_service_all ON "AssessmentCategory" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS assessmentindicator_service_all ON "AssessmentIndicator";
CREATE POLICY assessmentindicator_service_all ON "AssessmentIndicator" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS assessmenttemplate_service_all ON "AssessmentTemplate";
CREATE POLICY assessmenttemplate_service_all ON "AssessmentTemplate" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS attendancerecord_service_all ON "AttendanceRecord";
CREATE POLICY attendancerecord_service_all ON "AttendanceRecord" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS campus_service_all ON "Campus";
CREATE POLICY campus_service_all ON "Campus" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS classsection_service_all ON "ClassSection";
CREATE POLICY classsection_service_all ON "ClassSection" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS emaillog_service_all ON "EmailLog";
CREATE POLICY emaillog_service_all ON "EmailLog" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS employee_service_all ON "Employee";
CREATE POLICY employee_service_all ON "Employee" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS employeesalaryvalue_service_all ON "EmployeeSalaryValue";
CREATE POLICY employeesalaryvalue_service_all ON "EmployeeSalaryValue" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS feecomponentdef_service_all ON "FeeComponentDef";
CREATE POLICY feecomponentdef_service_all ON "FeeComponentDef" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS holiday_service_all ON "Holiday";
CREATE POLICY holiday_service_all ON "Holiday" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS invoice_service_all ON "Invoice";
CREATE POLICY invoice_service_all ON "Invoice" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS invoiceline_service_all ON "InvoiceLine";
CREATE POLICY invoiceline_service_all ON "InvoiceLine" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS leaverequest_service_all ON "LeaveRequest";
CREATE POLICY leaverequest_service_all ON "LeaveRequest" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS orgconfig_service_all ON "OrgConfig";
CREATE POLICY orgconfig_service_all ON "OrgConfig" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS parent_service_all ON "Parent";
CREATE POLICY parent_service_all ON "Parent" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS payment_service_all ON "Payment";
CREATE POLICY payment_service_all ON "Payment" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS payrollitem_service_all ON "PayrollItem";
CREATE POLICY payrollitem_service_all ON "PayrollItem" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS payrollitemline_service_all ON "PayrollItemLine";
CREATE POLICY payrollitemline_service_all ON "PayrollItemLine" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS payrollrun_service_all ON "PayrollRun";
CREATE POLICY payrollrun_service_all ON "PayrollRun" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS program_service_all ON "Program";
CREATE POLICY program_service_all ON "Program" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS programfeestructure_service_all ON "ProgramFeeStructure";
CREATE POLICY programfeestructure_service_all ON "ProgramFeeStructure" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS role_service_all ON "Role";
CREATE POLICY role_service_all ON "Role" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS salarycomponentdef_service_all ON "SalaryComponentDef";
CREATE POLICY salarycomponentdef_service_all ON "SalaryComponentDef" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS student_service_all ON "Student";
CREATE POLICY student_service_all ON "Student" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS studentassessment_service_all ON "StudentAssessment";
CREATE POLICY studentassessment_service_all ON "StudentAssessment" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS studentassessmentscore_service_all ON "StudentAssessmentScore";
CREATE POLICY studentassessmentscore_service_all ON "StudentAssessmentScore" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS studentattendance_service_all ON "StudentAttendance";
CREATE POLICY studentattendance_service_all ON "StudentAttendance" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS studentenrollment_service_all ON "StudentEnrollment";
CREATE POLICY studentenrollment_service_all ON "StudentEnrollment" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS studentguardian_service_all ON "StudentGuardian";
CREATE POLICY studentguardian_service_all ON "StudentGuardian" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS teachingassignment_service_all ON "TeachingAssignment";
CREATE POLICY teachingassignment_service_all ON "TeachingAssignment" AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS tenant_service_all ON "Tenant";
CREATE POLICY tenant_service_all ON "Tenant" AS PERMISSIVE FOR ALL TO service_role USING (true);

-- =========================================================================
-- 2. *_select_own_tenant: wrap auth.uid() in (SELECT auth.uid())
-- =========================================================================

DROP POLICY IF EXISTS academicyear_select_own_tenant ON "AcademicYear";
CREATE POLICY academicyear_select_own_tenant ON "AcademicYear" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS admission_select_own_tenant ON "Admission";
CREATE POLICY admission_select_own_tenant ON "Admission" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS assessmentcategory_select_own_tenant ON "AssessmentCategory";
CREATE POLICY assessmentcategory_select_own_tenant ON "AssessmentCategory" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "AssessmentTemplate" t
  WHERE t."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND t.id = "AssessmentCategory"."templateId"
));

DROP POLICY IF EXISTS assessmentindicator_select_own_tenant ON "AssessmentIndicator";
CREATE POLICY assessmentindicator_select_own_tenant ON "AssessmentIndicator" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "AssessmentCategory" c
  JOIN "AssessmentTemplate" t ON t.id = c."templateId"
  WHERE t."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND c.id = "AssessmentIndicator"."categoryId"
));

DROP POLICY IF EXISTS assessmenttemplate_select_own_tenant ON "AssessmentTemplate";
CREATE POLICY assessmenttemplate_select_own_tenant ON "AssessmentTemplate" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS attendancerecord_select_own_tenant ON "AttendanceRecord";
CREATE POLICY attendancerecord_select_own_tenant ON "AttendanceRecord" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Employee" e
  JOIN "User" u ON u."tenantId" = e."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE e.id = "AttendanceRecord"."employeeId"
));

DROP POLICY IF EXISTS campus_select_own_tenant ON "Campus";
CREATE POLICY campus_select_own_tenant ON "Campus" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS classsection_select_own_tenant ON "ClassSection";
CREATE POLICY classsection_select_own_tenant ON "ClassSection" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS emaillog_select_own_tenant ON "EmailLog";
CREATE POLICY emaillog_select_own_tenant ON "EmailLog" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "User" u WHERE u.id = ((SELECT auth.uid()))::text LIMIT 1
));

DROP POLICY IF EXISTS employee_select_own_tenant ON "Employee";
CREATE POLICY employee_select_own_tenant ON "Employee" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS employeesalaryvalue_select_own_tenant ON "EmployeeSalaryValue";
CREATE POLICY employeesalaryvalue_select_own_tenant ON "EmployeeSalaryValue" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Employee" e
  JOIN "User" u ON u."tenantId" = e."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE e.id = "EmployeeSalaryValue"."employeeId"
));

DROP POLICY IF EXISTS feecomponentdef_select_own_tenant ON "FeeComponentDef";
CREATE POLICY feecomponentdef_select_own_tenant ON "FeeComponentDef" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS holiday_select_own_tenant ON "Holiday";
CREATE POLICY holiday_select_own_tenant ON "Holiday" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS invoice_select_own_tenant ON "Invoice";
CREATE POLICY invoice_select_own_tenant ON "Invoice" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND s.id = "Invoice"."studentId"
));

DROP POLICY IF EXISTS invoiceline_select_own_tenant ON "InvoiceLine";
CREATE POLICY invoiceline_select_own_tenant ON "InvoiceLine" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Invoice" i
  JOIN "Student" s ON s.id = i."studentId"
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND i.id = "InvoiceLine"."invoiceId"
));

DROP POLICY IF EXISTS leaverequest_select_own_tenant ON "LeaveRequest";
CREATE POLICY leaverequest_select_own_tenant ON "LeaveRequest" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Employee" e
  JOIN "User" u ON u."tenantId" = e."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE e.id = "LeaveRequest"."employeeId"
));

DROP POLICY IF EXISTS orgconfig_select_own_tenant ON "OrgConfig";
CREATE POLICY orgconfig_select_own_tenant ON "OrgConfig" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS parent_select_own_tenant ON "Parent";
CREATE POLICY parent_select_own_tenant ON "Parent" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS payment_select_own_tenant ON "Payment";
CREATE POLICY payment_select_own_tenant ON "Payment" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Invoice" i
  JOIN "Student" s ON s.id = i."studentId"
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND i.id = "Payment"."invoiceId"
));

DROP POLICY IF EXISTS payrollitem_select_own_tenant ON "PayrollItem";
CREATE POLICY payrollitem_select_own_tenant ON "PayrollItem" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "PayrollRun" pr
  JOIN "User" u ON u."tenantId" = pr."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE pr.id = "PayrollItem"."payrollRunId"
));

DROP POLICY IF EXISTS payrollitemline_select_own_tenant ON "PayrollItemLine";
CREATE POLICY payrollitemline_select_own_tenant ON "PayrollItemLine" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "PayrollItem" pi
  JOIN "PayrollRun" pr ON pr.id = pi."payrollRunId"
  JOIN "User" u ON u."tenantId" = pr."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE pi.id = "PayrollItemLine"."payrollItemId"
));

DROP POLICY IF EXISTS payrollrun_select_own_tenant ON "PayrollRun";
CREATE POLICY payrollrun_select_own_tenant ON "PayrollRun" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS program_select_own_tenant ON "Program";
CREATE POLICY program_select_own_tenant ON "Program" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS programfeestructure_select_own_tenant ON "ProgramFeeStructure";
CREATE POLICY programfeestructure_select_own_tenant ON "ProgramFeeStructure" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Program" p
  WHERE p."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND p.id = "ProgramFeeStructure"."programId"
));

DROP POLICY IF EXISTS role_select_own_tenant ON "Role";
CREATE POLICY role_select_own_tenant ON "Role" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS salarycomponentdef_select_own_tenant ON "SalaryComponentDef";
CREATE POLICY salarycomponentdef_select_own_tenant ON "SalaryComponentDef" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS student_select_own_tenant ON "Student";
CREATE POLICY student_select_own_tenant ON "Student" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));

DROP POLICY IF EXISTS studentassessment_select_own_tenant ON "StudentAssessment";
CREATE POLICY studentassessment_select_own_tenant ON "StudentAssessment" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND s.id = "StudentAssessment"."studentId"
));

DROP POLICY IF EXISTS studentassessmentscore_select_own_tenant ON "StudentAssessmentScore";
CREATE POLICY studentassessmentscore_select_own_tenant ON "StudentAssessmentScore" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "StudentAssessment" sa
  JOIN "Student" s ON s.id = sa."studentId"
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND sa.id = "StudentAssessmentScore"."assessmentId"
));

DROP POLICY IF EXISTS studentattendance_select_own_tenant ON "StudentAttendance";
CREATE POLICY studentattendance_select_own_tenant ON "StudentAttendance" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND s.id = "StudentAttendance"."studentId"
));

DROP POLICY IF EXISTS studentenrollment_select_own_tenant ON "StudentEnrollment";
CREATE POLICY studentenrollment_select_own_tenant ON "StudentEnrollment" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND s.id = "StudentEnrollment"."studentId"
));

DROP POLICY IF EXISTS studentguardian_select_own_tenant ON "StudentGuardian";
CREATE POLICY studentguardian_select_own_tenant ON "StudentGuardian" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)
    AND s.id = "StudentGuardian"."studentId"
));

DROP POLICY IF EXISTS teachingassignment_select_own_tenant ON "TeachingAssignment";
CREATE POLICY teachingassignment_select_own_tenant ON "TeachingAssignment" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM "Employee" e
  JOIN "User" u ON u."tenantId" = e."tenantId" AND u.id = ((SELECT auth.uid()))::text
  WHERE e.id = "TeachingAssignment"."employeeId"
));

-- =========================================================================
-- 3. User + Tenant specials
-- =========================================================================

DROP POLICY IF EXISTS tenant_select_own ON "Tenant";
CREATE POLICY tenant_select_own ON "Tenant" AS PERMISSIVE FOR SELECT TO public
USING (EXISTS (
  SELECT 1 FROM "User"
  WHERE "User"."tenantId" = "Tenant".id AND "User".id = ((SELECT auth.uid()))::text
));

DROP POLICY IF EXISTS user_select_own ON "User";
CREATE POLICY user_select_own ON "User" AS PERMISSIVE FOR SELECT TO authenticated
USING (id = ((SELECT auth.uid()))::text);

DROP POLICY IF EXISTS user_update_own ON "User";
CREATE POLICY user_update_own ON "User" AS PERMISSIVE FOR UPDATE TO authenticated
USING (id = ((SELECT auth.uid()))::text)
WITH CHECK (id = ((SELECT auth.uid()))::text);
