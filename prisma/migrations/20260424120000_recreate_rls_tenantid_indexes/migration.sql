-- Recreate 18 indexes still missing after 20260421000001_rls_security_cleanup.
--
-- Background: 20260421000001 dropped 37 indexes flagged "never used" by Supabase
-- pg_stat_user_indexes. 20260421000002_rls_fk_indexes immediately recreated 19
-- of them as plain single-column FK covers. The remaining 18 — composite
-- indexes (tenantId+status, payrollRunId+employeeId, etc.) and direct
-- tenantId scan paths used by RLS USING clauses — are still absent.
--
-- They are load-bearing once multi-tenant scale arrives (each authenticated
-- SELECT issues a tenantId subquery against User; without an index the
-- planner does a seq scan on every RLS evaluation). Single-tenant ~500 rows
-- masks the problem today.
--
-- CONCURRENTLY note: Prisma wraps each migration file in a single
-- transaction (BEGIN ... COMMIT). PostgreSQL CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction (errors with 25001), and Prisma has no
-- supported escape hatch in this repo's tooling. Plain CREATE INDEX is
-- acceptable here because every target table currently fits in a few
-- hundred rows; the ACCESS EXCLUSIVE lock measures in single-digit ms.
-- Once row counts grow into the millions (post-multi-tenant scale-out),
-- recreate-with-CONCURRENTLY runbook MUST be applied manually outside
-- Prisma before any further schema migration that touches these tables.
-- IF NOT EXISTS keeps every statement idempotent.

-- Legacy lowercase indexes (pre-Prisma era; @@index() in schema still maps
-- to the lowercase name via the existing migration history).
CREATE INDEX IF NOT EXISTS idx_attendance_status ON "AttendanceRecord"(status);
CREATE INDEX IF NOT EXISTS idx_invoice_duedate   ON "Invoice"("dueDate");
CREATE INDEX IF NOT EXISTS idx_invoice_status    ON "Invoice"(status);

-- Student government-compliance lookups (NIS / NISN searches in admin).
CREATE INDEX IF NOT EXISTS "Student_nis_idx"  ON "Student"("nis");
CREATE INDEX IF NOT EXISTS "Student_nisn_idx" ON "Student"("nisn");

-- Payment composite + date scans (finance reports + invoice detail).
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", status);
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx"        ON "Payment"("createdAt");

-- Direct tenantId scan paths referenced by RLS USING clauses.
CREATE INDEX IF NOT EXISTS "Program_tenantId_idx"            ON "Program"("tenantId");
CREATE INDEX IF NOT EXISTS "AcademicYear_tenantId_idx"       ON "AcademicYear"("tenantId");
CREATE INDEX IF NOT EXISTS "AssessmentTemplate_tenantId_idx" ON "AssessmentTemplate"("tenantId");

-- Composite tenant + secondary filter (admin list pages).
CREATE INDEX IF NOT EXISTS "Admission_tenantId_status_idx"             ON "Admission"("tenantId", status);
CREATE INDEX IF NOT EXISTS "SalaryComponentDef_tenantId_isEnabled_idx" ON "SalaryComponentDef"("tenantId", "isEnabled");
CREATE INDEX IF NOT EXISTS "FeeComponentDef_tenantId_status_idx"       ON "FeeComponentDef"("tenantId", status);

-- PayrollItem composite (payroll run detail grouped by employee).
CREATE INDEX IF NOT EXISTS "PayrollItem_payrollRunId_employeeId_idx" ON "PayrollItem"("payrollRunId", "employeeId");

-- StudentAttendance audit filter.
CREATE INDEX IF NOT EXISTS "StudentAttendance_isVoided_idx" ON "StudentAttendance"("isVoided");

-- StudentJournal* tenant-scoped composites (originally created in
-- 20260421000000_student_journal then dropped by 20260421000001).
CREATE INDEX IF NOT EXISTS "StudentJournalEntry_tenantId_studentId_date_idx"
  ON "StudentJournalEntry"("tenantId", "studentId", "date");
CREATE INDEX IF NOT EXISTS "StudentJournalAudit_tenantId_entityType_entityId_idx"
  ON "StudentJournalAudit"("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "StudentJournalAudit_tenantId_changedAt_idx"
  ON "StudentJournalAudit"("tenantId", "changedAt");
