-- Covering indexes for foreign keys flagged by Supabase performance advisor
-- (lint=unindexed_foreign_keys). 17 FKs across 13 tables.
-- Safe on staging (all tables <1k rows). Production rollout must use
-- CREATE INDEX CONCURRENTLY in a separate non-transactional migration.

CREATE INDEX IF NOT EXISTS "Admission_programId_idx" ON "Admission" ("programId");
CREATE INDEX IF NOT EXISTS "AssessmentCategory_templateId_idx" ON "AssessmentCategory" ("templateId");
CREATE INDEX IF NOT EXISTS "AssessmentIndicator_categoryId_idx" ON "AssessmentIndicator" ("categoryId");
CREATE INDEX IF NOT EXISTS "AssessmentTemplate_programId_idx" ON "AssessmentTemplate" ("programId");
CREATE INDEX IF NOT EXISTS "ClassSection_academicYearId_idx" ON "ClassSection" ("academicYearId");
CREATE INDEX IF NOT EXISTS "ClassSection_campusId_idx" ON "ClassSection" ("campusId");
CREATE INDEX IF NOT EXISTS "ClassSection_programId_idx" ON "ClassSection" ("programId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_idx" ON "LeaveRequest" ("employeeId");
CREATE INDEX IF NOT EXISTS "PayrollRun_tenantId_idx" ON "PayrollRun" ("tenantId");
CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_academicYearId_idx" ON "ProgramFeeStructure" ("academicYearId");
CREATE INDEX IF NOT EXISTS "ProgramFeeStructure_feeComponentId_idx" ON "ProgramFeeStructure" ("feeComponentId");
CREATE INDEX IF NOT EXISTS "StudentAssessment_templateId_idx" ON "StudentAssessment" ("templateId");
CREATE INDEX IF NOT EXISTS "StudentAssessmentScore_indicatorId_idx" ON "StudentAssessmentScore" ("indicatorId");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_classSectionId_idx" ON "StudentEnrollment" ("classSectionId");
CREATE INDEX IF NOT EXISTS "StudentJournalEntry_indicatorId_idx" ON "StudentJournalEntry" ("indicatorId");
CREATE INDEX IF NOT EXISTS "User_customRoleId_idx" ON "User" ("customRoleId");
CREATE INDEX IF NOT EXISTS "User_parentId_idx" ON "User" ("parentId");
