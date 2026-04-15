-- Performance: add missing indexes on high-traffic WHERE fields
-- Phase 3 — docs/cycles/2026-04-15-performance-optimization-phase3.md

-- User: every user-list and auth-lookup filtered by tenantId + status
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- PayrollItem: payroll detail page JOINs on payrollRunId with no index
CREATE INDEX "PayrollItem_payrollRunId_employeeId_idx" ON "PayrollItem"("payrollRunId", "employeeId");

-- Admission: admission list filters WHERE tenantId = ? AND status = ?
CREATE INDEX "Admission_tenantId_status_idx" ON "Admission"("tenantId", "status");

-- ClassSection: class-section list and teacher portal filter by tenantId
CREATE INDEX "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
