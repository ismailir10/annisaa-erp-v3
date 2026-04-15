# Staging Seed — Parent Portal Demo Data

## Context

We need to visually verify three parent portal screens — **Tagihan (invoices)**, **Kehadiran (attendance)**, and **Rapor (reports/assessments)** — on staging. Today's audit of the staging database revealed that the current seed data is incomplete in several ways that prevent these screens from showing meaningful content.

**Two existing GUARDIAN demo accounts:**

| Account | Parent | Student | Class |
|---|---|---|---|
| `redacted-parent@example.test` | Demo Parent (g_4) | Demo Child (st_4) | TKIT B |
| `redacted-parent@example.test` | Demo Parent | Demo Child | Unknown (no enrollment!) |

**Bugs & oddities found during the audit (fix in this cycle):**

1. **Demo Child has no `StudentEnrollment`** — he has 5 attendance records (which require a `classSectionId`) but no enrollment row. So `getParentWithChildren` returns `className: null` for his child tab, and the attendance query has an implicit classSectionId that we need to discover.
2. **Invoice `parentId` always null** — the column exists on every Invoice row but is never populated by any code path. The portal queries by `studentId` (so it's not breaking), but the field is dead data. Fix: populate from `StudentGuardian` for existing invoices; file a follow-up to set it on create.
3. **Invoice `periodLabel` = `"may 2026"`** — lowercase English. Should be `"Mei 2026"` (Indonesian, titlecase), consistent with existing `"April 2026"` and `"Maret 2026"`.
4. **Ahmad Faris has 0 unpaid invoices** — all 3 invoices are `PAID`. Dashboard calls `getStudentInvoices()` which filters for `SENT | PARTIALLY_PAID | OVERDUE`. Tagihan screen shows them (filter `status != DRAFT`), but the dashboard widget is empty. Need 1 SENT invoice to make the dashboard meaningful.
5. **Only 5 days of attendance (Apr 8–14)** — portal shows last 30 days. Five records means an almost-empty calendar. Need ~15 school-day backfill (mid-March → Apr 7) with varied statuses.
6. **Bilal has no `StudentAssessment`** — rightjet account shows empty rapor. Need 1 PUBLISHED assessment with scores.

---

## Spec

### Acceptance criteria

- [ ] Logging in as `redacted-parent@example.test` shows:
  - Dashboard: child card (Ahmad Faris, TKIT B), at least 1 unpaid invoice in the widget
  - Tagihan: list of invoices (SENT + PAID history), detail sheet opens correctly with line items + payment history
  - Kehadiran: calendar with ~20 days of data, variety of statuses (PRESENT / ABSENT / SICK / LATE)
  - Rapor: 1 published assessment with category + indicator scores

- [ ] Logging in as `redacted-parent@example.test` shows:
  - Dashboard: child card (Demo Child, class name visible), 1 unpaid SENT invoice on widget
  - Tagihan: 1 SENT invoice visible in list + detail sheet
  - Kehadiran: ~20 days of data with variety
  - Rapor: 1 published assessment with scores

- [ ] No data consistency errors: `Invoice.parentId` populated for all invoices that have a resolvable primary guardian; `periodLabel` for Bilal's invoice corrected to `"Mei 2026"`

---

## Tasks

### [x] Task 1 — Verify + fix Bilal's StudentEnrollment and classSectionId
- Query existing attendance records for Bilal to find the `classSectionId` in use.
- If no `StudentEnrollment` row exists, insert one (`status=ACTIVE`, matching that `classSectionId`).
- Confirm `getParentWithChildren` will now return a non-null `className`.

### [x] Task 2 — Fix Invoice data quality issues
- Fix `periodLabel = "may 2026"` → `"Mei 2026"` on invoice `cmnvnohil000a04l8klux9bzd`.
- Populate `Invoice.parentId` for all invoices where the student has a primary guardian with a known `parentId`:
  - Ahmad Faris invoices → `g_4`
  - Demo Child invoice → `cmnriprp7000105jxvzydico7`
  - All other invoices → join `StudentGuardian` where `isPrimary=true` and set `parentId`.

### [x] Task 3 — Add 1 SENT invoice for Ahmad Faris (Mei 2026)
- Invoice: `studentId=st_4`, `tenantId=t_staging`, `periodLabel="Mei 2026"`, `dueDate="2026-05-10"`, `status=SENT`, `totalDue=900000`, `totalPaid=0`.
- Invoice lines: 2 lines matching existing fee structure for TKIT program (SPP + Kegiatan).
- `createdBy` = admin user id (existing admin).
- `sentAt` = now.

### [x] Task 4 — Backfill StudentAttendance (Mar 17 – Apr 7, ~15 school days)
Seed rows for **both** `st_4` and Demo Child's studentId. Use their known `classSectionId`. Vary statuses realistically:

| Date | Ahmad Faris | Demo Child |
|---|---|---|
| 2026-03-17 | PRESENT | PRESENT |
| 2026-03-18 | PRESENT | LATE |
| 2026-03-19 | PRESENT | PRESENT |
| 2026-03-20 | SICK | PRESENT |
| 2026-03-21 | PRESENT | PRESENT |
| 2026-03-24 | PRESENT | ABSENT |
| 2026-03-25 | PRESENT | PRESENT |
| 2026-03-26 | LATE | PRESENT |
| 2026-03-27 | PRESENT | SICK |
| 2026-03-28 | PRESENT | PRESENT |
| 2026-04-07 | ABSENT | PRESENT |

(Skipping Mar 31–Apr 4 = Idul Fitri national holiday week per the 16-row Holiday table.)

### [x] Task 5 — Create PUBLISHED StudentAssessment + scores for Demo Child
- `StudentAssessment`: `studentId=<bilal_id>`, `templateId` = TKIT template (existing), `period="Semester 1 2025/2026"`, `status=PUBLISHED`, `publishedAt=now`, `createdBy=<admin_id>`.
- `StudentAssessmentScore`: one row per indicator (24 indicators from existing template).
  - Score values: mix of `"BB"`, `"MB"`, `"BSH"`, `"BSB"` (Indonesian PAUD rubric).
  - A few with notes (e.g. `"Perlu perhatian khusus"`).

---

## Implementation

- Task 1: Verify Bilal's StudentEnrollment — confirmed ACTIVE row exists (`cs_kb_metland`); no insert needed. False alarm from multi-statement SQL in spec phase.
- Task 2: Fix Invoice data quality — `UPDATE "Invoice" SET "parentId"` via `StudentGuardian` JOIN (36/36 populated, 0 nulls remain); `periodLabel` "may 2026" → "Mei 2026" on `cmnvnohil000a04l8klux9bzd`.
- Task 3: Add SENT invoice for Ahmad Faris — inserted `inv_st4_mei26` (INV-2026-0301, Mei 2026, 900k, SENT) + 2 InvoiceLines (SPP 750k + Kegiatan 150k).
- Task 4: Backfill StudentAttendance — 22 rows inserted (11 school days × 2 students, Mar 17–Apr 7, skipping Idul Fitri week). Both students now have 16 total records in 30-day window.
- Task 5: PUBLISHED StudentAssessment for Bilal — `sa_bilal_s1` inserted (at_tkit template, Semester 1 2025/2026, PUBLISHED) + 24 scores across 6 categories (BB/MB/BSH/BSB mix with notes).

---

## Verification

### Gates (before marking done)
- [x] `npm run build && npx vitest run` passes (73/73 tests, build clean after copying `.env` to worktree)
- [x] SQL: `enrollment` = 1 (Bilal, ACTIVE, cs_kb_metland)
- [x] SQL: `invoice_parentId_nulls` = 0 (all 36 invoices populated)
- [x] SQL: `attendance_st4_backfill` = 16 (≥ 15 ✓)
- [x] SQL: `attendance_bilal_backfill` = 16 (≥ 15 ✓)
- [x] SQL: `bilal_published_assessment` = 1
- [x] SQL: `bilal_assessment_scores` = 24

### Manual smoke (staging)
- [ ] `redacted-parent@example.test` → dashboard shows child card + unpaid Mei 2026 invoice widget
- [ ] → Tagihan: 4 invoices visible; detail sheet opens with lines and payments
- [ ] → Kehadiran: calendar shows Mar–Apr data, mixed statuses
- [ ] → Rapor: published assessment renders with category rows + score badges
- [ ] `redacted-parent@example.test` → dashboard shows "Demo Child" with class name (not null)
- [ ] → Tagihan: 1 SENT invoice; detail sheet opens
- [ ] → Kehadiran: mixed attendance data
- [ ] → Rapor: published assessment renders

---

## Ship Notes

**All changes are data-only (SQL INSERT/UPDATE on staging Supabase).** No migrations, no env vars, no code changes.

**Rollback SQL** (if needed):
```sql
-- Undo Task 2 (parentId + periodLabel)
UPDATE "Invoice" SET "parentId" = NULL WHERE "tenantId" = 't_staging';
UPDATE "Invoice" SET "periodLabel" = 'may 2026' WHERE id = 'cmnvnohil000a04l8klux9bzd';

-- Undo Task 3
DELETE FROM "InvoiceLine" WHERE "invoiceId" = 'inv_st4_mei26';
DELETE FROM "Invoice" WHERE id = 'inv_st4_mei26';

-- Undo Task 4
DELETE FROM "StudentAttendance" WHERE id LIKE 'att_st4_%' OR id LIKE 'att_bil_%';

-- Undo Task 5
DELETE FROM "StudentAssessmentScore" WHERE "assessmentId" = 'sa_bilal_s1';
DELETE FROM "StudentAssessment" WHERE id = 'sa_bilal_s1';
```

**Manual smoke steps** (on staging — annisaa-erp-v3-staging):
1. Login as `redacted-parent@example.test` → verify dashboard widget shows Mei 2026 unpaid
2. Login as `redacted-parent@example.test` → verify class name shows "KB Metland", rapor loads

**Follow-up (out of scope for this cycle):**
- `Invoice.parentId` should be set at invoice creation time in the API (`app/api/invoices/route.ts`) — resolved by querying `StudentGuardian` for the student's primary guardian at POST time.
- 21 of 23 parents have no User login account — bulk onboarding flow needed before real launch.
- `ClassSection` missing `status` column — known gap per CLAUDE.md.
