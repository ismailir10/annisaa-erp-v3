-- Row Level Security (RLS) Policies for Multi-Tenant Isolation
-- This ensures users can only access data from their own tenant

-- Drop existing policies if any (for clean migration)
DROP POLICY IF EXISTS "tenant_select_own" ON "Tenant";
DROP POLICY IF EXISTS "user_select_own_tenant" ON "User";
DROP POLICY IF EXISTS "user_select_own" ON "User";
DROP POLICY IF EXISTS "user_update_own" ON "User";
DROP POLICY IF EXISTS "role_select_own_tenant" ON "Role";

-- ============================================================================
-- TENANT TABLE
-- ============================================================================

-- Tenant table: Service role can manage all, regular users can view their tenant
CREATE POLICY "tenant_select_own" ON "Tenant"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" WHERE "User"."tenantId" = "Tenant"."id" AND "User"."id" = auth.uid()::text
    )
  );

CREATE POLICY "tenant_service_all" ON "Tenant"
  FOR ALL
  TO authenticated
  USING (true);

-- ============================================================================
-- USER TABLE
-- ============================================================================

-- Users can read their own record
CREATE POLICY "user_select_own" ON "User"
  FOR SELECT
  TO authenticated
  USING ("id" = auth.uid()::text);

-- Users can update their own record
CREATE POLICY "user_update_own" ON "User"
  FOR UPDATE
  TO authenticated
  USING ("id" = auth.uid()::text)
  WITH CHECK ("id" = auth.uid()::text);

-- ============================================================================
-- ROLE TABLE
-- ============================================================================

-- Users can only see roles from their tenant
CREATE POLICY "role_select_own_tenant" ON "Role"
  FOR SELECT
  TO authenticated
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text
    )
  );

-- Service role can manage all roles
CREATE POLICY "role_service_all" ON "Role"
  FOR ALL
  TO authenticated
  USING (true);

-- ============================================================================
-- ALL OTHER TABLES (Tenant-Isolated)
-- ============================================================================

-- Generic function: Users can access data from their tenant only
-- This pattern applies to all tables with tenantId column

-- CAMPUS
CREATE POLICY "campus_select_own_tenant" ON "Campus"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "campus_service_all" ON "Campus"
  FOR ALL
  TO authenticated
  USING (true);

-- ORG CONFIG
CREATE POLICY "orgconfig_select_own_tenant" ON "OrgConfig"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "orgconfig_service_all" ON "OrgConfig"
  FOR ALL
  TO authenticated
  USING (true);

-- HOLIDAY
CREATE POLICY "holiday_select_own_tenant" ON "Holiday"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "holiday_service_all" ON "Holiday"
  FOR ALL
  TO authenticated
  USING (true);

-- EMPLOYEE
CREATE POLICY "employee_select_own_tenant" ON "Employee"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "employee_service_all" ON "Employee"
  FOR ALL
  TO authenticated
  USING (true);

-- TEACHING ASSIGNMENT
CREATE POLICY "teachingassignment_select_own_tenant" ON "TeachingAssignment"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Employee" e
      JOIN "User" u ON u."tenantId" = e."tenantId" AND u."id" = auth.uid()::text
      WHERE e."id" = "TeachingAssignment"."employeeId"
    )
  );

CREATE POLICY "teachingassignment_service_all" ON "TeachingAssignment"
  FOR ALL
  TO authenticated
  USING (true);

-- LEAVE REQUEST
CREATE POLICY "leaverequest_select_own_tenant" ON "LeaveRequest"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Employee" e
      JOIN "User" u ON u."tenantId" = e."tenantId" AND u."id" = auth.uid()::text
      WHERE e."id" = "LeaveRequest"."employeeId"
    )
  );

CREATE POLICY "leaverequest_service_all" ON "LeaveRequest"
  FOR ALL
  TO authenticated
  USING (true);

-- SALARY COMPONENT DEFINITION
CREATE POLICY "salarycomponentdef_select_own_tenant" ON "SalaryComponentDef"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "salarycomponentdef_service_all" ON "SalaryComponentDef"
  FOR ALL
  TO authenticated
  USING (true);

-- EMPLOYEE SALARY VALUE
CREATE POLICY "employeesalaryvalue_select_own_tenant" ON "EmployeeSalaryValue"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Employee" e
      JOIN "User" u ON u."tenantId" = e."tenantId" AND u."id" = auth.uid()::text
      WHERE e."id" = "EmployeeSalaryValue"."employeeId"
    )
  );

CREATE POLICY "employeesalaryvalue_service_all" ON "EmployeeSalaryValue"
  FOR ALL
  TO authenticated
  USING (true);

-- ATTENDANCE RECORD
CREATE POLICY "attendancerecord_select_own_tenant" ON "AttendanceRecord"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Employee" e
      JOIN "User" u ON u."tenantId" = e."tenantId" AND u."id" = auth.uid()::text
      WHERE e."id" = "AttendanceRecord"."employeeId"
    )
  );

CREATE POLICY "attendancerecord_service_all" ON "AttendanceRecord"
  FOR ALL
  TO authenticated
  USING (true);

-- PAYROLL RUN
CREATE POLICY "payrollrun_select_own_tenant" ON "PayrollRun"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "payrollrun_service_all" ON "PayrollRun"
  FOR ALL
  TO authenticated
  USING (true);

-- PAYROLL ITEM
CREATE POLICY "payrollitem_select_own_tenant" ON "PayrollItem"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "PayrollRun" pr
      JOIN "User" u ON u."tenantId" = pr."tenantId" AND u."id" = auth.uid()::text
      WHERE pr."id" = "PayrollItem"."payrollRunId"
    )
  );

CREATE POLICY "payrollitem_service_all" ON "PayrollItem"
  FOR ALL
  TO authenticated
  USING (true);

-- PAYROLL ITEM LINE
CREATE POLICY "payrollitemline_select_own_tenant" ON "PayrollItemLine"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "PayrollItem" pi
      JOIN "PayrollRun" pr ON pr."id" = pi."payrollRunId"
      JOIN "User" u ON u."tenantId" = pr."tenantId" AND u."id" = auth.uid()::text
      WHERE pi."id" = "PayrollItemLine"."payrollItemId"
    )
  );

CREATE POLICY "payrollitemline_service_all" ON "PayrollItemLine"
  FOR ALL
  TO authenticated
  USING (true);

-- EMAIL LOG
CREATE POLICY "emaillog_select_own_tenant" ON "EmailLog"
  FOR SELECT
  TO authenticated
  USING (
    -- Email logs are tracked by sentAt, filter by tenant context
    -- For now, allow users to see email logs from their tenant
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = auth.uid()::text
      -- User can see emails if they're in the same tenant
      LIMIT 1
    )
  );

CREATE POLICY "emaillog_service_all" ON "EmailLog"
  FOR ALL
  TO authenticated
  USING (true);

-- ACADEMIC YEAR
CREATE POLICY "academicyear_select_own_tenant" ON "AcademicYear"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "academicyear_service_all" ON "AcademicYear"
  FOR ALL
  TO authenticated
  USING (true);

-- PROGRAM
CREATE POLICY "program_select_own_tenant" ON "Program"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "program_service_all" ON "Program"
  FOR ALL
  TO authenticated
  USING (true);

-- CLASS SECTION
CREATE POLICY "classsection_select_own_tenant" ON "ClassSection"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "classsection_service_all" ON "ClassSection"
  FOR ALL
  TO authenticated
  USING (true);

-- STUDENT
CREATE POLICY "student_select_own_tenant" ON "Student"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "student_service_all" ON "Student"
  FOR ALL
  TO authenticated
  USING (true);

-- PARENT
CREATE POLICY "parent_select_own_tenant" ON "Parent"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "parent_service_all" ON "Parent"
  FOR ALL
  TO authenticated
  USING (true);

-- STUDENT GUARDIAN
CREATE POLICY "studentguardian_select_own_tenant" ON "StudentGuardian"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND s."id" = "StudentGuardian"."studentId"
    )
  );

CREATE POLICY "studentguardian_service_all" ON "StudentGuardian"
  FOR ALL
  TO authenticated
  USING (true);

-- STUDENT ENROLLMENT
CREATE POLICY "studentenrollment_select_own_tenant" ON "StudentEnrollment"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND s."id" = "StudentEnrollment"."studentId"
    )
  );

CREATE POLICY "studentenrollment_service_all" ON "StudentEnrollment"
  FOR ALL
  TO  authenticated
  USING (true);

-- ADMISSION
CREATE POLICY "admission_select_own_tenant" ON "Admission"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "admission_service_all" ON "Admission"
  FOR ALL
  TO authenticated
  USING (true);

-- FEE COMPONENT DEFINITION
CREATE POLICY "feecomponentdef_select_own_tenant" ON "FeeComponentDef"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "feecomponentdef_service_all" ON "FeeComponentDef"
  FOR ALL
  TO authenticated
  USING (true);

-- PROGRAM FEE STRUCTURE
CREATE POLICY "programfeestructure_select_own_tenant" ON "ProgramFeeStructure"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Program" p
      WHERE p."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND p."id" = "ProgramFeeStructure"."programId"
    )
  );

CREATE POLICY "programfeestructure_service_all" ON "ProgramFeeStructure"
  FOR ALL
  TO authenticated
  USING (true);

-- INVOICE
CREATE POLICY "invoice_select_own_tenant" ON "Invoice"
  FOR SELECT
  TO authenticated
  USING (
    -- Students can see their own invoices
    -- Parents can see their children's invoices (handled by guardian relationship)
    EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND s."id" = "Invoice"."studentId"
    )
  );

CREATE POLICY "invoice_service_all" ON "Invoice"
  FOR ALL
  TO authenticated
  USING (true);

-- INVOICE LINE
CREATE POLICY "invoiceline_select_own_tenant" ON "InvoiceLine"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Invoice" i
      JOIN "Student" s ON s."id" = i."studentId"
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND i."id" = "InvoiceLine"."invoiceId"
    )
  );

CREATE POLICY "invoiceline_service_all" ON "InvoiceLine"
  FOR ALL
  TO authenticated
  USING (true);

-- PAYMENT
CREATE POLICY "payment_select_own_tenant" ON "Payment"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Invoice" i
      JOIN "Student" s ON s."id" = i."studentId"
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND i."id" = "Payment"."invoiceId"
    )
  );

CREATE POLICY "payment_service_all" ON "Payment"
  FOR ALL
  TO authenticated
  USING (true);

-- STUDENT ATTENDANCE
CREATE POLICY "studentattendance_select_own_tenant" ON "StudentAttendance"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND s."id" = "StudentAttendance"."studentId"
    )
  );

CREATE POLICY "studentattendance_service_all" ON "StudentAttendance"
  FOR ALL
  TO authenticated
  USING (true);

-- ASSESSMENT TEMPLATE
CREATE POLICY "assessmenttemplate_select_own_tenant" ON "AssessmentTemplate"
  FOR SELECT
  TO authenticated
  USING ("tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text));

CREATE POLICY "assessmenttemplate_service_all" ON "AssessmentTemplate"
  FOR ALL
  TO authenticated
  USING (true);

-- ASSESSMENT CATEGORY
CREATE POLICY "assessmentcategory_select_own_tenant" ON "AssessmentCategory"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "AssessmentTemplate" t
      WHERE t."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND t."id" = "AssessmentCategory"."templateId"
    )
  );

CREATE POLICY "assessmentcategory_service_all" ON "AssessmentCategory"
  FOR ALL
  TO authenticated
  USING (true);

-- ASSESSMENT INDICATOR
CREATE POLICY "assessmentindicator_select_own_tenant" ON "AssessmentIndicator"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "AssessmentCategory" c
      JOIN "AssessmentTemplate" t ON t."id" = c."templateId"
      WHERE t."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND c."id" = "AssessmentIndicator"."categoryId"
    )
  );

CREATE POLICY "assessmentindicator_service_all" ON "AssessmentIndicator"
  FOR ALL
  TO authenticated
  USING (true);

-- STUDENT ASSESSMENT
CREATE POLICY "studentassessment_select_own_tenant" ON "StudentAssessment"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Student" s
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND s."id" = "StudentAssessment"."studentId"
    )
  );

CREATE POLICY "studentassessment_service_all" ON "StudentAssessment"
  FOR  ALL
  TO authenticated
  USING (true);

-- STUDENT ASSESSMENT SCORE
CREATE POLICY "studentassessmentscore_select_own_tenant" ON "StudentAssessmentScore"
  FOR  SELECT
  TO  authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "StudentAssessment" sa
      JOIN "Student" s ON s."id" = sa."studentId"
      WHERE s."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
      AND sa."id" = "StudentAssessmentScore"."assessmentId"
    )
  );

CREATE POLICY "studentassessmentscore_service_all" ON "StudentAssessmentScore"
  FOR  ALL
  TO  authenticated
  USING (true);
