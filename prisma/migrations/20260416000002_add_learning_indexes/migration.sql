-- Performance: add missing indexes for LEARNING module routes — Phase 6
-- docs/cycles/2026-04-16-query-optimization.md

-- AssessmentTemplate: tenantId — used in template list queries filtered by tenant
CREATE INDEX "AssessmentTemplate_tenantId_idx" ON "AssessmentTemplate"("tenantId");

-- InvoiceLine: invoiceId FK — invoice detail page loads lines for one invoice
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- StudentAttendance: studentId + date — student detail attendance tab filters by studentId
-- Supplements @@unique([studentId, date]) with an explicit index for range queries
CREATE INDEX "StudentAttendance_studentId_date_idx" ON "StudentAttendance"("studentId", "date");
