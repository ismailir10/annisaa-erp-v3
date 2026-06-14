# Admin Portal — Jobs to be Done

> Last audited: 2026-06-13 in cycle `payments-ledger` (Penerimaan payments-received ledger on /admin/payments — date-range, per-method summary, CSV export)
> Portal root: `app/admin/`
> Default persona: Ibu Nur (SUPER_ADMIN) — see `.claude/personas/ibu-nur.md`

This file is the living catalog of what an admin user can and should be able to do in this system. `/uat admin` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes an admin-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

**Note on roles:** This cycle ships with 3 personas (Pak Budi, Bu Sari, Ibu Nur). A 4th persona — regular `SCHOOL_ADMIN` (Bu Lina or equivalent) — is deferred until the parallel `role-split` cycle merges. Once it does, add `JTBD-ADMIN-PAY-02` (payroll access expects 403 as SCHOOL_ADMIN) and any other salary-403 variants.

Each job declares `Role:` (`SUPER_ADMIN` | `SCHOOL_ADMIN` | `either`) so once role-split ships, `/uat` can pick the correct persona automatically. `Expected perf:` is per-job and takes precedence over the global thresholds in `SKILL.md`.

**Area groups** (align with `config/admin-nav.ts`; used by `/uat admin/<group>`):
- `/uat admin/hr` — employees, attendance, leave, payroll
- `/uat admin/academic` — students, student-attendance, academic, enrollments, teaching-assignments, admissions, assessment-templates
- `/uat admin/finance` — invoices, fees
- `/uat admin/penilaian` — assessments (scores + templates)
- `/uat admin/settings` — campuses, holidays, users, roles, salary-components

---

## Area: students

### JTBD-ADMIN-STUDENT-01 — Create a new student end-to-end
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** form submit click-to-confirm <1.5s; list refresh <1s
- **Preconditions:** Logged in as SUPER_ADMIN, at least one active class section exists in seed
- **Steps (user intent, not UI clicks):**
  1. Open the students list
  2. Initiate "new student"
  3. Fill the essentials (name, DOB, gender, class assignment, at least one guardian)
  4. Save
  5. See the new student in the list
- **Done when:** New student appears in the list with `ACTIVE` status, assigned to the chosen class, with ≥1 guardian linked. List refresh does not lose scroll/filter position.
- **Why this job matters:** Ibu Nur onboards students frequently during admissions season. Target: under 5 minutes per student. Friction here compounds across hundreds of rows.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-STUDENT-02 — Enroll a student into a class section
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** enrollment submit click-to-confirm <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 active student not yet enrolled, ≥1 class section with capacity
- **Steps:**
  1. Open a student's detail page
  2. Click "Daftarkan ke Kelas"
  3. Pick a class section
  4. Submit
  5. See success toast + enrollment in the student's "Riwayat Kelas" tab
- **Done when:** Student has an ACTIVE enrollment in the chosen class. If class is full, duplicate enrollment, or age-out-of-range: toast shows the specific error message in Indonesian. "Daftarkan" button never stays stuck (spinner resets on both success and error).
- **Error scenarios to verify:**
  - Duplicate enrollment → 400 "Siswa sudah terdaftar di kelas lain"
  - Full class → 400 "Kelas penuh (X/Y)"
  - Network error → toast "Terjadi kesalahan jaringan"
- **Why this job matters:** Every new student must be enrolled. Button stuck = admin confused.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: invoices

### JTBD-ADMIN-PAY-01 — Check today's cash received (Penerimaan)
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** ledger load <1.5s; CSV download starts <1s
- **Preconditions:** Logged in as SUPER_ADMIN; ≥1 payment recorded in the chosen range
- **Steps:**
  1. Open Keuangan → Penerimaan (`/admin/payments`)
  2. Default view shows today's payments + Total Penerimaan + Jumlah Transaksi
  3. Widen the date range (e.g. month-to-date) and/or filter by method (Tunai / Transfer Bank / Virtual Account)
  4. Read the per-method summary badges
  5. Click "Ekspor CSV"
- **Done when:** Summary cards + table reconcile (sum of rows = Total Penerimaan), method filter narrows both, CSV downloads with matching totals and a Bahasa filename. REVERSED payments never appear.
- **Why this job matters:** Treasurer daily/period cash recap previously required opening every invoice one by one.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-INV-01 — Create a manual invoice for a specific student
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** save click-to-confirm <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 active student in seed, ≥1 fee component definition in seed
- **Steps:**
  1. Open the invoices area
  2. Initiate "new invoice"
  3. Pick a student, pick fee components, set due date
  4. Save
  5. See the new invoice appear, status `PENDING`
- **Done when:** Invoice exists in the list with correct amount (sum of components), correct student, correct due date, status `PENDING`. Form is not so long that it scrolls on a 1440p monitor.
- **Why this job matters:** Manual invoice creation is the escape hatch for anything the batch system doesn't handle. Ibu Nur does this weekly.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-ADMIN-INV-02 — View an invoice's detail and payment status
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** detail open <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 invoice with payment records in seed
- **Steps:**
  1. Open the invoices list
  2. Click "Lihat" on an invoice
  3. See: line items, subtotal, payments applied, outstanding balance, status history
- **Done when:** Detail page shows line items + payment trail + outstanding balance. All Rupiah amounts formatted via `formatRupiah()`. Status transitions (PENDING → SENT → PAID / OVERDUE) visible with timestamps.
- **Why this job matters:** When a parent disputes a charge, Ibu Nur needs the full story in one place — not three queries. If payment history is hidden, she defaults to WhatsApp.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-INV-03 — Mark an invoice as paid manually (offline cash/transfer)
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** mark-paid click-to-status-change <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 invoice with status `SENT` or `OVERDUE` for a guardian who paid via bank transfer outside Xendit
- **Steps:**
  1. Open the invoice detail
  2. Record an offline payment (amount, date, method, reference note)
  3. Confirm the invoice moves to `PAID`
- **Done when:** Invoice status is `PAID`. Payment shows in the payment trail with the recorded method + reference. Parent portal reflects `PAID` within one refresh.
- **Why this job matters:** Many An Nisaa' parents still transfer via BSI mobile outside Xendit. Without manual mark-paid, Ibu Nur's books and the ERP diverge.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: payroll

### JTBD-ADMIN-PAY-01 — Run payroll for this month (SUPER_ADMIN)
- **Persona:** Ibu Nur (`SUPER_ADMIN`)
- **Role:** SUPER_ADMIN
- **Expected perf:** payroll preview calculation <3s for ≤50 employees; finalize click-to-confirm <2s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥3 active employees in seed, payroll period for the current month not yet run
- **Steps:**
  1. Open the payroll area
  2. Start a new payroll run for the current month
  3. Review the calculated numbers (gross, deductions, net per employee)
  4. Finalize
  5. See slips generated and available to teachers in their portal
- **Done when:** Payroll period shows as `FINALIZED` (or equivalent), every active employee has a slip, and the numbers visibly add up. No stale spinner, no silent errors.
- **Why this job matters:** Salary. The one thing Ibu Nur cannot tolerate a bug in. Any blocker here is a P0.
- **Follow-up after role-split ships:** Add `JTBD-ADMIN-PAY-02` — same steps as Bu Lina (`SCHOOL_ADMIN`), expected outcome: `/admin/payroll` route returns 403 at the middleware, sidebar does not show Payroll, employee list API response does not include salary fields. This is the "role split holds" verification.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-ADMIN-PAY-03 — Export a finalized payroll run to BSI Excel (SUPER_ADMIN)
- **Persona:** Ibu Nur (`SUPER_ADMIN`)
- **Role:** SUPER_ADMIN
- **Expected perf:** export generate + download <3s for ≤50 employees
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 payroll run in `FINALIZED` status
- **Steps:**
  1. Open the finalized payroll run
  2. Trigger "Export BSI" (`GET /api/payroll/[id]/export/bsi`)
  3. Receive an Excel file compatible with BSI mass-transfer upload (account number + amount per row)
- **Done when:** Excel downloads with no server error, column headers match BSI's expected format, row count equals the number of active employees in the run, all amounts are integer Rupiah (no decimals, no currency symbol).
- **Why this job matters:** Ibu Nur's goal #5 — "Export anything to Excel on demand." Payroll export is the single lever she pulls to actually pay people. A broken export = everyone's salary is late.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: employees

### JTBD-ADMIN-EMP-01 — Deactivate an employee who is leaving
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** list search filter <500ms; deactivate confirm <800ms
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 active employee in seed
- **Steps:**
  1. Open the employees list
  2. Find the employee (search by name)
  3. Use the row action to deactivate (soft-delete via status change, per CRUD Standard)
  4. Confirm in the dialog
  5. See the employee move to `INACTIVE` status
- **Done when:** Employee status is `INACTIVE`. List default filter (active only) no longer shows them. Toggling the filter to "semua status" or "tidak aktif" reveals them. Never a hard delete.
- **Why this job matters:** HR lifecycle, happens a few times a year. Must be reversible.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-ADMIN-EMP-02 — Create a new employee with salary components (SUPER_ADMIN)
- **Persona:** Ibu Nur (`SUPER_ADMIN`)
- **Role:** SUPER_ADMIN
- **Expected perf:** save click-to-confirm <1.5s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 salary component defined in settings, ≥1 active campus
- **Steps:**
  1. Open the employees list
  2. Click "Tambah Karyawan"
  3. Fill identity (name, NIK, role, campus, hire date), then attach salary components (base salary, allowances)
  4. Save
  5. See the new employee in the list with `ACTIVE` status and salary components attached
- **Done when:** Employee exists with salary components correctly linked. Next payroll run includes them at the expected gross. Form surfaces validation inline (no submit-then-5-errors).
- **Why this job matters:** Teacher turnover during admissions season is real. Every new hire must be able to receive their first salary on schedule. A broken create = a 3-week delay.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: leave

### JTBD-ADMIN-LEAVE-01 — Approve a pending leave request
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** approve click-to-status-change <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 leave request with status `PENDING` in seed
- **Steps:**
  1. Open the leave area
  2. See pending requests first (or filter to pending)
  3. Click "Lihat" to view the request details in a dialog
  4. Use the ⋮ dropdown to pick "Setujui"
  5. Confirm in the review dialog
  6. See the request's status change to `APPROVED`
- **Done when:** Request is `APPROVED`, the teacher who requested it sees the status updated in their portal (or would, in a subsequent login). Audit trail records who approved and when. Action buttons (approve/reject) are accessible via dropdown at all viewport widths ≥1024px — no horizontal clipping.
- **Why this job matters:** Weekly rhythm. If Ibu Nur can't find pending requests in under 3 seconds, they pile up.
- **Known friction (from last UAT):** <filled by /uat reports>

---

### JTBD-ADMIN-LEAVE-02 — Reject a leave request with a reason
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** reject click-to-status-change <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 `PENDING` leave request in seed
- **Steps:**
  1. Open the leave area
  2. Open a pending request
  3. Pick "Tolak" from the ⋮ dropdown
  4. Enter a required reason (Indonesian, min 10 chars)
  5. Confirm
- **Done when:** Request shows `REJECTED` with the reason visible to the requesting teacher. Audit trail records who rejected + when + reason. Reason field rejects empty / whitespace-only submissions.
- **Why this job matters:** Rejecting without a reason breaks trust. Teachers need to know *why* their request was denied to plan around it.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: assessments

### JTBD-ADMIN-ASSESS-01 — Publish a student's report card
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** publish click-to-confirm <1.5s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 StudentAssessment in `DRAFT` with an AssessmentTemplate attached and all indicators scored
- **Steps:**
  1. Open the assessments area
  2. Find a draft report card for a TKIT student
  3. Open it; verify all indicators have scores filled
  4. Change status to Published
  5. Confirm the parent portal shows the report card in their reports area
- **Done when:** Assessment status is `PUBLISHED`. A parent logged in for that student sees it under their Reports tab. Any indicator missing a score shows a visible validation error before publish — silent failure is a blocker.
- **Why this job matters:** Quarterly ritual. Publishing wrong or incomplete report cards is a trust-destroying event. Feedback must be explicit.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-ASSESS-02 — Enter scores into a draft report card
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** save-indicators click-to-confirm <1.5s; no loss of entered scores on navigate-away
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 StudentAssessment in `DRAFT` with an AssessmentTemplate attached
- **Steps:**
  1. Open a draft assessment
  2. Enter scores (BB/MB/BSH/BSB) or narrative feedback against each indicator
  3. Save without publishing
  4. Navigate away and back; confirm all entered values persist
- **Done when:** All indicators persist with the entered values. Partial saves are allowed (she doesn't have to fill everything in one sitting). Draft stays `DRAFT` — not accidentally published.
- **Why this job matters:** Bu Sari (or Ibu Nur on her behalf) enters ~20 indicators × 18 students = 360 data points per quarter. Losing work to a refresh is a trust-killer.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: admissions

### JTBD-ADMIN-ADM-01 — Process an admissions inquiry through the pipeline
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** status-change click-to-confirm <800ms; no full-page reload
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 Admission in `INQUIRY` status in seed
- **Steps:**
  1. Open the admissions list
  2. Find a new INQUIRY entry
  3. Open the detail view
  4. Update status to VISIT_SCHEDULED and set a follow-up date
  5. Save and confirm the status changed in the list
- **Done when:** Admission shows `VISIT_SCHEDULED` with the correct follow-up date in the list. The full status pipeline (INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → REGISTERED → CANCELLED) is visible and accessible. Status change does not require a full page reload.
- **Why this job matters:** Admissions season is high-volume. Ibu Nur tracks 20+ leads simultaneously. Pipeline clarity is the whole point.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: guardians

### JTBD-ADMIN-GUARD-01 — Find and update a guardian's contact details
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** search <500ms; save <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥10 guardians in seed
- **Steps:**
  1. Open the guardians list
  2. Search by name or phone
  3. Open the guardian's detail
  4. Edit phone / email / address
  5. Save
- **Done when:** Updated contact reflects on the linked student's detail page within one refresh. Phone validation accepts Indonesian formats (`08xxx`, `+628xxx`). No hard delete — status toggle only.
- **Why this job matters:** Wrong phone = Bu Sari can't reach the parent when a kid is sick. Happens ~5x/month.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: teaching-assignments

### JTBD-ADMIN-TA-01 — Assign a wali kelas (homeroom teacher) to a class section
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** assignment save <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 class section without a wali kelas, ≥1 active employee with TEACHER role
- **Steps:**
  1. Open teaching-assignments
  2. Pick a class section missing a wali kelas
  3. Assign an employee as HOMEROOM
  4. Save
- **Done when:** Class section shows the assigned teacher. The teacher sees the class in their teacher portal class-attendance screen on next login. Duplicate-assignment error returns a specific message in Indonesian.
- **Why this job matters:** Without a wali kelas, teacher-portal attendance is empty — the class is invisible. Start-of-term blocker.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: fees

### JTBD-ADMIN-FEE-01 — Update a fee component amount for next term
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** save <1s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 fee component in seed
- **Steps:**
  1. Open the fees area
  2. Edit a component's amount (e.g. SPP Bulanan Rp500.000 → Rp550.000)
  3. Save
  4. Confirm a new manual invoice uses the new amount; existing unpaid invoices keep their original amount
- **Done when:** New amount is applied to invoices created *after* the change; historical invoices are unchanged. UI makes this contract visible (i.e. "berlaku untuk tagihan baru" hint near the field).
- **Why this job matters:** Fee revisions happen ~2x/year. Silent retroactive changes would be a disaster — parents would see their old invoices change under them.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: academic

### JTBD-ADMIN-ACAD-01 — Review academic year and class section setup
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** list load <1.5s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 academic year + ≥1 class section in seed
- **Steps:**
  1. Open the academic / settings area
  2. See the list of academic years
  3. Navigate to the current year's class sections
  4. Confirm each class section shows student count and wali kelas assignment
- **Done when:** User can answer "are all classes set up correctly for this term?" in under 30 seconds. Empty states (if any class has no wali kelas) are visually distinct and actionable.
- **Why this job matters:** Start-of-term ritual. Ibu Nur does it once every 6 months but if it's broken, everything downstream (attendance, invoices, payroll) breaks.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-ACAD-02 — Promote a whole class to the next year (Naik Kelas Massal)
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** roster preview <1.5s; promotion submit click-to-confirm <2s
- **Preconditions:** Logged in as SUPER_ADMIN; a source class with ≥1 ACTIVE enrollment; a target class (typically next academic year) with enough capacity
- **Steps:**
  1. Open Kelas (`/admin/classes`)
  2. Click "Naik Kelas Massal"
  3. Pick source year + class — roster of active students appears, all checked
  4. Untick any student who stays behind
  5. Pick target year + class — capacity hint shows remaining seats vs. needed
  6. Click "Naik Kelas (N siswa)"
- **Done when:** Toast confirms `N siswa naik kelas` (+ `M ditahan` when some were unticked); old enrollments become GRADUATED, new ACTIVE enrollments exist in the target class. Over-capacity attempt shows the Bahasa error inline and the dialog stays open.
- **Why this job matters:** Year-end ritual (July). Before this dialog the only path was per-student promotion — untenable for a 20-student class.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-ACAD-03 — Pull the monthly attendance recap for the yayasan report
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** recap load <1.5s; CSV download starts <1s
- **Preconditions:** Logged in as SUPER_ADMIN; ≥1 class with marked attendance in the chosen month
- **Steps:**
  1. Open Kehadiran Siswa (`/admin/student-attendance`)
  2. Switch to the "Rekap Bulanan" tab
  3. Pick the month (and optionally a class)
  4. Review per-student Hadir / Sakit / Izin / Alpa counts
  5. Click "Ekspor CSV"
- **Done when:** Table shows every ACTIVE student (zero-count rows included); CSV downloads with the same numbers and a Bahasa filename. Never-marked students are visible with 0 totals, not silently missing.
- **Why this job matters:** Monthly yayasan/Dinas reporting previously required manual tallying from the daily list.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: settings

### JTBD-ADMIN-SET-HOLIDAY-01 — Add a national holiday to the calendar
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** save <1s
- **Preconditions:** Logged in as SUPER_ADMIN
- **Steps:**
  1. Open settings → Hari Libur
  2. Add a new holiday (date, name, applies-to campuses)
  3. Save
  4. Confirm student and employee attendance screens mark that date as "Libur" and do not require marking
- **Done when:** Holiday appears in the list and downstream attendance screens treat the date as non-school. Payroll pro-rating respects the holiday (working-days calculation excludes it).
- **Why this job matters:** Indonesian public holidays shift year to year (lunar calendar). Missing one = attendance is marked wrong and pro-rated salaries are incorrect.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-SET-USER-01 — Invite a new teacher's login account
- **Persona:** Ibu Nur
- **Role:** either
- **Expected perf:** invite send <1.5s
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 active employee with no user account yet
- **Steps:**
  1. Open settings → Pengguna
  2. Invite by email, pick role (TEACHER), link to the employee record
  3. Send
- **Done when:** Invited user can sign in via Google and lands in the correct portal. Linking is explicit — an orphan user account (no employee) is not allowed.
- **Why this job matters:** Onboarding blocker. If invite fails silently, a new hire can't use the system and Ibu Nur gets a WhatsApp the next morning.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Appendix: jobs not yet catalogued

These areas exist in the product but don't have first-class JTBD entries yet. Add them when a cycle touches the corresponding area.

- **Bulk invoice generation** — `POST /api/invoices/generate`; needs a dedicated JTBD once the flow is stabilised
- **Student detail inline edit** (`/admin/students/[id]`) — edit-toggle pattern exists; add JTBD once field coverage is final
- **Admission → enrolled student conversion** — flow exists but the handoff UX is still evolving
- **Teacher-portal leave request submission** — teacher-side form not yet shipped (see teacher.md Appendix)
- **Penilaian monitor** (`/admin/penilaian`) — covered by `JTBD-ADMIN-PENILAIAN-01`. The legacy assessment-template authoring surface (`/admin/assessment-templates`, `/admin/assessments`) was retired in the `penilaian-consolidation` cycle (redirects → `/admin/penilaian`); the new IKTP penilaian is authored via Kurikulum (Semester → IKTP) + entered by teachers.
- **Settings: campuses, roles & permissions, salary components, work hours** — low-frequency configuration; add JTBD only when a cycle touches them
- **Enrollment move** (move student between class sections mid-term) — edge case, low-frequency
- **Guardian create & link to student** — covered obliquely by `JTBD-ADMIN-STUDENT-01`; promote to first-class if friction shows up in UAT

### JTBD-ADMIN-PENILAIAN-01 — Monitor walas + sentra penilaian completion
- **Persona:** Ibu Nur (stands in for Kepala Divisi Pendidikan)
- **Role:** either (gated by `assessments.read`)
- **Expected perf:** page load <4s; week/day change → table refresh <2s
- **Preconditions:** Logged in with `assessments.read`; active academic year set; ≥1 active class section; some `AssessmentEntry` rows for the selected week/day
- **Steps (user intent, not UI clicks):**
  1. Open Penilaian → Pemantauan (`/admin/penilaian`)
  2. Read walas-weekly completion (assessed/enrolled) per class for the current week
  3. Change the week or sentra-day selector to inspect another period
  4. Read sentra-daily entries-made counts per center
- **Done when:** Each active class shows an `N/M dinilai` badge for the resolved week; the 8 sentra cards show entries + distinct-students for the selected day; changing the date re-queries without a full reload.
- **Why this job matters:** The academic head needs to see which walas/sentra are behind on penilaian during the pilot + before each triwulan raport — without this, gaps surface only at report-compile time.
- **Known friction (from last UAT):** <filled by /uat reports>

### JTBD-ADMIN-RAPORT-01 — Draft, override & publish a student's triwulan raport
- **Persona:** Ibu Nur (stands in for Kepala Divisi Pendidikan)
- **Role:** either (gated by `reportCard.read`/`write`/`publish`)
- **Expected perf:** page load <4s; open a student's raport (auto-draft) <3s
- **Preconditions:** Logged in with `reportCard.*`; active semester set; ≥1 Term (triwulan) created; ≥1 class with active students; some `AssessmentEntry` rows in the term window
- **Steps (user intent, not UI clicks):**
  1. Open Penilaian → Raport (`/admin/raport`); if no triwulan exists, create one (semester + number + dates)
  2. Pick a triwulan + class → read the roster with per-student status (Belum dibuat / Draft / Terbit)
  3. Open a student → see narrative sections pre-filled with a suggested level (from penilaian) + the "saran penilaian" count hint, and attendance auto-pulled
  4. Override a level / edit a narrative / adjust attendance; Simpan
  5. Simpan & Terbitkan; then Unduh PDF
- **Done when:** A new student opens with suggested levels + attendance (not blank); edits persist on save (status → Draft); publishing flips status → Terbit; the PDF downloads with the saved sections, attendance, hafalan, and signature lines.
- **Why this job matters:** Raport compile was ~640 hand-assembled docx/year. The admin surface turns penilaian already in the system into a draft the academic head reviews + overrides, instead of re-typing from paper.
- **Known friction (from last UAT):** <filled by /uat reports>

### Negative-access (deferred until role-split ships)

Add these once Bu Lina (`SCHOOL_ADMIN`) persona exists. They verify the role split holds — they are **access-control smoke tests**, not timed JTBDs, and `/uat` grades them on "expected 403 received" rather than page-load thresholds.

- **`JTBD-ADMIN-PAY-02`** — `SCHOOL_ADMIN` → `/admin/payroll` returns 403; sidebar does not show Payroll; `GET /api/employees` response has salary fields stripped
- **`JTBD-ADMIN-SET-SALCOMP-02`** — `SCHOOL_ADMIN` → `/admin/salary-components` returns 403
- **`JTBD-ADMIN-EMP-SAL-02`** — `SCHOOL_ADMIN` opens employee detail; salary section is absent (not just hidden via CSS)
