# Historical Class-History Backfill — Feasibility & Plan (READ-ONLY investigation)

**Goal:** make each current student's **past-year class** visible (e.g. "in AY 2025/2026 was in B2"), not just the current 2026/2027 class.
**Status:** investigation only. **No prod writes.** Plan requires owner approval + source-provenance confirmation before any execution.

---

## 1. Schema — supports historical enrollments natively, NO migration

`StudentEnrollment` unique key is **`(studentId, classSectionId)`**, not `(studentId)`. A student may hold many enrollment rows as long as each points to a different section. Each year has its own `ClassSection` rows (`ClassSection` → `academicYearId`), so **one enrollment per student per year is fully supported today**.

**Isolation is safe.** The app resolves the *current* class with `enrollments.find(e => e.status === "ACTIVE")` ([app/admin/students/[id]/page.tsx:500](../../app/admin/students/[id]/page.tsx#L500)). `status` is free text with documented values `ACTIVE | GRADUATED | WITHDRAWN`. If historical rows are inserted as **`GRADUATED`**, they are never chosen as the active enrollment — the current class is untouched. Better still, the student detail page **already renders a full enrollment list** with academic-year + campus per row ([page.tsx:900](../../app/admin/students/[id]/page.tsx#L900)) — it currently shows one row; backfilled rows populate it as history with **zero app-code change**.

**Verdict:** no schema change, no app change. Pure additive data.

---

## 2. Source — real, but decays with student age (expected)

Source = `artifacts/Siswa-Talib.xlsx`, one sheet per academic year (same 18-column export shape as the current roster: `Nama Lengkap, Kelas, Program, Tahun Ajaran, NIS, …`). Overlap of each sheet with the **current 166 students** (normalized-name match, NIS-corroborated where present):

| Sheet | Rows | TA label | Matches current 166 | NIS-corroborated | Confidence |
|---|---|---|---|---|---|
| `20252026` | 135 | 2025/2026 | **129** | 124 / 129 | High |
| `20242025` | 121 | 2024/2025 | **61** | 43 / 61 | Medium |
| `20232024` | 119 | 2023/2024 | **17** | 4 / 17 | Low (name-trust) |
| `20222023` | 124 | 2022/2023 | **6** | 3 / 6 | Low (name-trust) |
| `20212020` | 0 | — | 0 | — | empty sheet |
| `20202021` and older (→2016) | 90–108 each | matches label | **0** | — | alumni — irrelevant |

**Why the decay is correct, not a data problem:** current students are 0–6 yo (Bayi / Day Care / KB / TK). A child in TK-B this year was in TK-A last year, KB the year before, and *not yet enrolled* earlier. The pre-2022 sheets are graduated alumni — none are current students. `20212020` is an empty/mislabeled tab.

**Other sources checked and rejected:**
- `roster_backup_20260721` (prod schema) — only the pre-wipe snapshot of the *current* graph (158 students, no prior years). No history.
- `Data siswa TA 2526-1.xlsx` / `Data Lengkap Siswa 2026-2027.xlsx` — single-year (2025-1 / 2026 intake), superseded, no multi-year history.
- Git history / prior import scripts (`scripts/import-roster/build-import-sql.ts`, PR #403) — current-year only.

**The per-year sheets are the only history source.** They must be confirmed by the owner as the school's *authoritative archived rosters* (not reconstructions) before use — see Risks.

---

## 3. Prior years & sections — all must be created

Only `2026/2027` exists in prod. Backfill covers **4 prior academic years**, none of which have `AcademicYear`, `ClassSection`, or `ClassTrack` rows yet.

Distinct classes (→ `ClassSection` rows to create) per year:

| Year | Sections | Class names |
|---|---|---|
| 2025/2026 | 15 | Bayi 6-12 Bulan, Bayi 1-2 Tahun, TD1, TD2, KB1, KB3, KB4, A1–A4, B1–B4 |
| 2024/2025 | 11 | TD1, KB1, KB3, A1–A4, B1–B4 |
| 2023/2024 | 12 | TD1, KB1, KB2, KB3, A1–A4, B1–B4 |
| 2022/2023 | 12 | TD1, KB1, KB2, KB3, A1–A4, B1–B4 |
| **Total** | **50** | |

`Program` is derivable — the sheets carry a Program column mapping cleanly: `Kelompok Bermain → program_kb`, `TK Islam Terpadu → program_tkit`, `Day Care*/D'Care → program_dcare`.

---

## 4. Proposed writes (on approval — NOT executed)

All additive. Deterministic IDs (hash of `year|name`) → idempotent, re-runnable.

| Table | Rows | Notes |
|---|---|---|
| `AcademicYear` | 4 | `2025/2026`…`2022/2023`, status **`INACTIVE`** (keep single ACTIVE year), dates Jul 1–Jun 30 per year |
| `ClassTrack` | ~15–50 | dedup by `(campusId, programId, name)`; NOT NULL campus/program |
| `ClassSection` | 50 | status `INACTIVE`; `ageGroup` = `B` if name starts "B" else `A` (matches current KB/TD/Bayi convention); `slotTemplate=FULL_DAY`, `capacity=20` |
| `StudentEnrollment` | **213** | status **`GRADUATED`**, `enrollDate` = year start, `notes='histbackfill-20260721'` (rollback marker), linked to the 130 matched current students only |
| `ClassSession` | **0** | deliberately skipped — no historical attendance; avoids ~12,900 useless slot rows |

**Coverage:** 130 / 166 current students gain ≥1 prior year (69 gain 1, 44 gain 2, 12 gain 3, 5 gain 4). 36 youngest gain none (never previously enrolled — correct).

---

## 5. Gaps & risks

1. **Campus is unknown for historical sections (blocker-level).** `ClassSection.campusId` is NOT NULL, but the per-year sheets have **no campus column** and use campus-agnostic names (A1–B4) — unlike the current year's campus-split names (`A Aster`/`A Metland`). Cannot derive campus. **Owner must decide:** (a) supply a per-class campus mapping, (b) assign all historical sections to one campus (e.g. Taman Aster, original site) flagged "campus-unverified", or (c) create a placeholder `Campus` "Historis (kampus tidak tercatat)". Blocks execution until chosen.
2. **Older-year matches are name-trust only.** 2023/24 (4/17) and 2022/23 (3/6) have little NIS corroboration (NIS often blank in old sheets). Low volume (23 rows total) but a homonym could mis-assign. Mitigation: current roster has 0 duplicate names and no within-sheet dup names, so collision risk is low — but flag these 23 rows for owner spot-check.
3. **Provenance unverified.** These sheets are *assumed* to be the school's real archived rosters. If any tab was reconstructed/estimated, backfill would encode guesses as fact. Owner must confirm authenticity per year before use.
4. **Rename alias map.** PR #403 used a 2-entry rename map (`azhima hafsah nafisa→…hafshah…`, `orca barraq→orca barraq ameer`). The same aliases must be applied to history matching or those 1–2 students silently lose recoverable history.
5. **36 students with no history** — verify none are mid-year transfers-in whose prior class lives in a source not checked here.
6. **AgeGroup is a lossy A/B enum** — KB/TD/Bayi historical sections store `A` as filler (same as current prod). Cosmetic; the class *name* carries the real level.

---

## 6. Rollback

Backfill is **purely additive** — no existing row updated or deleted — so rollback is a clean reverse-delete, no data-loss risk to current records.

1. Every enrollment tagged `notes='histbackfill-20260721'`; sections/tracks/years identifiable by the batch (and absence of ACTIVE status / sessions).
2. Rollback order (respecting `onDelete: Restrict`): delete tagged `StudentEnrollment` → `ClassSection` (historical) → `ClassTrack` (created-by-batch, unreferenced) → `AcademicYear` (the 4 new) → placeholder `Campus` if created.
3. Pre-write: snapshot the list of inserted IDs (or a `hist_backup_<date>` schema). Given additivity, the ID list alone is sufficient.
4. Idempotent script + `ON CONFLICT DO NOTHING` → safe re-run; rollback + re-run reproduces identical state.

---

## Recommended next step

Get owner to (a) confirm the per-year sheets are authoritative archived rosters, and (b) resolve the **campus decision** (§5.1). With those two answers, this becomes a committed idempotent script (mirroring PR #403's pattern) emitting one reviewable transactional `import.sql` — run via Supabase MCP against prod, behind the rollback marker.
