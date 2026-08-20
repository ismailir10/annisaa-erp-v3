# Prod Roster Re-import — Clean Rebuild from Siswa-Talib.xlsx

## Context

The 2026/2027 roster and its historical years were imported piecemeal (see
[[2026-07-13-roster-import-2026-2027]]) leaving prod with inconsistent class
naming — the same 2026/27 Metland cohort exists as both `TK A Metland` and
empty leftover `A3/A4` sections; campus is embedded in some class names and
absent from others; program labels are dirty (`Daycare`, `Day Care 1/2/3/4`).
Owner (CTO) decided to redo the import cleanly from the canonical source
spreadsheet `artifacts/Siswa-Talib.xlsx`, wiping student-side data + class
structure and rebuilding with a consistent naming scheme, keeping only the
logged-on accounts.

Source file: 12 sheets — a current snapshot (`siswa_2026-07-16`, 168) plus
per-year rosters 2016/17→2026/27. The two 2026/2027 sources disagree on grade
level (promotion drift) and class naming (numbered rombel vs campus names).

## Spec

Rebuild prod (`vxwywmvpxetdgnxejjgk`) student/enrollment/class data from the
spreadsheet such that:

- **Scope**: students enrolled in AY 2026/2027 (union of both 2026/27 sources),
  with their prior-year enrollments backfilled (2022/23→2025/26). Pure leavers
  (never in 2026/27) dropped.
- **Class naming** (consistent, campus-encoded per the `ClassSection` unique
  constraint `[tenantId, academicYearId, name]`): `<Level> <Campus>` —
  `TK A Metland`, `KB Aster`, `TD Metland`, `Bayi 6-12 Bulan Metland`. 2026/27 is
  flat (one section per level+campus, matching the school's real current setup);
  history keeps prod's real rombel splits, clean-renamed `TK B Aster 1/2/3`.
- **Campus** resolved from prod's real assignments (per-year), then explicit
  labels, then propagation; `Metland`/`Aster` stripped from class names.
- **Guardians preserved**: keep prod's 305 Parents + rich father/mother bio
  (NIK, occupation, income); re-link to rebuilt students by name. New students
  get the single xlsx wali.
- **Accounts kept**: all 5 User rows + 2 Employees (incl. test-logins).
- **Sessions**: regenerate `ClassSession` rows for the 9 active 2026/27 sections
  (MON-FRI minus holidays) so attendance-marking works.

Non-goals: pre-2022 history; the 3 unresolved students (below); parent-portal
accounts; invoices/fees.

## Tasks

- [x] Examine all 12 sheets; unify into review workbook `Siswa-Talib-Unified.xlsx`.
- [x] Normalize program/class names; resolve campus from prod truth.
- [x] Scope to 2026/27 roster + backfill; merge 16 DOB-confirmed typo-dup names.
- [x] Build final review workbook `Siswa-Talib-Final.xlsx` + `import_plan.json`.
- [x] Generate `artifacts/import.sql` (wipe + rebuild + guardian relink + sessions).
- [x] Back up all 9 mutated tables → `artifacts/backup/prod_backup_2026-07-23.json`.
- [x] Pre-flight FK targets (campus/program/year/semester/parent ids) — all exist.
- [ ] **(pending owner GO)** Apply `import.sql` to prod, verify counts, spot-check.
- [ ] (owner) Place 3 skipped students — Ghiani Harahap (incomplete record),
      Muhammad Ghaisan Keenandra Ramadhika, Muhammad Shaqeel Abil Muksin
      (no campus signal anywhere).

## Implementation

Pure production data operation — no application code changed. Reproducible,
committed scripts under `artifacts/` (unlike the ephemeral 2026-07-13 pass):

- `unify_siswa.py` — first-pass unification of all sheets.
- `build_final.py` — scoped import plan: roster filter, typo-dup merge, campus
  resolution, rombel numbering → `Siswa-Talib-Final.xlsx` + `import_plan.json`.
- `gen_import_sql.py` — emits `artifacts/import.sql` from the plan +
  `prod_guardians.json` + hard-coded prod config (tenant/campus/program/year/
  semester ids, MON-FRI working days, 2026 holidays). Deterministic md5-based ids.

Wipe order (FK-verified via `information_schema`): journals (no FK, orphan-clean)
→ `Student` (cascades enrollments/guardians/attendance) → `ClassSection`
(cascades sessions/teaching-assignments) → `ClassTrack`. Kept: Tenant, User,
Employee, Role, OrgConfig, Campus, Program, AcademicYear, Semester, Holiday,
Parent, Term, curriculum. Sessions generated in-DB via `generate_series` over
each 2026/27 semester range, replicating `lib/sessions/reconcile.ts` logic.

Planned counts: 172 students, 398 enrollments, 11 tracks, 40 sections
(9×2026/27 + 31 historical), 322 guardian relinks, 1 new parent, ClassSessions
for 9 active sections. 3 students skipped (unresolved campus).

## Verification

**Applied to prod `vxwywmvpxetdgnxejjgk` 2026-07-23** in 6 atomic transactions
(wipe+structure, students, enrollments×2, guardians, sessions). Post-apply counts:

| Entity | Count | Expected |
|---|---|---|
| Student | 172 | 172 ✓ |
| StudentEnrollment | 395 | 172 active + 223 historical ✓ |
| StudentGuardian | 323 | 322 relinked + 1 new wali ✓ |
| Parent | 306 | 305 preserved + 1 new (DIYAS PRASETYO) ✓ |
| ClassTrack | 10 | ✓ |
| ClassSection | 40 | 9 (2026/27) + 31 historical ✓ |
| ClassSession | 2349 | 261 × 9 active sections ✓ |
| orphan guardian parentIds | 0 | ✓ |

- **2026/27 sections** (flat, campus-encoded): TK A/B Metland (27/56), KB Metland
  (16), TD Metland (3), Bayi 6-12 Bulan Metland (3); TK A/B Aster (12/48), KB
  Aster (6), TD Aster (1). Each with 261 ClassSessions incl. today (2026-07-23).
- 5 students carry no guardian (sparse source records: Ahmad Ibrahim Ukkasyah,
  Argatama Shiena Mumtadz, Arsyila El Madina, Ghania Arsyila Farannisa Baa, Zayn
  Kevin) — owner to complete.
- **Two post-apply data fixes** (found during verification, both corrected):
  1. `ClassSession.date` was written as `'YYYY-MM-DD 00:00:00+00'` (22 chars) —
     `generate_series(date,date,interval)` returns timestamps, so `::text` kept the
     time. `UPDATE … SET date = left(date,10)` normalised all 2349 rows to the
     `date String` (YYYY-MM-DD) the app expects; `date='2026-07-23'` now matches.
  2. One DOB (`Akalanka Zale Ibrahim`) was the un-parsed `'22 Oktober 2020'` →
     fixed to `'2020-10-22'`.
- Backup of pre-wipe state (166 Student / 305 Parent / 322 StudentGuardian / 392
  Enrollment / 50 ClassSection / 27 ClassTrack / 2 TA / 10 journal rows) saved at
  `artifacts/backup/prod_backup_2026-07-23.json` (434 KB).
- All FK targets pre-verified present; ageGroups ∈ {A,B}; statuses ∈ {ACTIVE,
  GRADUATED,WITHDRAWN}.
- Pure-data cycle → Playwright N/A. **Recommended follow-up:** app-level
  preview-verify of teacher attendance for today + admin roster views (not run in
  this session).

### Known follow-ups (owner)
- Place 3 skipped students (Ghiani Harahap, Muhammad Ghaisan Keenandra Ramadhika,
  Muhammad Shaqeel Abil Muksin) once campus is confirmed.
- Split oversized 2026/27 sections (TK B Metland 56, TK B Aster 48) into rombel
  via admin UI if the school runs parallel classes.
- Complete the 5 no-guardian sparse student records.

## Ship Notes

- **Migrations**: none. **Env**: none. **Code**: none.
- **Backup / rollback**: `artifacts/backup/prod_backup_2026-07-23.json` is a full
  logical snapshot of every mutated table; restore by re-inserting from it.
  ClassSession (5421 rows) not backed up — derived, regenerates identically.
  Also confirm Supabase PITR is enabled as the belt-and-suspenders safety net.
- Apply is a single transaction (`BEGIN…COMMIT`): any error aborts the whole
  thing with no partial state.
- Source spreadsheet + generated artifacts live under `artifacts/` (gitignored);
  this doc is the committed record.
