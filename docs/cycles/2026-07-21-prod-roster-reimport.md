# Prod Roster Re-import — AY 2026/2027 (siswa_2026-07-16)

## Context

Production student data must be re-synced to the owner's latest authoritative roster,
`artifacts/Siswa-Talib.xlsx` → sheet **`siswa_2026-07-16`** (168 rows). That sheet is a
thin re-export of the current prod student list (its 18 columns match Talib's own Siswa
export) plus the owner's edits since: **+10 new students** (mostly Day Care infants), **2
renames**, and field corrections (whitespace, program labels, NIS/NISN). Prod today holds
158 students, 19 class sections, 158 enrollments, and — critically — **299 rich Parent
rows** (292 with NIK, 294 occupation/education, 199 income) plus ~2 guardian links per
student. That guardian richness exists **only in prod**; the sheet carries a single thin
"Nama Wali" name+phone per student and cannot rebuild it. Student-linked history is
throwaway (1 attendance, 1 measurement, 1 report-card entry, 1 admission; 0 invoices/
assessments). Owner decision: **wipe and rebuild the student rows from the sheet, but keep
the existing Parent rows and re-link them by student-name match** — clean deterministic
students without losing the expensive guardian data.

## Spec

**Acceptance criteria**

- [ ] After the run, prod `Student` set == the sheet's active roster: **166 students**
      (168 rows minus 2 `Keluar`), each with name, nickname, gender (L/P), birthPlace,
      dateOfBirth (YYYY-MM-DD), address, livingWith, status=ACTIVE, and NIS/NISN where the
      sheet provides them.
- [ ] Every imported student has exactly **1 ACTIVE `StudentEnrollment`** into the
      `ClassSection` matching its "Kelas" for AY 2026/2027.
- [ ] All **299 existing `Parent` rows are preserved** (no Parent deleted; rich NIK/
      occupation/education/income intact).
- [ ] For each imported student that existed in prod pre-wipe (matched by normalized name,
      with an explicit alias map for the 2 renames), the **same guardian links are
      recreated** — same parentId(s), relationship, isPrimary, childOrder.
- [ ] For each of the **10 genuinely new** students, a guardian is created from the sheet's
      wali (name + phone, relationship=WALI, isPrimary=true) and linked; a new Parent row is
      created only when no existing Parent matches the wali name.
- [ ] The **2 Day Care infant sections** present in the sheet but missing from prod
      (`Bayi 6-12 Bulan`, `Bayi 1-2 Tahun`) are created under the Day Care program with
      backing ClassSessions, before enrollment.
- [ ] Per-class enrollment tallies after the run match the sheet's Kelas counts exactly.
- [ ] The transform is a **committed, idempotent** script that (a) reads the xlsx + a prod
      graph snapshot and (b) emits a single reviewable, transactional `import.sql`; rerunning
      with the same inputs yields the same end-state.
- [ ] A full prod snapshot (Student + StudentGuardian + StudentEnrollment + Parent) is taken
      and stored locally (gitignored, PII) **before** any delete.

**Non-goals**

- No parent-portal accounts / logins (portal still deferred per [[project_pilot_rollout]]).
- No new bulk-import UI feature — one-off committed script, run via Supabase MCP.
- No touching the 19 existing ClassSections or their ~4907 ClassSessions (kept as-is).
- Not importing the 2 `Keluar` students, and not the older `20262027` / `Data siswa TA
  2526-1` sheets.
- No application code changes to `app/**` or `lib/**` — data + script only.

**Assumptions**

1. `siswa_2026-07-16` is the single source of truth for *which students exist* and their
   *student-level* fields + class assignment. Guardian richness comes from prod, not sheet.
2. "Kelas" maps 1:1 to an existing prod `ClassSection` by name, except the 2 infant classes
   which we create. The 1 row with blank Kelas is surfaced for owner resolution, not guessed.
3. Re-link key = normalized (trim+lowercase) student name, plus a hardcoded 2-entry alias
   map: `azhima hafsah nafisa → azhima hafshah nafisa`, `orca barraq → orca barraq ameer`.
4. `Keluar` (2 students) = excluded from the active roster entirely.
5. Wipe = hard-delete Student graph (Students cascade StudentGuardian; enrollments +
   the 4 history rows deleted explicitly); Parents survive (no cascade from Student).

## Tasks

- [x] **T1 — Backup prod graph.** Snapshotted Student/StudentGuardian/StudentEnrollment/Parent
      into an in-prod schema `roster_backup_20260721` (158/314/158/299) — instant rollback path,
      chosen over local JSON (no context round-trip, always consistent).
- [x] **T2 — Parse + clean the sheet.** Committed `scripts/import-roster/build-import-sql.ts`
      (exceljs): read `siswa_2026-07-16`, normalize (trim/collapse space, strip trailing comma,
      program-label drift), gender→L|P, livingWith→ORANG_TUA/WALI/LAINNYA, phone 0-prefix,
      NIS/NISN/NIK/KK→digit strings, exclude 2 `Keluar`, fail-loud on unmapped Kelas / missing DOB.
      Result: 166 active rows, 0 blank-Kelas among actives (the lone blank row was a Keluar).
- [x] **T3 — Create 2 infant ClassSections.** `Bayi 6-12 Bulan` + `Bayi 1-2 Tahun` under
      `program_dcare` / AY 2026/2027, sessions cloned from TD2. 21 sections in prod, 257 sessions
      each incl. today.
- [x] **T4 — Generate stage.sql + transform.sql.** Generator emits a bulk `stage.sql`
      (public._roster_stage, all PII rows) + a compact `transform.sql` (no inline data) that
      asserts an md5 content-hash over the staged rows, then wipes the Student graph (Parents
      kept), inserts 166 students, enrolls by Kelas→section join, rebuilds guardian links from a
      live snapshot (2-entry rename alias map), and creates/reuses a WALI Parent for new students.
- [x] **T5 — Dry-run on prod (rolled back).** Ran the full transform inside a transaction that
      RAISEs at the end (auto-rollback) to return tallies: students=166, enroll=166, guardless=0,
      per-class tally == sheet, +6 new parents. Nothing persisted.
- [x] **T6 — Execute against prod.** Committed the transform after owner go-ahead. Post-run verify
      below.
- [x] **T7 — Cycle doc + docs PR.** This doc + committed generator; docs/script-only PR to staging.

## Implementation

- **`scripts/import-roster/build-import-sql.ts`** (committed, ~330 lines, tsx + exceljs) — the only
  committed artifact. Reads the xlsx (path arg), cleans + validates, and writes three gitignored
  outputs next to itself: `stage.sql` (bulk load of 166 rows into `public._roster_stage`),
  `transform.sql` (hash-gated wipe/insert/enroll/relink logic), `rowhashes.tsv` (per-row md5 debug
  aid). Deterministic student ids `imp_<md5(name)[:20]>`; content hash embedded in transform.sql so
  a faithful stage load is a precondition to commit.
- **`.gitignore`** — added `.roster-backup/`, `scripts/import-roster/{stage,transform}.sql`,
  `rowhashes.tsv` (all carry PII / are generated).
- **Prod data mutations** (via Supabase MCP against `vxwywmvpxetdgnxejjgk`, all transactional):
  backup schema `roster_backup_20260721`; 2 new infant `ClassSection` + `ClassTrack` + cloned
  `ClassSession`; the roster transform. No `app/**`/`lib/**`/`components/**` changed.
- **Mechanism note:** prod is reachable only via Supabase MCP (SQL inline). The stage load through
  MCP dropped 1 row + corrupted 1 address in transit — both caught by the transform's md5 hash gate
  and fixed before commit, proving the safety net works.

## Verification

- **Gates:** no application runtime code changed (only a standalone `scripts/` generator + docs), so
  `npm run build` / `vitest` / Playwright are N/A for regression — mirrors the prior data-setup cycle
  [2026-07-13-roster-import-2026-2027](2026-07-13-roster-import-2026-2027.md). Generator typechecks
  clean (`tsc --noEmit`) and runs green (emits 166 rows). Preview-verify skipped (no previewable UI).
- **Dry-run (rolled back):** students=166, enroll=166, guardless=0, parents 299→305, per-class tally
  == sheet exactly. Nothing persisted.
- **Post-commit prod state:** `Student`=166 (all `imp_`), `StudentEnrollment` ACTIVE=166, unenrolled=0,
  guardless=0, `StudentGuardian`=322, `Parent`=305 (299 preserved + 6 new; 302 linked),
  parents_with_nik=292 / occupation=294 (rich guardian data intact), students_with_nis=127.
- **Spot checks:** Abizard Nabil Muttaqi (returning) — 2 guardians (AYAH+IBU, NIK intact);
  Azhima Hafshah Nafisa + Orca Barraq Ameer (renames) — matched via alias, 2 guardians each;
  Ghania Raynamira / Ibrahim Zayd (new Bayi) — 1 WALI each, auto-linked to existing sibling parents.
- **Per-class tally == sheet:** A1:9 A2:10 A3:11 A4:12 B1:14 B2:15 B3:14 B4:14 KB1:8 KB3:8 KB4:8
  KB Aster:4 KB Metland:7 TK A Aster:3 TK A Metland:14 TK B Aster:3 TK B Metland:3 Bayi 6-12:3
  Bayi 1-2:2 TD2:4 = 166.

## Ship Notes

- **No app migrations, no env vars, no deploy** — this cycle is prod data setup + a one-off committed
  generator. The docs/script PR to staging carries no runtime change.
- **Rollback:** restore from the in-prod backup schema `roster_backup_20260721` (tables Student,
  StudentGuardian, StudentEnrollment, Parent) — truncate the current graph and `INSERT ... SELECT`
  from the backup. Drop the schema once the pilot confirms the new roster is correct (owner sign-off).
- **Reproduce:** `tsx scripts/import-roster/build-import-sql.ts <path-to>/Siswa-Talib.xlsx` →
  load `stage.sql` (verify md5) → run `transform.sql` (self-asserts, aborts on any mismatch). The xlsx
  lives in `artifacts/` (gitignored, local only).
- **Follow-ups for owner:** (1) 2 infant sections default to campus `Metland Cibitung` — reassign if any
  belong to Taman Aster; (2) ~44 students still have no wali phone and 15 no NIK (sparse in the sheet);
  (3) the 2 `Keluar` students (Muhammad Ghaisan Keenandra Ramadhika, Muhammad Shaqeel Abil Muksin) were
  excluded — re-add manually if they return; (4) drop `roster_backup_20260721` after sign-off.
