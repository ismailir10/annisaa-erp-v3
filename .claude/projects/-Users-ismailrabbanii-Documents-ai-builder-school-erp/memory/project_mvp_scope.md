---
name: MVP Scope Decisions (April 2026)
description: Trimmed scope for School ERP MVP - what's in, what's deferred, key business rule answers
type: project
---

## MVP Scope - Decided 2026-04-07

### IN SCOPE
- Attendance tracking (GPS as documentation only, never blocks check-in)
- Payroll calculation with all 13+ salary components from spreadsheet
- BSI CSV export for bank transfer
- PDF salary slip generation + email distribution
- Admin portal (full access)
- Minimal teacher portal (check-in + view salary slips only)
- Single tenant (An Nisaa' Sekolahku), but support campus/branch field
- Holiday calendar management
- Salary component configuration (all components configurable by admin)

### DEFERRED (v2)
- Multi-tenant / Super Admin portal
- GPS enforcement (radius check, manual override request workflow)
- In-app notifications (bell/badge) - use email only
- Offline/PWA capability
- Payroll reopen workflow (24-hour correction window)
- Leave management (requests, approvals, balance tracking)
- Teacher profile editing
- Bulk CSV import for employees/holidays

**Why:** Focus on the essential loop: attendance -> payroll -> CSV -> payslip. Everything else is enhancement.

### Key Business Rules Clarified
- `tunjangan_msk` = "tunjangan masuk" = allowance for coming in on holidays/weekends (ATTENDANCE_BASED)
- `insentif_3m` = stands for 3 words starting with M (not "3 months"). Don't block on understanding this; make it configurable.
- BPJS: some employees are enrolled (get BPJS employer/employee lines), some are not (0)
- `deduksi_dplk_dll` = DPLK and other deductions, varies per employee
- All employees use Bank BSI
- Payroll period: 21st → 20th
- Working days: Mon-Fri, typically 22 days

**How to apply:** When building features, check if they're in the IN SCOPE list. Anything not listed should be deferred unless user explicitly requests it.
