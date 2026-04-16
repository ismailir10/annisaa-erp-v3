# Admin Portal — Jobs to be Done

> Last audited: 2026-04-16 in cycle `uat-command-and-jtbd-library`
> Portal root: `app/admin/`
> Default persona: Ibu Nur (SUPER_ADMIN) — see `.claude/personas/ibu-nur.md`

This file is the living catalog of what an admin user can and should be able to do in this system. `/uat admin` reads it, picks jobs scoped to the requested area, and role-plays each one via Playwright MCP. When a cycle adds, removes, or materially changes an admin-facing capability, edit this file as part of that cycle and bump the "Last audited" date.

**Note on roles:** This cycle ships with 3 personas (Pak Budi, Bu Sari, Ibu Nur). A 4th persona — regular `SCHOOL_ADMIN` (Bu Lina or equivalent) — is deferred until the parallel `role-split` cycle merges. Once it does, add `JTBD-ADMIN-PAY-02` (payroll access expects 403 as SCHOOL_ADMIN) and any other salary-403 variants.

---

## Area: students

### JTBD-ADMIN-STUDENT-01 — Create a new student end-to-end
- **Persona:** Ibu Nur
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

---

## Area: invoices

### JTBD-ADMIN-INV-01 — Create a manual invoice for a specific student
- **Persona:** Ibu Nur
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

## Area: payroll

### JTBD-ADMIN-PAY-01 — Run payroll for this month (SUPER_ADMIN)
- **Persona:** Ibu Nur (`SUPER_ADMIN`)
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

## Area: employees

### JTBD-ADMIN-EMP-01 — Deactivate an employee who is leaving
- **Persona:** Ibu Nur
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

## Area: leave

### JTBD-ADMIN-LEAVE-01 — Approve a pending leave request
- **Persona:** Ibu Nur
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 leave request with status `PENDING` in seed
- **Steps:**
  1. Open the leave area
  2. See pending requests first (or filter to pending)
  3. Open a request
  4. Approve it
  5. See the request's status change to `APPROVED`
- **Done when:** Request is `APPROVED`, the teacher who requested it sees the status updated in their portal (or would, in a subsequent login). Audit trail records who approved and when.
- **Why this job matters:** Weekly rhythm. If Ibu Nur can't find pending requests in under 3 seconds, they pile up.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Area: academic

### JTBD-ADMIN-ACAD-01 — Review academic year and class section setup
- **Persona:** Ibu Nur
- **Preconditions:** Logged in as SUPER_ADMIN, ≥1 academic year + ≥1 class section in seed
- **Steps:**
  1. Open the academic / settings area
  2. See the list of academic years
  3. Navigate to the current year's class sections
  4. Confirm each class section shows student count and wali kelas assignment
- **Done when:** User can answer "are all classes set up correctly for this term?" in under 30 seconds. Empty states (if any class has no wali kelas) are visually distinct and actionable.
- **Why this job matters:** Start-of-term ritual. Ibu Nur does it once every 6 months but if it's broken, everything downstream (attendance, invoices, payroll) breaks.
- **Known friction (from last UAT):** <filled by /uat reports>

---

## Appendix: jobs not yet seeded

- Admissions pipeline (inquiry → registered → cancelled)
- Fee component definition management
- Bulk invoice generation for a month
- Export payroll to Excel
- `JTBD-ADMIN-PAY-02` — SCHOOL_ADMIN payroll access returns 403 (deferred, blocked on role-split cycle)
