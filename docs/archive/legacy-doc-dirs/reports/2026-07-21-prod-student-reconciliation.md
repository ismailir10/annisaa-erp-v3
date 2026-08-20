# Prod Student Data Reconciliation — 2026-07-21

**Type:** Read-only verification (CTO pass). **No production data was modified.**

## Scope & sources

| Side | Identity |
|---|---|
| **Reference (source-of-truth)** | `artifacts/Siswa-Talib.xlsx` (mtime 2026-07-21), sheet `siswa_2026-07-16` — the current active-roster export. 168 rows = **166 `Aktif` + 2 `Keluar`**. Columns match the app's export schema (Nama Lengkap, Jenis Kelamin, Tempat/Tanggal Lahir, NIS, NISN, NIK, Kelas, Program, Tahun Ajaran, Nama Wali, No. Telepon Wali, …). |
| **Prod DB** | Supabase `vxwywmvpxetdgnxejjgk` (`annisaa-erp-v3-prod-sgp`), 1 tenant. Read via Management API query endpoint (SELECT-only). |

**Recent work reconstructed:** cycle [2026-07-13-roster-import-2026-2027.md](../cycles/2026-07-13-roster-import-2026-2027.md) (#383) imported the first **34** new-intake students via the live admin API. On **2026-07-21** the roster was fully re-synced to `Siswa-Talib.xlsx` via **PR #403 (merged 06:20 UTC)** — cycle doc `docs/cycles/2026-07-21-prod-roster-reimport.md` + committed idempotent generator `scripts/import-roster/build-import-sql.ts`. **Owner decision: hard-wipe the Student graph and rebuild from the sheet, but preserve all ~299 rich `Parent` rows and re-link guardians by normalized student-name** (with a 2-entry rename alias map) — clean deterministic students without losing the expensive NIK/occupation/income guardian data that exists only in prod. New students get a single `WALI` (name+phone) from the sheet. Pre-wipe snapshot lives in prod schema **`roster_backup_20260721`** (confirmed present — rollback path intact). `Data Lengkap Siswa 2026-2027.xlsx` was the Jul-13 partial source, now superseded.

This reconciliation therefore independently re-verifies the #403 outcome against its stated source.

## Prod snapshot

- Students: **166** (all `ACTIVE`) · Enrollments: **166** (exactly 1/student) · Class sections: **21** (all AY 2026/2027 ACTIVE)
- Academic years (tahun ajaran): **1** → `2026/2027` (ACTIVE, 2026-07-01 → 2027-06-30) · Semesters: 2 (S1 ACTIVE, S2 INACTIVE)
- Parents: **305** · StudentGuardian links: **322** · Primary flags: 166 (1/student)

## Verdict — data is aligned

### Row counts — ✅ MATCH
- **166 prod active ↔ 166 Excel `Aktif`.** Zero students in prod-but-not-Excel; zero in Excel-active-but-not-prod.
- The only 2 Excel-only rows are both status **`Keluar`** (withdrawn) — correctly absent from prod: *Muhammad Ghaisan Keenandra Ramadhika*, *Muhammad Shaqeel Abil Muksin*.
- No duplicate student names on either side.

### Per-student fields (166 matched) — ✅ near-perfect
| Field | Mismatches | Note |
|---|---|---|
| Gender | 0 | |
| NIS | 0 | |
| NISN | 0 | |
| Kelas / class section | **0** | Every class assignment identical to source |
| Date of birth | 1 | *Ghania Raynamira Bashari* — prod `2024-09-26`, Excel blank (**prod richer**, not a conflict) |

- **Tahun ajaran consistent:** every prod enrollment is in `2026/2027`; Excel tags 156 rows `2026/2027` + 12 blank. No conflicting year.
- **Class distribution matches source exactly** (A1:9, A2:10, A3:11, A4:12, B1:14, B2:15, B3:14, B4:14, KB1/3/4:8 each, TD2:4, Bayi 1-2:2, Bayi 6-12:3, KB Aster:4, KB Metland:7, TK A Aster:3, TK A Metland:14, TK B Aster:3, TK B Metland:3). `TD1` = 0 enrolled (its lone Excel row is the `Keluar` student).

### Parents / orang tua — ✅ aligned
- Every student has ≥1 guardian (156 have 2, 10 have 1 sole `WALI`). No student with 0 guardians.
- **Wali NAME: 0 mismatches** — every Excel `Nama Wali` matches a prod guardian for that child.
- **Wali PHONE: 4 real gaps** (Excel has a number, prod guardian phone is null) — see Recommendations. The other "44 differences" flagged on first pass were **Excel leading-zero loss** (numeric cells: Excel `87716513256` = prod `087716513256`); prod stores the correct zero-prefixed number.
- Phone is **sparse in the source itself** (44/166 Excel rows carry a wali phone); prod covers 42/166 → faithful, not lossy.

### Integrity — ✅ clean
- FK: 0 bad parent FK, 0 bad student FK, 0 bad section FK, **0 cross-tenant mismatch**.
- 0 students without enrollment; **0 multiple-enrollment** (each exactly one).
- **0 duplicate NIS, 0 duplicate NISN, 0 duplicate parent NIK.** Siblings correctly **share a single Parent row** (20 parents linked to >1 student) — no duplicate-person rows.
- NIS/NISN gaps **mirror the source exactly**: prod missing NIS=39 / NISN=69 ↔ Excel missing NIS=39 / NISN=69. No identifier lost or invented.

## Observations & optional follow-ups (NO action taken — approval required)

Most items below are **by-design consequences** of the "wipe students / keep parents" strategy in PR #403, not defects. Flagged for owner awareness only.

1. **4 wali phones present in the sheet but null in prod** — *Ibrahim Zayd Muzanni* (081389235532), *Ghania Raynamira Bashari* (081385805126), *Rachel Ceisya Almahira* (081361351377), *Rafan Ghifari* (081293885981). Consistent with the design: for **existing** students the preserved (phoneless) Parent row is re-linked and the sheet's phone is not applied. **Optional backfill** if these numbers are wanted in prod.
2. **3 orphan Parent rows** (no StudentGuardian link) — expected residue of preserving all ~299 Parent rows while rebuilding students; a few preserved parents didn't re-link to any active student. Harmless (no FK references them). Optional cleanup via admin Wali Murid list.
3. **10 single-guardian students** carry one `WALI` — matches the sheet, which provides a single `Nama Wali` per child. By design. Add a second guardian only if the school supplies one.
4. **1 DOB in prod but blank in sheet** (*Ghania Raynamira Bashari*, 2024-09-26) — prod is richer; optionally sync back to the master sheet.
5. **Class-naming inconsistency (cosmetic):** two schemes coexist — campus-named (`KB Aster`, `TK A Metland`) and generic (`A1`–`B4`, `KB1/3/4`, `TD1/2`, `Bayi …`). Both appear identically in the sheet's `Kelas` column, so this is **not** duplication — consider standardizing for the pilot.
6. `whatsapp` empty for all parents — expected (source has no WA column); the number lives in `phone`.
7. **Rollback housekeeping:** prod schema `roster_backup_20260721` is still present — drop it after owner sign-off (per the #403 cycle doc).

## Method

- Prod read via `POST /v1/projects/vxwywmvpxetdgnxejjgk/database/query` (Supabase Management API, CLI token) — SELECT statements only.
- Excel parsed with openpyxl. Name matching: NFKD-normalized, whitespace-collapsed. Phone matching: digits-only, leading-zero tolerant.
- Cross-checks: set diff both directions, per-field compare, FK/tenant integrity, duplicate-identifier scan, sibling parent-sharing, source-vs-prod gap parity.
