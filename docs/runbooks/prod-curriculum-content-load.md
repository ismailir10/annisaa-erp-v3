# Runbook — Production Curriculum Content Load

**Purpose:** take production from "penilaian is code-complete but unusable" to "walas and sentra teachers can assess from day one."

**Applies to:** prod Supabase `vxwywmvpxetdgnxejjgk`, tenant `tenant_annisaa`. Staging (`udbivhchbizpxoryejgz`) uses `scripts/seed-demo-curriculum.ts` instead — see [Staging](#staging-demo-content) at the bottom.

**Owner:** CTO executes; Kepala Divisi Pendidikan supplies the curriculum artifacts.

> Nothing in this runbook can be executed until every item in [Inputs](#inputs-required) is in hand. The steps are ordered by dependency — a later step against missing earlier data fails loudly rather than half-writing.

---

## Why each step exists

The penilaian flow degrades **silently** when content is missing. None of these produce a stack trace:

| Missing | What the walas sees |
|---|---|
| `Week` bracket covering today | "Belum ada Pekan aktif" |
| `IndicatorThemeLink` for the pekan's theme | indicator picker renders empty |
| `TeachingAssignment` with `role = HOMEROOM` | no "Penilaian Pekanan" card at all |
| `LearningObjective` for the class's `ageGroup` | indicator picker renders empty |
| `Holiday` rows for the term | raport `totalSchoolDays` silently inflated |

`scripts/verify-curriculum-readiness.ts` asserts all five. **The load is not done until it exits zero.**

---

## Inputs required

| # | Artifact | Format | Blocks step |
|---|---|---|---|
| 1 | PROMES TK A + TK B, TA 2026/2027 SMT 1 (SMT 2 when authored) | `.xlsx`, layout below | 4 |
| 2 | Semester calendar, one per semester | `.csv`, header below | 3 |
| 3 | Staff roster (~30 rows) | csv/xlsx: name · email (Google account) · position · campus · nickname | 1 |
| 4 | Walas mapping — one employee per active class; sentra restrictions if any | any legible list | 2 |
| 5 | Holidays Jan–Jun 2027 (SKB 3 Menteri 2027) | `date,name,type` | 5 |

### 1 — PROMES workbook layout

Read off the **first worksheet**. Element blocks may appear in any order.

| Row kind | Layout |
|---|---|
| Element header | single cell in **col A** matching `NAM` / `NILAI AGAMA` / `BUDI PEKERTI` · `JATI DIRI` · `STEAM` / `LITERASI` · `MOTORIK` · `SENI`. Extra words fine ("NAM PROGRAM SEMESTER 1"). |
| Column header | **A**=`NO`, **B** contains `CAPAIAN`, **C** contains `TUJUAN`, **D** contains `INDIKATOR`, **E onward** = one theme name per column |
| TP row | **A**=positive integer, **B**=CAPAIAN text, **C**=TUJUAN text — both non-empty |
| IKTP row | **A** empty, **D**=indicator text, **E onward**=`X` / `TRUE` / `V` / `YA` per theme it belongs to |

Tolerated: capitalisation drift, punctuation noise, whitespace, merged cells. Filename should contain `TK A` / `TK B`.

> **Confirm the E+ theme columns exist before starting.** They are what populate `IndicatorThemeLink`, and without links the walas picker stays empty no matter how clean the import is. If the school's file has no theme columns, the fallback is the manual matrix at `/admin/semesters/[id]/objectives` — budget hours, not minutes.

### 2 — Semester calendar CSV

Header exactly, in order:

```
theme_order,theme_name,subtheme_order,subtheme_name,week_number,start_date,end_date
```

One row per pekan. Dates `YYYY-MM-DD` Jakarta days, Monday start / Friday end. `week_number` contiguous `1..N` across the **whole semester**, not restarting per theme. Themes and sub-themes repeat down the rows; the importer groups them.

**`theme_name` must match the PROMES theme column headers** after whitespace collapse and casefold — that string is the join key between the two files.

---

## Procedure

Run every command from the repo root with prod credentials in the environment. Steps 1–2 are UI work; 3–5 are scripted.

### Step 1 — Staff roster

Admin UI: **`/admin/(hr)`** → add each employee from input 3 (name, email = their Google account, position, campus).

- ~30 rows; no importer by design — each row carries human judgement (campus, position) and an importer costs more to build and review than it saves.
- The email must be the Google account they will sign in with, or the portal will not resolve them to an employee.

*Rollback:* soft-delete the employees added.

### Step 2 — Walas assignment

Admin UI: **`/admin/classes/[id]`** → teaching assignments → assign exactly **one** `HOMEROOM` per active class, per input 4. Assistants optional.

- This is what gates the "Penilaian Pekanan" card ([lib/curriculum/homeroom.ts](../../lib/curriculum/homeroom.ts)).
- Sentra entry needs no assignment — any TEACHER can enter any sentra (rotation is deferred).

*Rollback:* remove the assignments added.

### Step 3 — Semester calendar

```bash
npx tsx scripts/import-curriculum-calendar.ts --tenant <tenantId> --semester <semesterId> --file <calendar.csv>
```

Dry-run first — it prints the theme → sub-theme → pekan tree and exits 0 without writing. It refuses to write on any of: header mismatch, bad date, non-Monday start, non-Friday end, duplicate or non-contiguous week number, overlapping brackets, weeks outside the semester window.

Re-run with `--commit` once the plan looks right. Idempotent (Theme matched on `(semesterId, name)`, SubTheme on `(themeId, name)`, Week on `(subThemeId, number)`), so a partial run is safe to repeat.

*Rollback:* delete the created Weeks, then SubThemes, then Themes for that semester (FK order). No other table references them yet at this point.

### Step 4 — PROMES import

Admin UI: **`/admin/semesters/[id]/import`**, once per age group.

1. Pick the semester + Kelompok Usia, upload the workbook → **preview**.
2. Read the preview panels:
   - *"N tema pada berkas belum ada di semester ini"* → those theme names did not match step 3's calendar. **Fix before committing** — the import will still succeed but those IKTPs will never appear in the walas picker. Either correct the spelling in the workbook or add the theme.
   - *"N kaitan IKTP×Tema siap disimpan"* → every theme name matched. Good to commit.
   - Conflict panels (active / inactive) behave as before — see the 2026-05-20 cycle.
3. **Konfirmasi & simpan.** The toast reports objectives, indicators and theme links written.

Order matters: the calendar (step 3) must exist first, or every theme lands in the unmatched bucket.

*Rollback:* the import writes inside one transaction, so a failure leaves nothing behind. To undo a successful import, soft-delete the objectives via `/admin/semesters/[id]/objectives` (their indicators and links cascade).

### Step 5 — Holidays

Populate `prisma/data/holidays.ts` → `holidays2027` from input 5, then apply to prod with an idempotent insert keyed on `(tenantId, date)` — matching the 2026-07-27 journal-seed precedent (SQL via Supabase MCP, deterministic ids, `ON CONFLICT DO NOTHING`).

*Rollback:* delete the rows for the inserted dates.

### Step 6 — Readiness gate

```bash
npx tsx scripts/verify-curriculum-readiness.ts --tenant <tenantId>
```

Read-only. Exits 0 only when all six checks pass. **Do not tell teachers the module is live until this is green.** A `FAIL` names the offending rows (classes without a walas, uncovered date ranges, ageGroup × element pairs with no linked indicator).

### Step 7 — Smoke walk

On the prod URL, signed in as a real walas:

1. `/teacher/assessments` → "Penilaian Pekanan" card is present (absent ⇒ step 2 incomplete).
2. Open it → correct class, current pekan with theme + sub-theme, full student roster, **indicator list non-empty** (empty ⇒ step 4's theme links).
3. Tap a level for one student → reload → the value persisted.
4. `/teacher/assessments/center/<sentra>` → pick today, roster and IKTP list both populate.
5. `/admin/penilaian` → the class shows `1/N` assessed for the current pekan.
6. Void the test entry afterwards, or leave it and tell the walas.

---

## Staging demo content

Staging has no real PROMES. Seed representative content instead:

```bash
npx tsx --env-file=.env scripts/seed-demo-curriculum.ts --commit
```

Dry-run by default; **hard-refuses to run against the prod database ref**. Everything it writes is suffixed `(Demo)`. Idempotent.

It creates a Semester + 8 Mon–Fri pekan brackets around *today* so `getCurrentWeek` resolves, 2 themes × 2 sub-themes, and the 5 curriculum elements' objectives + indicators + theme links for both age groups.

**Known staging artifact:** the demo tenant's ACTIVE academic year is 2025/2026 (ends 2026-06-19) while real time has moved past it, and 2026/2027 is `PLANNING` with no classes. The seeder therefore places its semester window around today, outside its parent year's window. `verify-curriculum-readiness.ts` reports this honestly rather than hiding it. Do not copy this shape to prod — prod's year, semester and pekan windows should agree.
