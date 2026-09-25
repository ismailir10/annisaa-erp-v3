# Historical Class-History Backfill — EXECUTED (prod)

**Status: DONE — committed to prod `vxwywmvpxetdgnxejjgk` on 2026-07-21.** Owner approved the full recommendation (split ambiguous classes per-campus; loosen age band to include Andhika). Applied atomically (`BEGIN … COMMIT`) after a passing rollback dry-run.

## FINAL LIVE COUNTS (independently re-queried post-commit)

| Object | Committed | Invariant checks |
|---|---:|---|
| `AcademicYear` (`hist_%`) | **4** | active years still **1** (2026/2027 only) |
| `ClassTrack` new (`hist_%`) | **6** | 15 existing tracks reused, untouched |
| `ClassSection` (`hist_%`) | **29** | all INACTIVE, no ClassSessions |
| `StudentEnrollment` (tagged) | **214** | all `GRADUATED`; **active enrollments = 166 (unchanged from baseline)**; 0 students with >1 active |
| Students with history | **131 / 166** | total students still 166 (none created/deleted) |

Per-year: 2022/23 = 6, 2023/24 = 17, 2024/25 = 61, 2025/26 = 130.

> **Amendment (owner-approved, 2026-07-21):** *Farzan Ahmad Athafariz* is now **INCLUDED** via an explicit `FORCE_INCLUDE` override in the generator (surgical — no band widening, no collateral). His 2 previously-held rows (TD1 Aster 2022/23, KB2 Aster 2023/24) were added as a `+2` idempotent follow-up (212 → 214), verified in a rollback dry-run first. His full history now reads TD1→KB2→A1→B1 (GRADUATED) + B1 2026/27 (ACTIVE) — the repeated B1 explains the age-over flag (he repeated TK B). No spot-check exclusions remain.

**Split applied (DECISION 2):** A2 → `A2 Aster`(8)/`A2 Metland`(1); KB2 → `KB2 Aster`/`KB2 Metland`; TD1 → `TD1 Aster`/`TD1 Metland`. Each historical class named campus-suffixed so per-year names stay unique; section campus = each student's current campus.

**Band loosened (DECISION 1):** KB upper 5.0 → 5.5 — **Andhika Rizqi Lesmana now included** (verified live: KB1→A4→B4 GRADUATED + B4 2026/27 ACTIVE).

**Farzan Ahmad Athafariz — now INCLUDED (owner-approved follow-up).** The split initially surfaced him (DOB 2017-12-10) as age-over in KB2 2023/24 (5.6y) + TD1 2022/23 (4.6y) and held out those 2 rows. Owner approved inclusion → added via `FORCE_INCLUDE` (+2, 212→214). No remaining exclusions.

## Rollback command (documented, purely additive — reverse-delete)
```sql
BEGIN;
DELETE FROM "StudentEnrollment" WHERE notes LIKE 'histbackfill-20260721%';
DELETE FROM "ClassSection"  WHERE id LIKE 'hist_%';
DELETE FROM "ClassTrack"    WHERE id LIKE 'hist_%';   -- 6 new tracks only; 15 reused untouched
DELETE FROM "AcademicYear"  WHERE id LIKE 'hist_%';
COMMIT;
```

---

## Original dry-run preview (pre-approval, hold-out version) — retained for history

**Status:** preview only. SQL executed inside a `BEGIN … ROLLBACK` transaction against prod (`vxwywmvpxetdgnxejjgk`) — **nothing persisted** (verified: 0 `hist_%` rows remain). Awaiting owner confirm before real run.

- **Generator:** `scripts/import-roster/build-history-backfill.py` (idempotent, deterministic `hist_*` ids, `ON CONFLICT DO NOTHING`, purely additive).
- **Emitted SQL:** `scripts/import-roster/history-import.sql` (237 statements).
- **Decisions applied:** DECISION 1 (trust 2025/26 + 2024/25; spot-check older) + DECISION 2 (inherit current campus; hold out ambiguous sections).

## DB-validated would-be counts

| Object | Count | Notes |
|---|---:|---|
| `AcademicYear` inserted | **3** | 2025/2026, 2024/2025, 2023/2024 — all `INACTIVE`. **2022/2023 → 0** (its only matched section was ambiguous, see below) |
| `ClassTrack` new | **2** | `KB1`@Metland, `KB3`@Aster (cross-campus vs current) |
| `ClassTrack` reused | 15 | existing tracks reused (year-agnostic) — no dup-key violation |
| `ClassSection` inserted | **23** | all `INACTIVE`, no `ClassSession` rows generated |
| `StudentEnrollment` inserted | **190** | all `status='GRADUATED'`, `notes='histbackfill-20260721; campus-inferred'` |
| Students gaining history | **131 / 166** | |

**Integrity assertions (all passed in-transaction):** `active_ay_after = 1` (only 2026/2027 stays ACTIVE — no dual-active-year), `sections_bad_track_fk = 0`, `enroll_dup_active = 0` (no student ends with >1 ACTIVE enrollment — current class untouched), enrollment status set = `{GRADUATED}` only.

> The **first** dry-run caught a real defect — a unique-key violation on `ClassTrack(tenant,campus,program,name)` because tracks are year-agnostic and already exist. Fixed by reusing existing track ids; the preview above is the corrected run. (This is exactly why we dry-ran.)

## Per-year coverage (matched current students)

| Year | Enrollments written | Held out (ambiguous campus) | Held out (spot-check) |
|---|---:|---:|---:|
| 2025/2026 | 130 | 0 | 0 |
| 2024/2025 | 52 | 9 (A2) | 0 |
| 2023/2024 | 8 | 8 (KB2) | 1 |
| 2022/2023 | 0 | 6 (TD1) | 0 |

Per-student history depth: **78** students get 1 prior year, **47** get 2, **6** get 3. 35 current students get none (youngest — never previously enrolled).

## Held-out for manual review (NOT written)

### Ambiguous-campus sections (DECISION 2 edge case) — 23 enrollments
A single historical class whose matched students are **now split across both campuses** — campus cannot be inferred, so held out rather than guessed:

| Year | Class | Students | Now split across |
|---|---|---:|---|
| 2024/2025 | A2 | 9 | Taman Aster + Metland Cibitung |
| 2023/2024 | KB2 | 8 | Taman Aster + Metland Cibitung |
| 2022/2023 | TD1 | 6 | Taman Aster + Metland Cibitung |

*Why this happens:* the current roster binds each generic class name to one campus (A1/A2→Aster, A3/A4→Metland, …). Where a historical cohort has since dispersed across campuses, campus-inheritance is unsafe. **Resolution needs owner input:** either provide the real campus for these 3 classes, or accept splitting each into per-campus sections (e.g. A2-Aster + A2-Metland by each student's current campus).

### Spot-check exclusion (DECISION 1) — 1 enrollment
| Year | Student | Class | DOB | Reason |
|---|---|---|---|---|
| 2023/2024 | Andhika Rizqi Lesmana | KB1 | 2018-05-01 | age 5.2y at AY start vs KB band ≤5.0 — **borderline** |

This is a soft flag (5.2 vs a 5.0 cap) — a late-starting 5yo in KB is plausible. **Owner call:** include or drop. No other row failed age/program plausibility.

## Rollback (for the real run)

Purely additive — no existing row modified. Reverse-delete, guarded by tags:
```sql
BEGIN;
DELETE FROM "StudentEnrollment" WHERE notes LIKE 'histbackfill-20260721%';
DELETE FROM "ClassSection"  WHERE id LIKE 'hist_%';
DELETE FROM "ClassTrack"    WHERE id LIKE 'hist_%';   -- the 2 new tracks only; reused tracks untouched
DELETE FROM "AcademicYear"  WHERE id LIKE 'hist_%';
COMMIT;
```
Reused ClassTracks (15) and all current-year rows are never touched. Re-running the generator + import reproduces identical state (deterministic ids + `ON CONFLICT DO NOTHING`).

## Awaiting owner confirm

1. Proceed to write the **190 enrollments / 23 sections / 3 years** as previewed?
2. The 3 **ambiguous-campus classes** (A2 25/26-adjacent, KB2, TD1) — supply campus, split per-campus, or leave out?
3. **Andhika / KB1 2023/24** — include (loosen age band) or drop?
