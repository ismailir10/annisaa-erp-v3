-- Corrective migration: recreate FK-covering indexes after unused_index drop triggered
-- unindexed_foreign_keys INFO on 22 FKs. Advisor contradicts itself (unused_index says "drop",
-- unindexed_foreign_keys says "add"); we side with FK coverage for real perf at scale.
-- Non-FK drops from 20260421000001 remain dropped.
-- Idempotent: IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "Admission_programId_idx" ON "Admission"("programId");
CREATE INDEX IF NOT EXISTS "Admission_tenantId_idx" ON "Admission"("tenantId");
CREATE INDEX IF NOT EXISTS "AssessmentCategory_templateId_idx" ON "AssessmentCategory"("templateId");
CREATE INDEX IF NOT EXISTS "AssessmentIndicator_categoryId_idx" ON "AssessmentIndicator"("categoryId");
CREATE INDEX IF NOT EXISTS "AssessmentTemplate_programId_idx" ON "AssessmentTemplate"("programId");
CREATE INDEX IF NOT EXISTS "Campus_tenantId_idx" ON "Campus"("tenantId");
CREATE INDEX IF NOT EXISTS "ClassSection_academicYearId_idx" ON "ClassSection"("academicYearId");
CREATE INDEX IF NOT EXISTS "ClassSection_campusId_idx" ON "ClassSection"("campusId");
CREATE INDEX IF NOT EXISTS "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX IF NOT EXISTS "PayrollItem_payrollRunId_idx" ON "PayrollItem"("payrollRunId");
CREATE INDEX IF NOT EXISTS "PayrollRun_tenantId_idx" ON "PayrollRun"("tenantId");
CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_academicYearId_idx" ON "ProgramFeeStructure"("academicYearId");
CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_feeComponentId_idx" ON "ProgramFeeStructure"("feeComponentId");
CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_tenantId_idx" ON "ProgramFeeStructure"("tenantId");
CREATE INDEX IF NOT EXISTS "StudentAssessment_templateId_idx" ON "StudentAssessment"("templateId");
CREATE INDEX IF NOT EXISTS "StudentAssessmentScore_indicatorId_idx" ON "StudentAssessmentScore"("indicatorId");
CREATE INDEX IF NOT EXISTS "StudentJournalEntry_indicatorId_idx" ON "StudentJournalEntry"("indicatorId");
CREATE INDEX IF NOT EXISTS "TeachingAssignment_classSectionId_idx" ON "TeachingAssignment"("classSectionId");
CREATE INDEX IF NOT EXISTS "User_customRoleId_idx" ON "User"("customRoleId");
CREATE INDEX IF NOT EXISTS "User_parentId_idx" ON "User"("parentId");
