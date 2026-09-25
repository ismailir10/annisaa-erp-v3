# Prod Data Wipe — Clean Slate for Roster Re-import

## Context

The 2026-07-23 re-import ([[2026-07-23-prod-roster-reimport]]) rebuilt prod student
and class data but preserved prod's 305 legacy `Parent` rows plus all config
(programs, academic years, semesters, holidays, journal curriculum). Owner (CTO)
decided that partial preservation is what keeps producing drift, and asked for a
full data wipe of prod (`vxwywmvpxetdgnxejjgk`) — keeping only the login accounts —
so the roster import can be redone from a genuinely clean slate.

## Spec

Wipe every row in the `public` schema of prod except the account layer:

- **Keep**: `Tenant` (1), `User` (5), `Employee` (2), `Campus` (2),
  `_prisma_migrations`, and Supabase `auth.users` (8).
- **Wipe**: all 54 other public tables → 0 rows. Includes `Parent` (306, bio
  intentionally discarded per owner decision), `Student`, `StudentGuardian`,
  `StudentEnrollment`, `ClassSection`/`Track`/`Session`, `AcademicYear`,
  `Semester`, `Term`, `Program`, `Holiday`, `OrgConfig`, journal curriculum,
  `AuditLog`, `AttendanceRecord`, `LeaveRequest`.
- **Full-fidelity backup** taken before any delete, restorable without external
  tooling.

**Forced exception — `Campus`.** `Employee.campusId` is `NOT NULL` with
`ON DELETE RESTRICT`, and both `Employee` rows reference `campus_taman_aster`.
Keeping `Employee` (owner's choice) makes wiping `Campus` impossible. Owner
elected to keep both `Campus` rows; the import re-uses the same stable campus ids.

Non-goals: the re-import itself; touching `auth.users`; any application code.

## Tasks

- [x] Map every public-schema FK + `ON DELETE` action; detect conflicts with the
      keep-list.
- [x] Snapshot all 58 public tables into an in-database `backup_20260725` schema;
      verify row counts match.
- [x] Execute the wipe in one transaction, 54 tables in FK-dependency order.
- [x] Verify post-wipe counts + account-link integrity.
- [ ] (owner) Restore FK scaffolding or regenerate it, then re-run the import.
- [ ] (owner) Re-link the guardian test-login to a real imported parent.

## Implementation

Pure production data operation — no application code changed.

**Backup strategy.** No prod credentials exist locally (`.env` points at staging;
no `psql`/`pg_dump`/`psycopg2`), so the only channel to prod is the Supabase MCP.
Routing a ~150 KB logical dump through the assistant context was avoidable:
instead the backup is taken **inside the database**, via a `DO` block that clones
every `public` table into schema `backup_20260725` with `CREATE TABLE … AS TABLE`.
Full fidelity, zero egress, survives the wipe, and restores with plain
`INSERT INTO public.X SELECT * FROM backup_20260725.X`. Data-only — the clone
carries no constraints or indexes, which is correct for a restore source.

**Wipe order.** Explicit `DELETE` (never `TRUNCATE … CASCADE`, which would have
followed `User.parentId → Parent` and destroyed the accounts the wipe exists to
protect). 54 statements ordered children-before-parents against the FK map, in a
single `BEGIN … COMMIT`. `User.parentId` and `User.customRoleId` are
`ON DELETE SET NULL`, so deleting `Parent` and `Role` degraded the links rather
than the rows.

## Verification

Applied to prod `vxwywmvpxetdgnxejjgk` on 2026-07-25.

**Backup integrity (pre-wipe):** 58 backup tables vs 58 public tables; every
per-table count identical. Spot values: `Parent` 306, `Student` 172,
`StudentGuardian` 323, `StudentEnrollment` 395, `ClassSession` 2349, `AuditLog` 62.

**Post-wipe counts:**

| Table | Count | Expected |
|---|---|---|
| Tenant | 1 | kept ✓ |
| User | 5 | kept ✓ |
| Employee | 2 | kept ✓ |
| Campus | 2 | kept (forced by `Employee.campusId`) ✓ |
| auth.users | 8 | untouched ✓ |
| Student / Parent / ClassSection / ClassSession | 0 / 0 / 0 / 0 | ✓ |
| AcademicYear / Holiday / OrgConfig | 0 / 0 / 0 | ✓ |
| all other public tables | 0 | ✓ |

- `users_with_employee = 2` — both teacher logins keep their staff record.
- `users_with_parent = 0` — the guardian test-login (`rightjet.hq@gmail.com`) was
  unlinked when `parent_test_login_guardian` was deleted, per owner's choice to
  re-link it to a real imported parent afterwards.
- Pure-data cycle → Playwright and preview-verify N/A, skipped deliberately.
- No frontend diff in this cycle, so the `design-system` frontend gate does not
  apply; no `.tsx`/`.css` files were touched.

### Blocking follow-up for the re-import

`artifacts/import.sql` hardcodes FK targets that the wipe removed. Surviving:
`tenant_annisaa`, `campus_metland_cibitung`, `campus_taman_aster`. **Missing:**
`program_tkit`, `program_kb`, `program_dcare`, `ay_2022_2023` … `ay_2026_2027`,
all `Semester`/`Term` ids, the 23 `Holiday` rows, and `OrgConfig`. Re-running
`import.sql` unchanged will abort on FK RESTRICT.

Two options — owner's call:
1. **Restore the scaffolding** from the backup schema (preserves the exact ids the
   script expects): `INSERT INTO "Program" SELECT * FROM backup_20260725."Program";`
   and likewise for `AcademicYear`, `Semester`, `Term`, `Holiday`, `OrgConfig`.
2. **Regenerate config as part of the new import** — cleaner, but `gen_import_sql.py`
   must be extended to emit the config rows it currently assumes.

`OrgConfig` also drives working days / timezone / grace period, so the app needs a
row back before attendance behaves correctly.

## Ship Notes

- **Migrations**: none. **Env**: none. **Code**: none.
- **Backup / rollback**: schema `backup_20260725` in prod holds all 58 tables at
  pre-wipe state. Full rollback = `INSERT INTO public.X SELECT * FROM
  backup_20260725.X` for every table, in the reverse of the wipe order (parents
  before children). Off-site copy of the *pre-2026-07-23* state remains at
  `artifacts/backup/prod_backup_2026-07-23.json`.
- **Drop the backup schema only after the re-import is verified** — `DROP SCHEMA
  backup_20260725 CASCADE`. Until then it is the sole copy of the 306 `Parent`
  rows and their NIK/occupation/income bio.
- Wipe ran as a single transaction; any error would have aborted it whole.
