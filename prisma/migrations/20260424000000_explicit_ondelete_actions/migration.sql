-- Explicit referential actions on every relation.
--
-- Prior migrations relied on Prisma's implicit defaults (Restrict for required
-- FKs, SetNull for optional FKs). The schema now declares onDelete on every
-- relation so the contract is visible to anyone reading schema.prisma without
-- having to consult Prisma's defaults table.
--
-- The 21 ALTER TABLE pairs below flip leaf/audit/log relations from RESTRICT
-- to CASCADE. Required relations on core entities (Student, Employee,
-- ClassSection, Tenant, Program, AcademicYear, Campus, Parent) keep RESTRICT
-- and are NOT touched here — the schema declarations match the existing
-- constraints, so Prisma will emit no SQL for them on the next migration.
--
-- Cascade rationale per FK is documented inline in prisma/schema.prisma.

-- ─── OrgConfig.tenantId → Tenant.id : Restrict → Cascade ────────────────────
ALTER TABLE "OrgConfig" DROP CONSTRAINT "OrgConfig_tenantId_fkey";
ALTER TABLE "OrgConfig" ADD CONSTRAINT "OrgConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── TeachingAssignment.employeeId → Employee.id : Restrict → Cascade ──────
ALTER TABLE "TeachingAssignment" DROP CONSTRAINT "TeachingAssignment_employeeId_fkey";
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── TeachingAssignment.classSectionId → ClassSection.id : Restrict → Cascade ─
ALTER TABLE "TeachingAssignment" DROP CONSTRAINT "TeachingAssignment_classSectionId_fkey";
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classSectionId_fkey"
  FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── LeaveRequest.employeeId → Employee.id : Restrict → Cascade ────────────
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_employeeId_fkey";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── EmployeeSalaryValue.employeeId → Employee.id : Restrict → Cascade ─────
ALTER TABLE "EmployeeSalaryValue" DROP CONSTRAINT "EmployeeSalaryValue_employeeId_fkey";
ALTER TABLE "EmployeeSalaryValue" ADD CONSTRAINT "EmployeeSalaryValue_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── AttendanceRecord.employeeId → Employee.id : Restrict → Cascade ────────
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_employeeId_fkey";
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── PayrollItem.payrollRunId → PayrollRun.id : Restrict → Cascade ─────────
ALTER TABLE "PayrollItem" DROP CONSTRAINT "PayrollItem_payrollRunId_fkey";
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── PayrollItemLine.payrollItemId → PayrollItem.id : Restrict → Cascade ───
ALTER TABLE "PayrollItemLine" DROP CONSTRAINT "PayrollItemLine_payrollItemId_fkey";
ALTER TABLE "PayrollItemLine" ADD CONSTRAINT "PayrollItemLine_payrollItemId_fkey"
  FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── EmailLog.tenantId → Tenant.id : Restrict → Cascade ────────────────────
ALTER TABLE "EmailLog" DROP CONSTRAINT "EmailLog_tenantId_fkey";
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentGuardian.studentId → Student.id : Restrict → Cascade ───────────
ALTER TABLE "StudentGuardian" DROP CONSTRAINT "StudentGuardian_studentId_fkey";
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentGuardian.parentId → Parent.id : Restrict → Cascade ─────────────
ALTER TABLE "StudentGuardian" DROP CONSTRAINT "StudentGuardian_parentId_fkey";
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Parent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentEnrollment.studentId → Student.id : Restrict → Cascade ─────────
ALTER TABLE "StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_studentId_fkey";
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── InvoiceLine.invoiceId → Invoice.id : Restrict → Cascade ───────────────
ALTER TABLE "InvoiceLine" DROP CONSTRAINT "InvoiceLine_invoiceId_fkey";
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentAttendance.studentId → Student.id : Restrict → Cascade ─────────
ALTER TABLE "StudentAttendance" DROP CONSTRAINT "StudentAttendance_studentId_fkey";
ALTER TABLE "StudentAttendance" ADD CONSTRAINT "StudentAttendance_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentJournalCategory.templateId → StudentJournalTemplate.id : Restrict → Cascade ─
ALTER TABLE "StudentJournalCategory" DROP CONSTRAINT "StudentJournalCategory_templateId_fkey";
ALTER TABLE "StudentJournalCategory" ADD CONSTRAINT "StudentJournalCategory_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "StudentJournalTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentJournalIndicator.categoryId → StudentJournalCategory.id : Restrict → Cascade ─
ALTER TABLE "StudentJournalIndicator" DROP CONSTRAINT "StudentJournalIndicator_categoryId_fkey";
ALTER TABLE "StudentJournalIndicator" ADD CONSTRAINT "StudentJournalIndicator_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "StudentJournalCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentJournalEntry.indicatorId → StudentJournalIndicator.id : Restrict → Cascade ─
ALTER TABLE "StudentJournalEntry" DROP CONSTRAINT "StudentJournalEntry_indicatorId_fkey";
ALTER TABLE "StudentJournalEntry" ADD CONSTRAINT "StudentJournalEntry_indicatorId_fkey"
  FOREIGN KEY ("indicatorId") REFERENCES "StudentJournalIndicator"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── AssessmentCategory.templateId → AssessmentTemplate.id : Restrict → Cascade ─
ALTER TABLE "AssessmentCategory" DROP CONSTRAINT "AssessmentCategory_templateId_fkey";
ALTER TABLE "AssessmentCategory" ADD CONSTRAINT "AssessmentCategory_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── AssessmentIndicator.categoryId → AssessmentCategory.id : Restrict → Cascade ─
ALTER TABLE "AssessmentIndicator" DROP CONSTRAINT "AssessmentIndicator_categoryId_fkey";
ALTER TABLE "AssessmentIndicator" ADD CONSTRAINT "AssessmentIndicator_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "AssessmentCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentAssessmentScore.assessmentId → StudentAssessment.id : Restrict → Cascade ─
ALTER TABLE "StudentAssessmentScore" DROP CONSTRAINT "StudentAssessmentScore_assessmentId_fkey";
ALTER TABLE "StudentAssessmentScore" ADD CONSTRAINT "StudentAssessmentScore_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "StudentAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── StudentAssessmentScore.indicatorId → AssessmentIndicator.id : Restrict → Cascade ─
ALTER TABLE "StudentAssessmentScore" DROP CONSTRAINT "StudentAssessmentScore_indicatorId_fkey";
ALTER TABLE "StudentAssessmentScore" ADD CONSTRAINT "StudentAssessmentScore_indicatorId_fkey"
  FOREIGN KEY ("indicatorId") REFERENCES "AssessmentIndicator"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
