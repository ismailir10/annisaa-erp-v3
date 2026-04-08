# School ERP — Teacher Attendance & Payroll System
**Version**: 9.0 · **Status**: v1 Shipped, Planning v2 · **Date**: 2026-04-08

---

## 1. Executive Summary

### 1.1 What We're Building

A web-based attendance and payroll management system for **An Nisaa' Sekolahku** that replaces Google Sheets + Apps Script. The system handles daily teacher attendance tracking, monthly payroll calculation, BSI bank CSV export, and PDF salary slip generation.

### 1.2 MVP Scope

| In Scope | Out of Scope (v2) |
|----------|-------------------|
| Teacher attendance (check-in/out, GPS as documentation) | GPS enforcement / radius blocking |
| Admin attendance dashboard + override | Leave management (requests, approvals, balance) |
| Payroll calculation (all 13 components) | Multi-tenant / Super Admin portal |
| Salary slip PDF + email distribution | In-app notifications (bell/badge) |
| BSI bank CSV export | Offline / PWA capability |
| Single-tenant (with campus/branch support) | Payroll reopen workflow |
| Minimal teacher portal (check-in, calendar, slips) | Bulk CSV import |
| Seed script from existing spreadsheet data | Teacher profile editing |
| Email: magic link auth + salary slip distribution | Manual payment recording with receipts |

### 1.3 MVP Feature List (20 features)

| # | Feature | Actor | Priority |
|---|---------|-------|----------|
| 0 | Seed script (employees, salary values, holidays, campuses) | Infra | P0 |
| 1 | Auth (Google OAuth + Magic Link) | All | P0 |
| 2 | Campus CRUD (name, address, lat/lng) | Admin | P0 |
| 3 | Org Config (working days, hours, grace, timezone, payroll period) | Admin | P0 |
| 4 | Holiday Calendar CRUD | Admin | P0 |
| 5 | Salary Component Definitions (all 13, configurable) | Admin | P0 |
| 6 | Employee CRUD + Deactivate | Admin | P0 |
| 7 | Employee Salary Values Editor | Admin | P0 |
| 8 | Teacher Check-in / Check-out (GPS as documentation) | Teacher | P0 |
| 9 | Teacher Attendance Calendar (monthly, color-coded) | Teacher | P0 |
| 10 | Admin Attendance Dashboard (today view) | Admin | P0 |
| 11 | Admin Monthly Attendance View | Admin | P0 |
| 12 | Admin Attendance Override (with LEAVE status option) | Admin | P0 |
| 13 | Payroll Draft Generation | Admin | P0 |
| 14 | Attendance Variables Editor (overtime, outdoor, etc.) | Admin | P0 |
| 15 | Payroll Review + Line Adjustment | Admin | P0 |
| 16 | Payroll Approve (locks attendance) | Admin | P0 |
| 17 | BSI CSV Export (with excluded employee visibility) | Admin | P0 |
| 18 | PDF Salary Slip Generation | Admin | P0 |
| 19 | Email Salary Slips | Admin | P0 |
| 20 | Teacher View/Download Salary Slips | Teacher | P0 |

### 1.4 Success Metrics

| Metric | Target |
|--------|--------|
| Payroll processing time | < 30 minutes (draft → approve → export → send slips) |
| Salary slip delivery | 100% of employees with email receive PDF |
| Data accuracy | Net pay matches manual spreadsheet calculation |
| Page load time | < 2s on 4G connection |

---

## 2. Current State

### 2.1 An Nisaa' Sekolahku

- 2 campuses: Taman Aster, Metland Cibitung
- 24 employees across both campuses
- All payments via Bank BSI
- Payroll period: 21st of previous month → 20th of current month
- Working days: Monday - Friday

### 2.2 Current Workflow

```
1. Teachers mark attendance on paper → Admin transcribes to spreadsheet
2. Admin manually calculates working days (hardcoded 22)
3. Admin fills salary columns per employee in spreadsheet
4. Admin runs Apps Script → Generates PDFs via Google Docs template
5. Apps Script emails PDFs to teachers
6. Admin manually creates BSI bank transfer CSV
```

### 2.3 Problems Solved by MVP

| Problem | Solution |
|---------|----------|
| Manual attendance entry, error-prone | Teacher self-check-in via mobile |
| Hardcoded 22 working days | System calculates actual working days (minus holidays/weekends) |
| No attendance visibility for teachers | Teacher attendance calendar |
| Brittle PDF generation (Google Docs find-replace) | React PDF generation, reliable and consistent |
| No approval gate before sending slips | Payroll review → approve → export → send workflow |
| No audit trail | All payroll operations logged |
| Manual BSI CSV creation | Auto-generated from approved payroll |

---

## 3. Executive Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-1 | Salary components use **row-based model** | Admin can add/remove components without code changes |
| D-2 | `is_pro_rated` flag on salary components | Indonesia Labor Law: pro-rating for partial periods |
| D-3 | GPS captured but **never blocks** check-in | Documentation only, reduces complexity |
| D-4 | LATE = checkInTime > (workStartTime + gracePeriodMinutes) | Standard time-based calculation |
| D-5 | Check-out included but PRESENT_NO_CHECKOUT counts as present | Teacher was there, just forgot |
| D-6 | Attendance variables (overtime, outdoor, etc.) entered by admin during payroll review | Flexibility, matches current manual process |
| D-7 | BPJS: varies per employee, some not enrolled | Configurable per employee, not formula-based |
| D-8 | Payroll period: 21st → 20th (configurable in org config) | Matches An Nisaa's current practice |
| D-9 | Single-tenant MVP | Multi-tenant deferred to v2 |
| D-10 | Admin can override attendance to LEAVE status with note | Replaces full leave management workflow for MVP |
| D-11 | Seed script loads all 24 employees from spreadsheet | Eliminates painful manual first-time setup |

---

## 4. Actors & Permissions

### 4.1 MVP Actors

| Actor | Description |
|-------|-------------|
| **School Admin** | Principal or HR staff. Full access to school data, payroll approval |
| **Teacher** | School employee. Check-in/out, view own attendance, view own salary slips |

### 4.2 Permission Matrix

| Action | Admin | Teacher |
|--------|-------|---------|
| Configure campus / org / holidays | ✅ | ❌ |
| Manage salary components | ✅ | ❌ |
| Create/edit/deactivate employee | ✅ | ❌ |
| Set employee salary values | ✅ | ❌ |
| View all attendance | ✅ | ❌ |
| Override attendance | ✅ | ❌ |
| Run/review/approve payroll | ✅ | ❌ |
| Export BSI CSV | ✅ | ❌ |
| Generate + send salary slips | ✅ | ❌ |
| Check in / Check out | ❌ | ✅ |
| View own attendance calendar | ❌ | ✅ |
| View/download own salary slips | ❌ | ✅ |

---

## 5. User Stories & Acceptance Criteria

### 5.1 Admin Stories

#### ADM-1: Configure Campus

**As a** School Admin **I want to** add/edit campus details **so that** employees can be assigned to branches.

**Acceptance Criteria**:
1. Fields: Name (required), Address, Latitude, Longitude
2. "Get Current Location" button auto-fills lat/lng from browser GPS
3. List view shows all campuses with employee count
4. Cannot delete campus if employees are assigned

---

#### ADM-2: Configure Organization

**As a** School Admin **I want to** set working hours and payroll period **so that** attendance and payroll calculate correctly.

**Acceptance Criteria**:
1. Fields: Working Days (multi-select Mon-Sun), Work Start/End time, Grace Period (0-60 min), Timezone, Payroll Period Start/End Day
2. Save confirms: "This affects future calculations only"
3. Defaults seeded: Mon-Fri, 07:00-16:00, 15 min grace, Asia/Jakarta, 21-20

---

#### ADM-3: Manage Holiday Calendar

**As a** School Admin **I want to** manage holidays **so that** working days are calculated correctly.

**Acceptance Criteria**:
1. Add: Date, Name, Type (National/Islamic/School Closure), Is Half Day
2. List: Grouped by month, sortable
3. No duplicate dates
4. Holidays seeded from spreadsheet for 2024-2026

---

#### ADM-4: Manage Salary Components

**As a** School Admin **I want to** define salary component types **so that** payroll matches our compensation structure.

**Acceptance Criteria**:
1. Fields: Code (unique, lowercase), Label, Category (Income/Deduction), Calc Type (FIXED/PCT_OF_BASE/ATTENDANCE_BASED), Is Pro-rated, Sort Order, Is Enabled
2. List: Ordered by sort order, enable/disable toggle
3. Disable preserves history (soft delete)
4. 13 components seeded from spreadsheet

---

#### ADM-5: Manage Employees

**As a** School Admin **I want to** create/edit teacher profiles **so that** they can check in and be paid.

**Acceptance Criteria**:
1. Required: Employee Code (unique), Name, Email, Position, Campus, Hire Date
2. Optional: Formal Name, Phone, Bank Name, Bank Account No, BPJS Enrolled
3. On create: Employee created, user account created (can receive magic link)
4. Deactivate: Sets status INACTIVE, excluded from future payroll
5. List: Searchable, filterable by campus and status

---

#### ADM-6: Set Employee Salary Values

**As a** School Admin **I want to** set each teacher's salary component values **so that** payroll calculates correctly.

**Acceptance Criteria**:
1. Accessible from Employee detail → Salary tab
2. Table: Component Label | Category | Calc Type | Value | Actions
3. Value input depends on calc type: FIXED (amount), ATTENDANCE_BASED (per-unit amount), PCT_OF_BASE (percentage)
4. Save updates effective immediately
5. Values seeded from spreadsheet for all 24 employees

---

#### ADM-7: View Today's Attendance

**As a** School Admin **I want to** see real-time daily attendance **so that** I know who's present/absent.

**Acceptance Criteria**:
1. Filter by: Date (default today), Campus
2. Summary cards: Present, Late, Absent, Leave, Total
3. Table: Name | Campus | Check-in Time | Status | Check-out Time | Actions
4. Status badges with color coding
5. Override button per row

---

#### ADM-8: View Monthly Attendance

**As a** School Admin **I want to** review monthly attendance before running payroll **so that** records are accurate.

**Acceptance Criteria**:
1. Filter by: Month/Year, Campus, Employee
2. Calendar grid with color-coded status per day per employee
3. Summary row: Present count, Late count, Absent count, Leave count per employee
4. Click day → override modal

---

#### ADM-9: Override Attendance

**As a** School Admin **I want to** manually correct attendance records **so that** mistakes are fixed.

**Acceptance Criteria**:
1. Modal: Status (PRESENT / LATE / ABSENT / LEAVE / HALF_DAY), Check-in Time, Check-out Time, Reason (required)
2. On save: Record updated, override metadata stored (who, when, reason)
3. Cannot override locked records (payroll approved)
4. LEAVE status available as override option with reason note (e.g., "sakit", "izin keluarga")

---

#### ADM-10: Generate Payroll Draft

**As a** School Admin **I want to** generate a payroll draft **so that** I can review before approval.

**Acceptance Criteria**:
1. Form: Period Start/End (auto-suggested based on org config)
2. System calculates: actual working days, attendance counts per employee
3. System calculates all salary components for all active employees
4. Progress indicator during processing
5. On complete: Redirect to payroll detail page
6. Shows warnings: employees without bank account, zero net pay, no salary values

---

#### ADM-11: Edit Attendance Variables

**As a** School Admin **I want to** enter attendance-related variables per employee **so that** ATTENDANCE_BASED components calculate correctly.

**Acceptance Criteria**:
1. Accessible from payroll detail → employee row → "Edit Variables"
2. Fields per employee: Overtime Hours (decimal), Outdoor Days (integer), Holiday Worked Days (integer), DC Days (integer)
3. Real-time preview of affected component amounts
4. Save recalculates that employee's payroll instantly

---

#### ADM-12: Review & Adjust Payroll

**As a** School Admin **I want to** review payroll line-by-line **so that** I can correct errors.

**Acceptance Criteria**:
1. Summary: Period, Working Days, Status, Total Gross, Total Deductions, Total Net
2. Employee table with expandable rows showing all component lines
3. Per-line manual adjustment: new amount + required note
4. "Recalculate" button resets all manual adjustments
5. Filter: "Show without bank account" to identify manual payment employees

---

#### ADM-13: Approve Payroll

**As a** School Admin **I want to** approve payroll **so that** it's finalized and I can export/send slips.

**Acceptance Criteria**:
1. Confirmation modal with full summary
2. Warnings for: employees without bank account, zero net pay
3. On approve: Status = APPROVED, attendance locked for this period
4. After approval: Export CSV and Send Slips buttons become available
5. Cannot edit after approval (create new run to fix mistakes)

---

#### ADM-14: Export BSI CSV

**As a** School Admin **I want to** export BSI-format CSV **so that** I can upload to internet banking.

**Acceptance Criteria**:
1. Only available when payroll is APPROVED
2. CSV format: `rekening_tujuan,nama_pemilik,nominal,keterangan`
3. Filename: `payroll_{period_start}_{period_end}_bsi.csv`
4. Employees without bank account are excluded
5. **Excluded employees shown in a list** before download so admin knows who to pay manually
6. Immediate download + confirmation toast

---

#### ADM-15: Send Salary Slips

**As a** School Admin **I want to** email salary slips to all employees **so that** they receive their pay records.

**Acceptance Criteria**:
1. Only available when payroll is APPROVED
2. Confirmation modal: shows count, lists employees without email (excluded)
3. Generates PDF per employee with all component lines
4. Sends email with PDF attachment via Resend
5. Progress indicator: "Sending X of Y..."
6. "Resend to failed" button if any fail

---

### 5.2 Teacher Stories

#### TCH-1: Check In

**As a** Teacher **I want to** tap Check In **so that** my attendance is recorded.

**Acceptance Criteria**:
1. Large Check In button with current time display
2. On tap: Requests GPS permission → captures lat/lng (documentation only, never blocks)
3. Records check-in time, determines status (PRESENT or LATE based on grace period)
4. Success: Shows status + time with visual confirmation
5. Late: Shows "Terlambat X menit" in warning color
6. Already checked in today: Shows current status, no duplicate check-in
7. GPS denied: Check-in still works, lat/lng stored as null

---

#### TCH-2: Check Out

**As a** Teacher **I want to** tap Check Out **so that** my full attendance is recorded.

**Acceptance Criteria**:
1. Check Out button visible only after check-in
2. Shows duration since check-in
3. On tap: Records check-out time, shows confirmation with total duration
4. No check-in today: Check Out button hidden
5. Next day: Button resets to Check In

---

#### TCH-3: View Attendance Calendar

**As a** Teacher **I want to** view my attendance history in a calendar **so that** I can verify my records.

**Acceptance Criteria**:
1. Monthly calendar grid, current month default
2. Color-coded days: Green=PRESENT, Yellow=LATE, Red=ABSENT, Blue=LEAVE, Purple=HOLIDAY, Gray=Weekend, Orange=NO_CHECKOUT
3. Month navigation (previous/next)
4. Tap day → detail: Check-in time, Check-out time, Status, Duration
5. Bottom summary: Present X, Late X, Absent X, Leave X
6. Can view past months

---

#### TCH-4: View Salary Slips

**As a** Teacher **I want to** view and download my salary slips **so that** I have payment records.

**Acceptance Criteria**:
1. List: Period | Net Pay | Status (Available/Pending) | Download
2. Download opens PDF in new tab
3. PDF shows: employee info, period, all component lines, gross/deductions/net, bank info
4. Filter by year

---

## 6. Key User Scenarios

### 6.1 Admin: First-Time Setup (Post-Seed)

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Admin receives magic link → logs in | Dashboard shown with seeded data |
| 2 | Reviews 2 campuses (Taman Aster, Metland Cibitung) | Pre-populated from seed |
| 3 | Reviews org config (Mon-Fri, 07:00-16:00, 15min grace) | Pre-populated |
| 4 | Reviews holiday calendar (2024-2026) | Pre-populated |
| 5 | Reviews 13 salary components | Pre-populated |
| 6 | Reviews 24 employees with salary values | Pre-populated from spreadsheet |
| 7 | Spot-checks a few employees' salary values | Values match spreadsheet |
| 8 | Setup verified — ready for daily use | |

### 6.2 Admin: Daily Attendance Monitoring

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens dashboard at ~09:30 | Summary: 18 Present, 3 Late, 1 Absent |
| 2 | Filters by "Taman Aster" | Shows 14 employees |
| 3 | Sees "Gisa" is ABSENT | Red badge |
| 4 | Gets WhatsApp: "Gisa sakit hari ini" | (External) |
| 5 | Clicks Override on Gisa's row | Override modal opens |
| 6 | Sets status=LEAVE, reason="Sakit, konfirmasi via WA" | Saves, Gisa now shows LEAVE (blue) |

### 6.3 Admin: Attendance Correction

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Teacher Yohana calls: "Lupa check-in, saya hadir jam 07:05" | (External) |
| 2 | Admin opens Attendance, finds Yohana today = ABSENT | |
| 3 | Clicks Override → sets PRESENT, check-in 07:05 | |
| 4 | Reason: "Lupa check-in, dikonfirmasi hadir" | Saves, Yohana now PRESENT |

### 6.4 Admin: Monthly Payroll Run (Critical Path)

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens Payroll → "Generate Draft" | Period auto-filled: Mar 21 → Apr 20 |
| 2 | Clicks Generate | Progress: "Processing 1 of 24..." |
| 3 | | Draft created, redirected to detail |
| 4 | Reviews summary | Total: Rp 52M gross, 24 employees, 22 working days |
| 5 | Clicks employee "Redacted Employee" → expands | Shows all 13 component lines |
| 6 | Clicks "Edit Variables" for Redacted Employee | Variables form opens |
| 7 | Enters: overtime=10, outdoor=2, dc=3 | Preview: +Rp 350,000 |
| 8 | Saves | Redacted Employee recalculated |
| 9 | Repeats for employees with attendance variables | |
| 10 | Spots error: Hana's transport looks wrong | |
| 11 | Clicks transport line → adjusts to 1,200,000 | Note required: "koreksi manual" |
| 12 | All reviewed → clicks "Approve" | Modal: summary + "1 employee without bank" warning |
| 13 | Confirms | Status=APPROVED, attendance locked |
| 14 | Clicks "Export BSI CSV" | Shows excluded: "Gisa (no bank account)" |
| 15 | Clicks Download | CSV downloaded: 23 rows |
| 16 | Uploads CSV to BSI internet banking | (External) |
| 17 | Clicks "Send Salary Slips" | Modal: "Send 24 slips?" |
| 18 | Confirms | Progress: "24 of 24 sent" ✓ |

### 6.5 Admin: Add New Employee

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens Employees → "Add Employee" | Form shown |
| 2 | Fills: code=NR24, name=Nariyah, email, position, campus | |
| 3 | Saves | Employee created, user account created |
| 4 | Opens Nariyah → Salary tab | All components shown with value = 0 |
| 5 | Sets each salary value | Saved |
| 6 | Nariyah can now log in and check in | |

### 6.6 Admin: Deactivate Employee

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens Vinne (VOHA23) → clicks Deactivate | Confirmation: "Vinne will no longer be able to check in" |
| 2 | Confirms | Status=INACTIVE |
| 3 | Next payroll run | Vinne excluded (or included with final amounts if still in period) |

### 6.7 Teacher: Daily Check-in (Happy Path)

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens app at 07:05 | "Selamat Pagi, Bu Rina!" + CHECK IN button |
| 2 | Taps CHECK IN | GPS permission requested |
| 3 | Allows GPS | Fetching location... |
| 4 | | "✓ Hadir - 07:05" (green) + GPS: -6.2234, 106.8432 |
| 5 | Button changes to CHECK OUT | Shows: "Sudah hadir sejak 07:05" |

### 6.8 Teacher: Late Check-in

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens app at 07:25 | CHECK IN button shown |
| 2 | Taps CHECK IN | GPS captured |
| 3 | | "⚠ Terlambat 10 menit - 07:25" (yellow) |

### 6.9 Teacher: Check-out

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens app at 16:00 | CHECK OUT button + "Sudah hadir 8j 55m" |
| 2 | Taps CHECK OUT | "✓ Pulang - 16:00. Durasi: 8 jam 55 menit" |
| 3 | Tomorrow | Button resets to CHECK IN |

### 6.10 Teacher: Forgot Check-out

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Teacher checked in at 07:10, forgot to check out | |
| 2 | Next day, opens attendance calendar | Yesterday shows orange: PRESENT_NO_CHECKOUT |
| 3 | | Counts as present for payroll |

### 6.11 Teacher: View Attendance Calendar

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens Attendance tab | March 2026 calendar shown |
| 2 | Sees color-coded days | Green/yellow/red/blue/purple/gray |
| 3 | Taps March 15 (green) | Modal: "Check-in: 07:11, Check-out: 16:05, PRESENT" |
| 4 | Bottom summary | Present: 18, Late: 2, Absent: 1, Leave: 1 |
| 5 | Navigates to February | Previous month shown |

### 6.12 Teacher: View Salary Slip

| Step | Action | System Response |
|------|--------|-----------------|
| 1 | Opens Salary Slips tab | List: "Mar 2026 | Rp 3,395,000 | ✓" |
| 2 | Taps March entry | PDF opens in new tab |
| 3 | Sees all components, gross, deductions, net | Matches email PDF |

---

## 7. Screen Catalog

### 7.1 Complete Screen List (17 screens)

| # | Screen | Actor | Route |
|---|--------|-------|-------|
| 1 | Login | All | `/` |
| 2 | Admin Dashboard | Admin | `/admin` |
| 3 | Campus List + Form | Admin | `/admin/campuses` |
| 4 | Org Config | Admin | `/admin/config` |
| 5 | Holiday Calendar | Admin | `/admin/holidays` |
| 6 | Salary Components | Admin | `/admin/salary-components` |
| 7 | Employee List | Admin | `/admin/employees` |
| 8 | Employee Detail + Salary Tab | Admin | `/admin/employees/[id]` |
| 9 | Today's Attendance | Admin | `/admin/attendance` |
| 10 | Monthly Attendance | Admin | `/admin/attendance/monthly` |
| 11 | Payroll List | Admin | `/admin/payroll` |
| 12 | Payroll Detail (review + approve) | Admin | `/admin/payroll/[id]` |
| 13 | Teacher Dashboard + Check-in | Teacher | `/teacher` |
| 14 | Teacher Attendance Calendar | Teacher | `/teacher/attendance` |
| 15 | Teacher Salary Slips | Teacher | `/teacher/slips` |

Plus modals: Attendance Override, Attendance Variables, Line Adjustment, Payroll Approve, Send Slips, BSI Export preview.

---

## 8. Design System — Revolut-Inspired

### 8.1 Design Philosophy

Inspired by [Revolut's](https://revolut.com) fintech design: clean, minimal, confident. Every screen should feel like a premium financial tool, not a generic admin panel.

**Principles**:
1. **Breathing Room** — Generous whitespace. Let content breathe. Never cram.
2. **Data Clarity** — Numbers are the hero. Large, readable, monospaced for amounts.
3. **Confident Color** — One dominant dark surface + one sharp accent. No timid pastels.
4. **Motion with Purpose** — Subtle transitions that guide attention, not distract.
5. **Mobile-Native Feel** — Even on desktop, interactions should feel touch-friendly.

### 8.2 Typography

**Primary Font**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- Indonesian-origin geometric sans-serif, designed by Tokotype for Jakarta City
- Modern, warm, excellent readability at small sizes
- Available as variable font on Google Fonts

**Monospace** (for currency/numbers): [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| Display | 36px | 700 | Hero numbers (dashboard totals) |
| H1 | 28px | 700 | Page titles |
| H2 | 22px | 600 | Section titles |
| H3 | 17px | 600 | Card titles |
| Body | 14px | 400 | Body text |
| Small | 12px | 500 | Labels, captions |
| Mono | 14px | 500 | Currency amounts, codes |

### 8.3 Color System

A dark navigation shell with clean white content — inspired by Revolut's contrast-first approach.

**Core Palette**:

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-dark` | `#0D0D12` | Sidebar, navigation shell |
| `--surface-dark-hover` | `#1A1A24` | Sidebar hover state |
| `--surface-dark-active` | `#2A2A38` | Sidebar active item |
| `--surface-primary` | `#FFFFFF` | Content area, cards |
| `--surface-secondary` | `#F6F6F8` | Page background |
| `--surface-tertiary` | `#EDEDF0` | Borders, dividers |
| `--text-primary` | `#0D0D12` | Headings, primary text |
| `--text-secondary` | `#6B6B80` | Secondary text, labels |
| `--text-tertiary` | `#9B9BB0` | Placeholders, disabled |
| `--text-inverse` | `#FFFFFF` | Text on dark surfaces |
| `--text-inverse-secondary` | `#9B9BB0` | Secondary text on dark surfaces |

**Accent Colors**:

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#0066FF` | Primary buttons, links, active states |
| `--accent-primary-hover` | `#0052CC` | Primary hover |
| `--accent-primary-subtle` | `#E6F0FF` | Primary tint background |
| `--status-success` | `#00B37E` | Present, approved, success |
| `--status-success-subtle` | `#E6F9F1` | Success background |
| `--status-warning` | `#FF8C00` | Late, pending |
| `--status-warning-subtle` | `#FFF4E6` | Warning background |
| `--status-error` | `#FF3B3B` | Absent, error, destructive |
| `--status-error-subtle` | `#FFE6E6` | Error background |
| `--status-info` | `#0EA5E9` | Leave, informational |
| `--status-info-subtle` | `#E0F2FE` | Info background |
| `--status-neutral` | `#8B5CF6` | Holiday |
| `--status-neutral-subtle` | `#F3E8FF` | Holiday background |

### 8.4 Attendance Status Colors

| Status | Badge BG | Badge Text | Calendar Cell |
|--------|----------|------------|---------------|
| PRESENT | `#E6F9F1` | `#00875A` | `#00B37E` |
| LATE | `#FFF4E6` | `#B35C00` | `#FF8C00` |
| ABSENT | `#FFE6E6` | `#CC0000` | `#FF3B3B` |
| LEAVE | `#E0F2FE` | `#0369A1` | `#0EA5E9` |
| HOLIDAY | `#F3E8FF` | `#6B21A8` | `#8B5CF6` |
| PRESENT_NO_CHECKOUT | `#FFF7E6` | `#B35C00` | `#FFB020` |
| Weekend | `#F6F6F8` | `#9B9BB0` | — |

### 8.5 Component Standards

**Framework**: Shadcn UI (built on Radix primitives) + Tailwind CSS. Use Shadcn components as base, customize with our design tokens. Only write custom CSS when Shadcn doesn't cover the need.

#### Layout

```
Desktop:
┌──────────────────────────────────────────────────┐
│ Dark Sidebar (240px)  │  Content Area (fluid)    │
│                       │                          │
│ Logo                  │  Page Header + Actions   │
│ Navigation            │  ─────────────────────   │
│                       │  Main Content            │
│                       │                          │
└──────────────────────────────────────────────────┘

Mobile (Teacher):
┌──────────────────────┐
│  Header (title)      │
│  ───────────────     │
│                      │
│  Content             │
│                      │
│  ───────────────     │
│  Bottom Nav (3 tabs) │
│  🏠  📅  💰          │
└──────────────────────┘
```

**Sidebar** (Admin — Desktop):
- Background: `--surface-dark`
- Width: 240px, collapsible to 64px (icon-only)
- Logo at top, navigation items below
- Active item: left border accent `--accent-primary`, background `--surface-dark-active`
- Font: 14px, 500 weight, `--text-inverse` color
- Hover: `--surface-dark-hover`

**Bottom Navigation** (Teacher — Mobile):
- 3 tabs: Home (check-in), Attendance, Salary Slips
- Active: `--accent-primary` icon + label
- Inactive: `--text-tertiary`

#### Cards

```css
/* Base card */
background: var(--surface-primary);
border: 1px solid var(--surface-tertiary);
border-radius: 12px;
padding: 20px;
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

/* Hover (interactive cards) */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
transform: translateY(-1px);
transition: all 150ms ease-out;
```

#### Summary Stat Cards (Dashboard)

```
┌─────────────────┐
│  Present         │  ← Label (12px, --text-secondary)
│  18              │  ← Value (36px, 700, monospace, --text-primary)
│  of 24 employees │  ← Context (12px, --text-tertiary)
└─────────────────┘
```

#### Buttons

| Type | Background | Text | Border |
|------|-----------|------|--------|
| Primary | `--accent-primary` | white | none |
| Secondary | transparent | `--text-primary` | 1px `--surface-tertiary` |
| Destructive | `--status-error` | white | none |
| Ghost | transparent | `--text-secondary` | none |

All buttons: height 40px, padding 0 16px, border-radius 8px, font-weight 500.

#### Status Badges

```css
/* Pill shape */
padding: 2px 10px;
border-radius: 20px;
font-size: 11px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.5px;
```

#### Tables

- Header: `--surface-secondary` background, 11px uppercase `--text-secondary`
- Rows: 52px height, hover `--surface-secondary`
- Borders: 1px `--surface-tertiary` bottom only
- Amounts: monospace, right-aligned

#### Modals

- Border-radius: 16px
- Max width: 520px
- Backdrop: rgba(13, 13, 18, 0.6) with backdrop-blur
- Padding: 24px
- Animation: scale 0.95→1 + fade, 200ms ease-out

### 8.6 Motion & Animation

- **Micro-interactions**: 150ms ease-out (hover, focus, toggle)
- **Page transitions**: 200ms fade
- **Modal**: 200ms scale + fade
- **Check-in success**: Checkmark animation (scale bounce 0→1.2→1, 400ms)
- **Staggered reveals**: Dashboard cards animate in with 50ms delay between each
- **Loading**: Skeleton pulse animation on data fetch
- **Number transitions**: Counter animation on dashboard stats (count up)

Use CSS transitions by default. Use Framer Motion for complex sequences (check-in animation, page transitions) when needed.

### 8.7 Responsive Breakpoints

| Breakpoint | Target |
|-----------|--------|
| < 640px | Mobile (Teacher primary experience) |
| 640-1024px | Tablet |
| > 1024px | Desktop (Admin primary experience) |

- Mobile: Sidebar becomes hamburger drawer (admin), bottom nav (teacher)
- Tables: Card view on mobile
- Forms: Full-width stacked inputs
- Buttons: Full-width on mobile
- Modals: Full screen on mobile

### 8.8 Teacher Check-in Screen (Mobile)

```
┌────────────────────────────────────────┐
│                                        │
│   Selamat Pagi, Bu Rina 👋             │
│   Senin, 17 Maret 2026                 │
│   07:05                                │
│                                        │
│   ┌────────────────────────────────┐   │
│   │                                │   │
│   │         CHECK IN               │   │
│   │                                │   │
│   │    (Large circular button      │   │
│   │     120px, accent-primary,     │   │
│   │     pulse animation on idle)   │   │
│   │                                │   │
│   └────────────────────────────────┘   │
│                                        │
│   Status Hari Ini:                     │
│   Check-in:  --:--                     │
│   Check-out: --:--                     │
│   Status:    Belum hadir               │
│                                        │
│   ┌─ 📍 Lokasi ──────────────────────┐ │
│   │ Menunggu GPS...                  │ │
│   └──────────────────────────────────┘ │
│                                        │
├────────────────────────────────────────┤
│   🏠 Home    📅 Kehadiran    💰 Gaji   │
└────────────────────────────────────────┘
```

---

## 9. Data Model

```prisma
// ── TENANT (single for MVP, prepared for multi-tenant) ──────
model Tenant {
  id        String       @id @default(cuid())
  name      String
  slug      String       @unique
  status    TenantStatus @default(ACTIVE)
  createdAt DateTime     @default(now())

  users      User[]
  campuses   Campus[]
  employees  Employee[]
  holidays   Holiday[]
  orgConfig  OrgConfig?
  salaryDefs SalaryComponentDef[]
  payrollRuns PayrollRun[]
}

enum TenantStatus { ACTIVE INACTIVE }

// ── USER ─────────────────────────────────────────────────────
model User {
  id         String    @id @default(cuid())
  tenantId   String?
  email      String    @unique
  role       UserRole
  employeeId String?   @unique
  name       String?
  lastLoginAt DateTime?

  tenant   Tenant?   @relation(fields: [tenantId], references: [id])
  employee Employee? @relation(fields: [employeeId], references: [id])
}

enum UserRole { SCHOOL_ADMIN TEACHER }

// ── CAMPUS ───────────────────────────────────────────────────
model Campus {
  id       String @id @default(cuid())
  tenantId String
  name     String
  address  String?
  lat      Decimal? @db.Decimal(10, 8)
  lng      Decimal? @db.Decimal(11, 8)

  tenant    Tenant     @relation(fields: [tenantId], references: [id])
  employees Employee[]
}

// ── ORG CONFIG ───────────────────────────────────────────────
model OrgConfig {
  id                    String   @id @default(cuid())
  tenantId              String   @unique
  workingDays           String[] // ["MON","TUE","WED","THU","FRI"]
  workStartTime         String   // "07:00"
  workEndTime           String   // "16:00"
  gracePeriodMinutes    Int      @default(15)
  timezone              String   @default("Asia/Jakarta")
  payrollPeriodStartDay Int      @default(21)
  payrollPeriodEndDay   Int      @default(20)

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

// ── HOLIDAY ──────────────────────────────────────────────────
model Holiday {
  id        String      @id @default(cuid())
  tenantId  String
  date      DateTime    @db.Date
  name      String
  type      HolidayType
  isHalfDay Boolean     @default(false)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, date])
}

enum HolidayType { NATIONAL ISLAMIC SCHOOL_CLOSURE }

// ── EMPLOYEE ─────────────────────────────────────────────────
model Employee {
  id            String         @id @default(cuid())
  tenantId      String
  kode          String
  nama          String
  formalName    String?
  email         String
  noHp          String?
  jabatan       String
  campusId      String
  hireDate      DateTime       @db.Date
  status        EmployeeStatus @default(ACTIVE)
  bankAccountNo String?
  bankName      String?
  bpjsEnrolled  Boolean        @default(false)

  tenant          Tenant                @relation(fields: [tenantId], references: [id])
  campus          Campus                @relation(fields: [campusId], references: [id])
  user            User?
  salaryValues    EmployeeSalaryValue[]
  attendanceRecords AttendanceRecord[]
  payrollItems    PayrollItem[]

  @@unique([tenantId, kode])
}

enum EmployeeStatus { ACTIVE INACTIVE }

// ── SALARY COMPONENT ─────────────────────────────────────────
model SalaryComponentDef {
  id         String            @id @default(cuid())
  tenantId   String
  code       String
  label      String
  category   ComponentCategory
  calcType   CalcType
  isProRated Boolean           @default(false)
  isEnabled  Boolean           @default(true)
  sortOrder  Int               @default(0)

  tenant Tenant                @relation(fields: [tenantId], references: [id])
  values EmployeeSalaryValue[]
  payrollLines PayrollItemLine[]

  @@unique([tenantId, code])
}

enum ComponentCategory { INCOME DEDUCTION }
enum CalcType { FIXED PCT_OF_BASE ATTENDANCE_BASED }

model EmployeeSalaryValue {
  id             String   @id @default(cuid())
  employeeId     String
  componentDefId String
  value          Decimal  @db.Decimal(15, 2)

  employee     Employee           @relation(fields: [employeeId], references: [id])
  componentDef SalaryComponentDef @relation(fields: [componentDefId], references: [id])

  @@unique([employeeId, componentDefId])
}

// ── ATTENDANCE ───────────────────────────────────────────────
model AttendanceRecord {
  id               String           @id @default(cuid())
  employeeId       String
  date             DateTime         @db.Date
  checkInTime      DateTime?
  checkOutTime     DateTime?
  checkInLat       Decimal?         @db.Decimal(10, 8)
  checkInLng       Decimal?         @db.Decimal(11, 8)
  checkOutLat      Decimal?         @db.Decimal(10, 8)
  checkOutLng      Decimal?         @db.Decimal(11, 8)
  status           AttendanceStatus
  isManualOverride Boolean          @default(false)
  overrideReason   String?
  overriddenBy     String?
  overriddenAt     DateTime?
  isLocked         Boolean          @default(false)

  employee Employee @relation(fields: [employeeId], references: [id])

  @@unique([employeeId, date])
}

enum AttendanceStatus {
  PRESENT
  LATE
  ABSENT
  LEAVE
  HOLIDAY
  HALF_DAY
  PRESENT_NO_CHECKOUT
}

// ── PAYROLL ──────────────────────────────────────────────────
model PayrollRun {
  id             String        @id @default(cuid())
  tenantId       String
  periodStart    DateTime      @db.Date
  periodEnd      DateTime      @db.Date
  actualWorkDays Int
  status         PayrollStatus @default(DRAFT)
  createdBy      String
  approvedBy     String?
  approvedAt     DateTime?
  exportedAt     DateTime?
  slipsSentAt    DateTime?

  tenant Tenant        @relation(fields: [tenantId], references: [id])
  items  PayrollItem[]
}

enum PayrollStatus { DRAFT APPROVED EXPORTED SLIPS_SENT }

model PayrollItem {
  id           String  @id @default(cuid())
  payrollRunId String
  employeeId   String
  grossAmount  Decimal @db.Decimal(15, 2)
  deductions   Decimal @db.Decimal(15, 2)
  netAmount    Decimal @db.Decimal(15, 2)

  // Attendance variables (entered by admin during review)
  overtimeHours     Decimal @default(0) @db.Decimal(5, 2)
  outdoorDays       Int     @default(0)
  holidayWorkedDays Int     @default(0)
  dcDays            Int     @default(0)

  payrollRun PayrollRun      @relation(fields: [payrollRunId], references: [id])
  employee   Employee        @relation(fields: [employeeId], references: [id])
  lines      PayrollItemLine[]
}

model PayrollItemLine {
  id               String            @id @default(cuid())
  payrollItemId    String
  componentDefId   String
  labelSnapshot    String
  categorySnapshot ComponentCategory
  calculatedAmount Decimal           @db.Decimal(15, 2)
  adjustmentAmount Decimal           @db.Decimal(15, 2) @default(0)
  adjustmentNote   String?
  finalAmount      Decimal           @db.Decimal(15, 2)

  payrollItem  PayrollItem        @relation(fields: [payrollItemId], references: [id])
  componentDef SalaryComponentDef @relation(fields: [componentDefId], references: [id])
}

// ── EMAIL LOG ────────────────────────────────────────────────
model EmailLog {
  id       String      @id @default(cuid())
  to       String
  subject  String
  template String
  status   EmailStatus
  error    String?
  sentAt   DateTime    @default(now())
}

enum EmailStatus { PENDING SENT FAILED }
```

---

## 10. API Contract

### 10.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-magic-link` | Send magic link email |
| POST | `/api/auth/verify` | Verify magic link token |
| POST | `/api/auth/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Get current user + role |
| POST | `/api/auth/logout` | Logout |

### 10.2 Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/campuses` | List campuses |
| POST | `/api/config/campuses` | Create campus |
| PUT | `/api/config/campuses/:id` | Update campus |
| DELETE | `/api/config/campuses/:id` | Delete campus (if no employees) |
| GET | `/api/config/org` | Get org config |
| PUT | `/api/config/org` | Update org config |
| GET | `/api/config/holidays` | List holidays |
| POST | `/api/config/holidays` | Create holiday |
| PUT | `/api/config/holidays/:id` | Update holiday |
| DELETE | `/api/config/holidays/:id` | Delete holiday |

### 10.3 Salary Components

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/salary-components` | List components |
| POST | `/api/salary-components` | Create component |
| PUT | `/api/salary-components/:id` | Update component |
| PUT | `/api/salary-components/:id/toggle` | Enable/disable |

### 10.4 Employees

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | List employees (filter: campus, status) |
| POST | `/api/employees` | Create employee |
| GET | `/api/employees/:id` | Get employee detail |
| PUT | `/api/employees/:id` | Update employee |
| PUT | `/api/employees/:id/deactivate` | Deactivate |
| GET | `/api/employees/:id/salary` | Get salary values |
| PUT | `/api/employees/:id/salary` | Update salary values (bulk) |

### 10.5 Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/attendance/check-in` | Teacher check-in (with lat/lng) |
| POST | `/api/attendance/check-out` | Teacher check-out (with lat/lng) |
| GET | `/api/attendance/today` | Today's attendance (admin) |
| GET | `/api/attendance/monthly` | Monthly view (admin, query: month, year, campus) |
| GET | `/api/attendance/my` | My attendance (teacher, query: month, year) |
| PUT | `/api/attendance/:id/override` | Override record (admin) |

### 10.6 Payroll

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payroll/generate` | Generate draft |
| GET | `/api/payroll` | List payroll runs |
| GET | `/api/payroll/:id` | Get payroll detail with all items + lines |
| PUT | `/api/payroll/:id/items/:itemId/variables` | Update attendance variables |
| PUT | `/api/payroll/:id/items/:itemId/lines/:lineId` | Adjust line amount |
| POST | `/api/payroll/:id/recalculate` | Recalculate (reset adjustments) |
| POST | `/api/payroll/:id/approve` | Approve payroll |
| GET | `/api/payroll/:id/export/bsi` | Export BSI CSV |
| POST | `/api/payroll/:id/send-slips` | Generate + email salary slips |

### 10.7 Salary Slips (Teacher)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/slips/my` | My salary slips |
| GET | `/api/slips/:payrollItemId/pdf` | Download PDF |

---

## 11. Payroll Calculation Rules

### 11.1 Working Days

```
actualWorkingDays = count of days in period WHERE:
  - day is in orgConfig.workingDays (e.g., Mon-Fri)
  - day is NOT in holidays table (full day)
  - day is within payroll period (inclusive)

Half-day holidays count as 0.5 working days.
```

### 11.2 Attendance Count

```
daysPresent = count of AttendanceRecords in period WHERE:
  - status IN (PRESENT, LATE, PRESENT_NO_CHECKOUT, HALF_DAY)

HALF_DAY counts as 0.5.
LEAVE counts as present for pro-rating purposes (paid leave).
```

### 11.3 Component Calculation

| Calc Type | Formula |
|-----------|---------|
| FIXED | `value × (isProRated ? daysPresent / actualWorkingDays : 1)` |
| PCT_OF_BASE | `gaji_pokok_amount × (value / 100)` |
| ATTENDANCE_BASED | `value × multiplier` (see multiplier table) |

### 11.4 Attendance Multipliers

| Component Code | Multiplier Source |
|----------------|------------------|
| `tunjangan_transport` | daysPresent (from attendance records) |
| `tunjangan_msk` | holidayWorkedDays (from attendance variables) |
| `insentif_outdoor` | outdoorDays (from attendance variables) |
| `insentif_libur` | holidayWorkedDays (from attendance variables) |
| `insentif_3m` | Entered as flat amount in attendance variables (0 or fixed value) |
| `insentif_dc` | dcDays (from attendance variables) |
| `insentif_dll` | Entered as flat amount in attendance variables |
| `lembur` | overtimeHours (from attendance variables) |

### 11.5 Summary

```
grossIncome    = SUM(all INCOME component finalAmounts)
totalDeductions = SUM(all DEDUCTION component finalAmounts)
netPay         = grossIncome - totalDeductions
```

---

## 12. Attendance Rules

### 12.1 Check-in Status

```
workStart = orgConfig.workStartTime (e.g., "07:00")
graceEnd  = workStart + orgConfig.gracePeriodMinutes (e.g., "07:15")

if checkInTime <= graceEnd:
  status = PRESENT
else:
  status = LATE
```

No window-end enforcement in MVP. Teachers can check in at any time.

### 12.2 Check-out

```
if no checkOutTime by end of day:
  status = PRESENT_NO_CHECKOUT (still counts as present)
```

### 12.3 GPS

```
GPS is captured on check-in and check-out for documentation:
  - checkInLat, checkInLng
  - checkOutLat, checkOutLng

GPS is NEVER used to block or validate check-in.
If GPS permission denied: check-in proceeds, lat/lng stored as null.
```

---

## 13. Technical Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL (Singapore region) |
| ORM | Prisma |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI Framework | Shadcn UI (Radix primitives) |
| Styling | Tailwind CSS + CSS variables for design tokens |
| Fonts | Plus Jakarta Sans (variable) + JetBrains Mono |
| Email | Resend |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| E2E Testing | Playwright |
| Unit Testing | Vitest |
| Animation | Framer Motion (complex) + CSS transitions (simple) |

---

## 14. Salary Components (Seeded)

These 13 components are seeded from the An Nisaa' spreadsheet:

| # | Code | Label | Category | Calc Type | Pro-rated | Notes |
|---|------|-------|----------|-----------|-----------|-------|
| 1 | `gaji_pokok` | Gaji Pokok | INCOME | FIXED | Yes | Base salary |
| 2 | `tunjangan_jabatan` | Tunjangan Jabatan | INCOME | FIXED | No | Position allowance |
| 3 | `tunjangan_gt` | Tunjangan GT | INCOME | FIXED | No | Some employees = 0 |
| 4 | `bpjs_perusahaan` | BPJS Perusahaan | INCOME | FIXED | No | Employer BPJS contribution, 0 if not enrolled |
| 5 | `tunjangan_transport` | Tunjangan Transport | INCOME | ATTENDANCE_BASED | — | Per day present |
| 6 | `tunjangan_msk` | Tunjangan Masuk | INCOME | ATTENDANCE_BASED | — | Per holiday/weekend worked |
| 7 | `insentif_outdoor` | Insentif Outdoor | INCOME | ATTENDANCE_BASED | — | Per outdoor day |
| 8 | `insentif_libur` | Insentif Libur | INCOME | ATTENDANCE_BASED | — | Per holiday worked |
| 9 | `insentif_3m` | Insentif 3M | INCOME | FIXED | No | Admin-entered amount per period |
| 10 | `insentif_dc` | Insentif DC | INCOME | ATTENDANCE_BASED | — | Per DC day |
| 11 | `insentif_dll` | Insentif Lain-lain | INCOME | FIXED | No | Admin-entered per period |
| 12 | `deduksi_bpjs` | BPJS Karyawan | DEDUCTION | FIXED | No | Employee BPJS, 0 if not enrolled |
| 13 | `deduksi_dplk_dll` | DPLK & Lainnya | DEDUCTION | FIXED | No | Varies per employee |

---

## 15. BSI CSV Format

```csv
rekening_tujuan,nama_pemilik,nominal,keterangan
7067556121,"Redacted Employee",3395000,"Gaji Mar 2026"
```

- Amount in Rupiah, no decimals
- Names with spaces in quotes
- UTF-8 encoding, CRLF line endings
- One header row
- Employees without bank account excluded

---

## 16. Salary Slip PDF Layout

```
┌────────────────────────────────────────┐
│  An Nisaa' Sekolahku                   │
│                                        │
│  SLIP GAJI                             │
│  Periode: 21 Mar - 20 Apr 2026        │
│                                        │
│  Nama    : Redacted Employee                  │
│  NIP     : ER2                         │
│  Jabatan : WakasekKur                  │
│  Hari Kerja: 20 hari                   │
│                                        │
│  PENDAPATAN:                           │
│  Gaji Pokok            Rp  1.100.000   │
│  Tunjangan Jabatan     Rp    565.000   │
│  Tunjangan GT          Rp    250.000   │
│  BPJS Perusahaan       Rp    185.187   │
│  Tunjangan Transport   Rp  1.200.000   │
│  Tunjangan Masuk       Rp          0   │
│  Insentif Outdoor      Rp     60.000   │
│  Insentif Libur        Rp     60.000   │
│  Insentif 3M           Rp          0   │
│  Insentif DC           Rp     90.000   │
│  Insentif Lain-lain    Rp          0   │
│  ─────────────────────────────         │
│  Total Pendapatan      Rp  3.510.187   │
│                                        │
│  POTONGAN:                             │
│  BPJS Karyawan         Rp    185.187   │
│  DPLK & Lainnya        Rp     50.000   │
│  ─────────────────────────────         │
│  Total Potongan        Rp    235.187   │
│                                        │
│  GAJI BERSIH           Rp  3.275.000   │
│                                        │
│  Transfer ke: Bank BSI 7067556121      │
│  Dibuat: 21 Apr 2026                   │
└────────────────────────────────────────┘
```

---

## 17. Seed Data

### 17.1 Tenant

```
name: An Nisaa' Sekolahku
slug: annisaa
```

### 17.2 Campuses

| Name | Address | Notes |
|------|---------|-------|
| Taman Aster | Taman Aster, Bekasi | Primary campus |
| Metland Cibitung | Metland, Cibitung | Second campus |

### 17.3 Org Config

```
workingDays: [MON, TUE, WED, THU, FRI]
workStartTime: "07:00"
workEndTime: "16:00"
gracePeriodMinutes: 15
timezone: "Asia/Jakarta"
payrollPeriodStartDay: 21
payrollPeriodEndDay: 20
```

### 17.4 Employees (24)

Seeded from `artifacts/Slip Gaji` spreadsheet "Data Pegawai" sheet. All employees include: kode, nama, formalName (from mapper), email, noHp, jabatan, campus, bank info, bpjs status.

### 17.5 Salary Values

Seeded from `Gaji-Okt24` sheet. Each employee's 13 component values extracted from the spreadsheet columns.

### 17.6 Holidays

Seeded from "Hari Libur" sheet. 35+ holidays for 2024-2026.

### 17.7 Test Accounts

| Email | Role | Name |
|-------|------|------|
| `admin@annisaa.sch.id` | SCHOOL_ADMIN | Admin Annisaa |
| (each employee's email) | TEACHER | (employee name) |

---

## 18. Phasing

### Phase 1: Foundation (Week 1-2)
- Next.js 15 + Supabase + Prisma setup
- Auth (Google OAuth + Magic Link)
- Seed script
- Admin layout (dark sidebar)
- Campus, Org Config, Holiday CRUD
- Salary Component management

### Phase 2: Employees & Attendance (Week 3-4)
- Employee CRUD
- Salary Values editor
- Teacher check-in / check-out (mobile)
- Teacher attendance calendar
- Admin attendance dashboard (today + monthly)
- Attendance override

### Phase 3: Payroll (Week 5-6)
- Working days calculation engine
- Payroll calculator (all calc types)
- Attendance variables editor
- Payroll review + line adjustment
- Payroll approve workflow
- BSI CSV export

### Phase 4: Slips & Polish (Week 7-8)
- PDF salary slip generation
- Email distribution
- Teacher salary slip view
- E2E tests for critical paths
- Bug fixes + polish
- Design polish (animations, responsive)

---

## 19. v1 Completion Status (2026-04-08)

### What Was Shipped

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (Google OAuth + Magic Link) | ✅ Shipped | Supabase Auth, auto-create User on first login |
| Campus CRUD | ✅ Shipped | GPS capture, employee count |
| Org Config | ✅ Shipped | Working days, hours, grace, payroll period |
| Holiday Calendar | ✅ Shipped | 2026 Indonesia holidays (23 days) |
| Salary Components (13) | ✅ Shipped | Enable/disable, sort order |
| Employee CRUD | ✅ Shipped | Auto-generated codes, position dropdown |
| Employee Salary Values | ✅ Shipped | Per-component editor |
| Teacher Check-in/out | ✅ Shipped | GPS as documentation, PRESENT/LATE status |
| Teacher Attendance Calendar | ✅ Shipped | Color-coded monthly view |
| Teacher Profile | ✅ Shipped | Read-only, logout button |
| Teacher Salary Slips | ✅ Shipped | View + download PDF |
| Admin Attendance (Today) | ✅ Shipped | Stats + employee table + override |
| Admin Attendance (Monthly) | ✅ Shipped | Full grid, click-to-override |
| Attendance Override | ✅ Shipped | LEAVE status with reason |
| Payroll Draft Generation | ✅ Shipped | All calc types, working days engine |
| Attendance Variables | ✅ Shipped | Overtime, outdoor, holiday worked, DC |
| Payroll Review + Adjust | ✅ Shipped | Line-by-line with notes |
| Payroll Approve | ✅ Shipped | Locks attendance |
| BSI CSV Export | ✅ Shipped | Excluded employees shown |
| PDF Salary Slip + Email | ✅ Shipped | Branded PDF, Resend integration |

### Infrastructure Shipped

| Item | Status |
|------|--------|
| Production (Vercel + Supabase Mumbai) | ✅ Live |
| Staging (Vercel Preview + Supabase Tokyo) | ✅ Live |
| Separate databases (staging ≠ production) | ✅ |
| GitHub Actions CI (lint, typecheck, test) | ✅ |
| Staging-first workflow (SOP documented) | ✅ |
| Security: rate limiting, tenant isolation, security headers | ✅ |
| Security: payroll access control (own slips only, no drafts) | ✅ |
| Unit tests: 12 (payroll engine + working days) | ✅ |
| An Nisaa' branding (logo, teal palette, favicon) | ✅ |

### What Was Deferred from MVP (→ v2 candidates)

| Feature | Original Priority | Reason Deferred |
|---------|------------------|-----------------|
| Leave management (request/approve/balance) | P0 in v7 | Scope cut — admin override to LEAVE covers MVP |
| Multi-tenant / Super Admin | P0 in v7 | Single tenant sufficient for MVP |
| GPS enforcement (radius check) | P0 in v7 | GPS as documentation only, simpler |
| In-app notifications (bell/badge) | P0 in v7 | Email covers critical path |
| Offline / PWA | Decision D-18 | GPS not blocking removes main use case |
| Payroll reopen workflow | ADM-18 | Create new run instead |
| Bulk CSV import (employees/holidays) | ADM-6 | Seed script + single entry sufficient |
| Teacher profile editing | TCH-9 | Read-only profile shipped |
| Manual payment recording with receipts | ADM-16 | Deferred — admin tracks offline |

---

## 20. v2 Roadmap (For Discussion)

### v2.0 — Daily Operations Enhancement

**Goal**: Make the system robust for daily use by 24 teachers across 2 campuses.

| # | Feature | Priority | Effort | Why |
|---|---------|----------|--------|-----|
| 1 | **Leave management** | P0 | Large | Teachers request leave, admin approves, balance tracked automatically. Currently admin manually overrides to LEAVE. |
| 2 | **E2E regression tests (Playwright)** | P0 | Medium | Critical paths need automated testing before each release. |
| 3 | **Payroll history comparison** | P1 | Small | Admin needs to compare current vs previous period — catch anomalies. |
| 4 | **Employee attendance history (admin)** | P1 | Small | Admin needs per-employee attendance view over months — currently only monthly grid. |
| 5 | **Export attendance to CSV** | P1 | Small | Admin reporting for school records. |
| 6 | **Bulk holiday import** | P1 | Small | Adding 23 holidays one by one is tedious — CSV upload. |
| 7 | **Dashboard: recent payroll summary** | P2 | Small | Quick glance at last payroll totals on dashboard. |

### v2.1 — Teacher Experience

| # | Feature | Priority | Effort | Why |
|---|---------|----------|--------|-----|
| 8 | **Teacher profile editing** | P1 | Small | Let teachers update phone, emergency contact. |
| 9 | **Check-in reminder notification** | P2 | Medium | Push/email if teacher hasn't checked in by 08:00. |
| 10 | **Salary slip history search** | P2 | Small | Filter slips by date range, download batch. |
| 11 | **Attendance streak/stats** | P2 | Small | Gamification — show perfect attendance months. |

### v2.2 — Multi-Campus & Scale

| # | Feature | Priority | Effort | Why |
|---|---------|----------|--------|-----|
| 12 | **GPS soft warning** | P1 | Medium | Show distance from campus on check-in (never block, just inform). |
| 13 | **Multi-admin support** | P1 | Medium | One admin per campus, super-admin across all. |
| 14 | **Payroll reopen (24h window)** | P2 | Medium | Allow corrections within 24 hours of approval. |
| 15 | **Audit log viewer** | P2 | Medium | Admin can see all payroll/attendance changes with who/when/why. |

### v3.0 — Platform

| # | Feature | Priority | Effort | Why |
|---|---------|----------|--------|-----|
| 16 | **Multi-tenant** | P1 | Large | Other schools can use the system. Super Admin portal. |
| 17 | **WhatsApp notifications** | P2 | Medium | Indonesia's primary messaging — more reliable than email. |
| 18 | **PWA / offline support** | P2 | Large | Teachers with poor connectivity. |
| 19 | **Biometric integration** | P3 | Large | Replace GPS with fingerprint devices. |
| 20 | **General accounting integration** | P3 | Large | Connect payroll to school accounting system. |

### Suggested v2 Sprint Priority

If starting v2 tomorrow, I'd recommend this order:

1. **E2E tests** (P0) — protect everything we built
2. **Leave management** (P0) — most-requested missing feature
3. **Payroll comparison + employee attendance history** (P1) — admin QoL
4. **Bulk holiday import** (P1) — operational efficiency
5. **Teacher profile editing** (P1) — teacher autonomy

---

## Product Roadmap — Phases 2–6

Phase 1 (Teacher Attendance & Payroll) is complete. The following phases extend the platform toward a full school management system.

---

### Phase 2: Core Structure

**Goal:** Model the school's academic organization so future features have a proper data foundation.

| Model | Description |
|-------|-------------|
| `AcademicYear` | e.g. "2025/2026", with start/end dates and status: `PLANNING` / `ACTIVE` / `ARCHIVED` |
| `Program` | An Nisaa' has 4 programs: **Day Care**, **TKIT**, **Kelompok Bermain**, **Pop Up Class** |
| `ClassSection` | e.g. "TKIT A" — belongs to a Program + AcademicYear, has capacity, homeroom teacher, campus |

Note: Pop Up Class is session-based (not semester-based) and needs a separate `ProgramSession` model with date, capacity, and per-session fee.

---

### Phase 3: Teacher Assignment

**Goal:** Link teachers (Employee records) to the classes they teach.

| Model | Description |
|-------|-------------|
| `TeachingAssignment` | Links `Employee` → `ClassSection`, with role (homeroom / subject) and effective dates |

This bridges Phase 1 (payroll) with Phase 2 (programs), enabling per-class workload visibility and future program-specific pay rules.

---

### Phase 4: Student Management

**Goal:** Track students and their enrollment across programs and years.

| Model | Description |
|-------|-------------|
| `Student` | Student profile — name, date of birth, parent contacts, notes |
| `StudentEnrollment` | Links `Student` → `ClassSection` (and therefore to Program + AcademicYear), with status and enrollment date |

Parent contact info lives on Student. Multiple guardians supported.

---

### Phase 5: Fee Structure & Invoicing

**Goal:** Define tuition/fee structures per program and generate invoices per student.

| Model | Description |
|-------|-------------|
| `FeeComponentDef` | Mirrors `SalaryComponentDef` — row-based, flexible fee types (tuition, registration, activity, etc.) |
| `ProgramFeeStructure` | Defines which fee components apply to a Program for a given AcademicYear, with amounts |
| `Invoice` | Generated per student per billing period, with line items and total due |

Invoices are generated from the fee structure at enrollment or period start. Manual adjustments (discounts, waivers) are supported per line.

---

### Phase 6: Payment Collection (Xendit)

**Goal:** Collect fees digitally via payment links, starting with Pop Up Class.

**Approach:**
1. Generate a Xendit Checkout Session per `Invoice`
2. Share payment link with parent (WhatsApp / email)
3. Xendit webhook confirms payment → marks invoice as paid
4. Reconciliation dashboard for admin

**Rollout order:**
1. **Pop Up Class first** — per-session payments, simpler scope, immediate revenue impact
2. **Recurring tuition** — TKIT / KB / Day Care monthly billing
3. **Registration & other fees** — one-off invoices

**Key integrations:** Xendit Checkout Session API, webhook endpoint, payment status tracking, BSI reconciliation export.

---

**End of PRD v9.0**
