-- Performance: add missing FK indexes — Phase 5
-- docs/cycles/2026-04-16-perf-phase5.md

-- Campus: tenantId used in RLS filter and list queries
CREATE INDEX "Campus_tenantId_idx" ON "Campus"("tenantId");

-- EmployeeSalaryValue: componentDefId FK — payroll generate fetches all salary values
CREATE INDEX "EmployeeSalaryValue_componentDefId_idx" ON "EmployeeSalaryValue"("componentDefId");

-- PayrollItem: employeeId standalone — composite (payrollRunId, employeeId) exists but
-- doesn't cover standalone employeeId lookups (e.g. "all payroll items for employee")
CREATE INDEX "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");

-- PayrollItemLine: payrollItemId FK — payroll detail page fetches all lines per item
CREATE INDEX "PayrollItemLine_payrollItemId_idx" ON "PayrollItemLine"("payrollItemId");

-- PayrollItemLine: componentDefId FK — payroll detail joins on componentDef
CREATE INDEX "PayrollItemLine_componentDefId_idx" ON "PayrollItemLine"("componentDefId");
