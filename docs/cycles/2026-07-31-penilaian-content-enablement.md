# Penilaian Content Enablement — Unblock the Built Flow on Prod

## Context

A 2026-07-31 audit of the penilaian/raport initiative found **Pack 1 code-complete and prod-unusable**. Cycles C1–C8 shipped (curriculum spine, PROMES import, `AssessmentEntry` walas-pekanan + sentra-harian, parent perkembangan, `/admin/penilaian` monitor, admin raport MVP + PDF, parent raport read). All 16 penilaian/raport test files pass (151 tests). Nothing is broken.

What is missing is **content**. Prod (`vxwywmvpxetdgnxejjgk`, tenant_annisaa) has zero rows in every curriculum table — `Theme`, `SubTheme`, `Week`, `LearningObjective`, `AchievementIndicator`, `IndicatorThemeLink`. The July 1 2026 hard cutover in the master design ([2026-05-12-curriculum-penilaian-raport-design.md](../archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md) §6.4) did not happen: its own risk row — *"School's TA 26/27 SMT 1 PROMES not authored by June 10 → blocks cutover"* — fired, and no fallback was executed.

Consequences on prod today:

| Surface | Behaviour with empty curriculum |
|---|---|
| `/teacher/assessments/weekly` | `getCurrentWeek` → null → 404 "Belum ada Pekan aktif" |
| Walas indicator picker | `themeLinks: { some: { themeId } }` matches nothing → zero indicators even once Weeks exist |
| `/teacher/assessments/center/[center]` | no IKTP to pick |
| `/admin/penilaian` | all classes 0/N, all sentra 0 entri |
| `/admin/raport` auto-draft | no `AssessmentEntry` → every section blank; admin free-types the whole raport by hand |

Two structural gaps compound the content gap and are cheap to close now:

1. **PROMES import parses IKTP×Theme markers and throws them away.** [import-promes/route.ts:192](../../app/api/admin/curriculum/import-promes/route.ts:192) builds `themeLinkPlan` from the xlsx's E+ marker columns, then records only `themeLinksDeferred: themeLinkPlan.length` in the audit payload — *"Theme links collected forward-compat for C3 — not written in C2."* C3 never wired it. The walas weekly picker ([weekly-assessment-loader.ts:119](../../lib/curriculum/weekly-assessment-loader.ts:119)) filters indicators **exclusively** by theme link, so without those rows Penilaian Pekanan shows an empty indicator list no matter how much PROMES is imported. The only path today is ticking the matrix by hand in [objectives/client.tsx:598](../../app/admin/semesters/%5Bid%5D/objectives/client.tsx:598) — 5 elements × N TP × M IKTP × T themes of manual clicking, per age group.
2. **No calendar loader.** `Theme`/`SubTheme`/`Week` are hand-entered through the 841-line themes CRUD. A full semester is ~8 themes × ~4 sub-themes × ~17 weeks; two semesters doubles it. Hand entry is the single largest clicking cost of the load and the easiest to get wrong (week bracket gaps silently produce "Belum ada Pekan aktif" days).

Roster is the third gap: prod holds **2 Employee rows** and 32 placeholder `TeachingAssignment`s across 16 active AY 2026/2027 classes ([project_prod_journal_seeded](../../CLAUDE.md) memory, 2026-07-27). Walas gating keys off `TeachingAssignment.role = "HOMEROOM"` ([homeroom.ts:37](../../lib/curriculum/homeroom.ts:37)), so no real walas can reach Penilaian Pekanan until the real staff roster lands.

### Owner decisions (2026-07-31)

Confirmed across the audit review: **(Q1)** load prod content first; **(Q2)** build kisi-kisi narrative templates as designed; **(Q3)** walas drafts → kepala reviews → publishes, with a real `homeroomTeacherId` FK; **(Q4)** delete the legacy `StudentAssessment`/`AssessmentTemplate` stack now; **(Q5)** defer docx and parent e-sign.

### Sequenced roadmap (this cycle is #1 of 4)

Each later cycle gets its own doc at `/spec` time. Scope fixed here so the sequence is reviewable as a whole.

| # | Slug | Scope | Depends on |
|---|---|---|---|
| **1** | `penilaian-content-enablement` *(this doc)* | Theme-link auto-write on import · curriculum calendar importer · readiness verifier · 2027 holidays · prod load runbook | — |
| 2 | `retire-legacy-assessment` | Delete `AssessmentTemplate`/`StudentAssessment`/`StudentAssessmentScore` models + `app/api/assessments/**` + orphan `app/admin/assessments*`, `app/admin/assessment-templates` pages + the 5 masking `next.config.ts` redirects + seed's "(Demo)" template. Executes the 2026-05-20 `ABANDON` decision. | none — runs parallel to #1 |
| 3 | `raport-kisi-kisi-templates` | `ReportNarrativeTemplate` + `ReportClosingTemplate` (per term × ageGroup × section × level, 3 buckets) · admin/walas authoring UI · raport editor switches from free-text to bucket-pick + edit | #1 (needs real penilaian data to author against) |
| 4 | `raport-walas-workflow` | `ClassSection.homeroomTeacherId` FK (or `TeachingAssignment`-derived resolver) · `REVIEWED` status + kepala publish gate · `/teacher/raport` walas authoring · `reportCard.review` permission | #3 |

**Deferred indefinitely per Q5:** docx output, parent comment/e-sign, structured hafalan, sentra rotation scheduling.

### Split: code vs content

This cycle ships **tooling + runbook only**. The prod load itself is a runbook execution that needs source material only the school holds, and is recorded in Ship Notes when it runs. Every task below is startable today with zero owner input — the load is gated on the input manifest in the Spec.

---

## Spec

### Acceptance criteria

- [ ] **AC1.** PROMES import commit writes `IndicatorThemeLink` rows from the parsed `themeLinkPlan`. Theme names match against `Theme` rows in the target `Semester` case-insensitively with whitespace collapsed; unmatched names are reported, never silently dropped.
- [ ] **AC2.** PROMES **preview** surfaces theme-link resolution before commit: matched count, and an explicit list of unmatched theme names with the Indonesian remedy copy ("Tema berikut belum ada di semester ini — buat tema dulu atau perbaiki nama di berkas"). Preview stays non-blocking on unmatched names (import proceeds, links for matched themes only).
- [ ] **AC3.** Import is re-runnable: re-importing the same file does not duplicate links (`(indicatorId, themeId)` upsert semantics). Audit `after` payload replaces `themeLinksDeferred` with `themeLinksCreated` + `themeLinksSkippedUnmatched`.
- [ ] **AC4.** `scripts/import-curriculum-calendar.ts` loads Theme/SubTheme/Week for one Semester from a CSV (format frozen in Assumption 3). Dry-run by default; `--commit` writes. Validates before writing: no week-bracket gaps or overlaps inside the semester window, Monday start / Friday end, week numbers contiguous from 1, referenced semester ACTIVE and tenant-scoped. Exits non-zero with a per-row error list on any violation.
- [ ] **AC5.** `scripts/verify-curriculum-readiness.ts` prints a go/no-go report for a given tenant + academic year, checking: ≥1 ACTIVE Theme per semester · Week coverage of the semester window with no gaps · every ACTIVE `ClassSection` has exactly one `HOMEROOM` `TeachingAssignment` · every (ageGroup × CurriculumElement) has ≥1 theme-linked ACTIVE indicator · `Holiday` rows exist across the academic-year window. Exits non-zero if any check fails. Read-only.
- [ ] **AC6.** `prisma/data/holidays.ts` carries Jan–Jun 2027 dates (second half of AY 2026/2027). The file's calendar-year assumption is documented; loader stays date-range driven.
- [ ] **AC7.** `docs/runbooks/prod-curriculum-content-load.md` gives the exact ordered prod procedure: staff roster → walas HOMEROOM assignment → semester calendar CSV import → PROMES xlsx import per age group → readiness verify → smoke walk. Includes rollback per step and the input manifest below.
- [ ] **AC8.** Between-task gate green every task: `npm run build && npx vitest run`. End-of-cycle: + `npx playwright test` (or the recorded CI deferral).
- [ ] **AC9.** No frontend diff beyond the PROMES preview panel (AC2); that diff cross-checked against `design-system.html` §alert and recorded in Verification.

### Owner input manifest — required to execute the load

Nothing here blocks T1–T6. All of it blocks the runbook execution. **I cannot author or infer curriculum content** — these are the school's pedagogical artifacts.

**1. PROMES workbooks — 2 files minimum, 4 preferred**
`PROMES TK A SMT 1.xlsx`, `PROMES TK B SMT 1.xlsx` for **TA 2026/2027** (plus SMT 2 when authored). Format the existing parser expects ([promes-parser.ts](../../lib/curriculum/promes-parser.ts)), read off the **first worksheet**:

| Row kind | Layout |
|---|---|
| Element header | single cell in **col A** containing one of: `NAM` / `NILAI AGAMA` / `BUDI PEKERTI` · `JATI DIRI` · `STEAM` / `LITERASI` · `MOTORIK` · `SENI`. Extra words fine ("NAM PROGRAM SEMESTER 1"). |
| Column header | **A**=`NO`, **B** contains `CAPAIAN`, **C** contains `TUJUAN`, **D** contains `INDIKATOR`, **E onward** = one theme name per column |
| TP row | **A**=positive integer (TP number), **B**=CAPAIAN text, **C**=TUJUAN PEMBELAJARAN text. Both B and C must be non-empty. |
| IKTP row | **A** empty, **D**=indicator text, **E onward**=`X` / `TRUE` / `V` / `YA` marker in each theme column that indicator belongs to |

Tolerated: capitalisation drift, punctuation noise, stray whitespace, merged cells, element blocks in any order. Filename should contain `TK A` or `TK B` (age group is otherwise pickable in the UI). **The E+ theme-marker columns are what make Penilaian Pekanan work** — if the school's file has no theme columns, say so now and we route around it.

**2. Semester calendar — 1 CSV per semester**
Header row exactly: `theme_order,theme_name,subtheme_order,subtheme_name,week_number,start_date,end_date`. One row per week. Dates `YYYY-MM-DD`, Jakarta calendar days, Monday start / Friday end. Week numbers contiguous 1..N across the whole semester (not restarting per theme). Themes/sub-themes repeat down the rows; the importer groups them. Theme names **must match the PROMES column headers character-for-character after whitespace collapse** — that's the join key.

**3. Staff roster — CSV or xlsx**
Columns: full name · email (their Google account — drives portal login) · position/title · campus. ~30 rows expected. If a nickname is used in class, include it.

**4. Walas + sentra mapping**
Which employee is walas (HOMEROOM) of which of the 16 active AY 2026/2027 classes — exactly one per class. Plus sentra assignments if any teacher is restricted to specific centers (default today: every teacher can enter any sentra).

**5. Holiday calendar Jan–Jun 2027**
SKB 3 Menteri 2027 dates. Columns: `date,name,type` where type is `NATIONAL` or `ISLAMIC` (`Holiday.type` is a free String, not an enum — school-specific closures like libur semester or HUT sekolah can go in as `SCHOOL` with no schema change). `Holiday` is uniquely keyed `(tenantId, date)`, so one row per calendar day.

**Not needed this cycle:** sample raport docx (ZHIAN/RAYYAN) — that's cycle #3/#4. Guardian account provisioning — separate track, see Risks.

### Non-goals

- Executing the prod load. This cycle ships the tooling; the load is a runbook run once the manifest arrives.
- Any new admin UI for calendar entry — a script is cheaper than a CRUD surface for a twice-yearly job, and the existing themes CRUD stays for corrections.
- Kisi-kisi templates, walas raport workflow, legacy retirement (cycles #2–#4).
- Guardian user provisioning, DOKU/billing, roster re-import of students.
- Changing the PROMES parser's accepted layout, the 3-level skala, or any `AssessmentEntry` write path.
- Backfilling historical penilaian for TA 2025/2026 — fresh-start cutover stands (2026-05-20 `ABANDON` decision).

### Assumptions

1. **Theme is semester-scoped, not age-group-scoped** (`Theme.semesterId`, no `ageGroup` column). One calendar serves TK A and TK B; the age split lives on `LearningObjective.ageGroup` and flows to indicators. So one calendar CSV per semester, two PROMES files per semester.
2. **Theme-name matching is normalise-then-exact**, not fuzzy: trim → collapse internal whitespace → case-insensitive compare. Fuzzy matching risks linking an indicator to the wrong theme, which corrupts the walas picker silently. Unmatched names are surfaced for the admin to fix, never guessed.
3. **Calendar CSV format is frozen at AC4's header.** Chosen over xlsx because the school authors this as a table, the file is small, and CSV keeps the script dependency-free. If the school only has it inside the PROMES workbook, T2 gains an xlsx reader — flag on arrival.
4. **Staff roster goes in through the existing admin UI**, not a script. ~30 rows against `/admin/(hr)` + per-class teaching-assignment dialogs is under an hour of clicking, and every row needs a human decision (campus, position, which class). A one-shot importer would cost more to build and review than it saves. The **verifier** (AC5) is what makes this safe — it fails loudly on any class missing a walas.
5. **Holidays load via SQL on prod**, matching the 2026-07-27 journal-seed precedent. `prisma/data/holidays.ts` is the source of truth in-repo; prod gets an idempotent insert with deterministic ids.
6. **The readiness verifier is the go/no-go gate.** The runbook does not declare the load done until AC5's script exits zero.
7. **`IndicatorThemeLink` has no `tenantId`** — it is a bare `(indicatorId, themeId)` join table, deliberately excluded from the RLS block in `20260512100000_add_curriculum_models` (`verify-rls-coverage.sh` reports 38/38 because it only checks tenant-scoped models). Tenant isolation is transitive: indicator → objective → semester → tenant, and theme → semester → tenant. T1 therefore verifies both sides against the import's already-tenant-verified `semesterId` rather than trusting ids. Adding a `tenantId` column is out of scope — call it out if a later cycle touches this table directly.
8. **Commit hygiene (commit-msg hook):** T1/T2 are `feat:` touching `app/**`/`lib/**` → stage `README.md` in the same commit. T3–T5 are `chore:`/`docs:` under `scripts/`/`prisma/data`/`docs/` → covered by the broad doc-sync rule with the cycle doc staged.

---

## Tasks

- [ ] **T1 — Write `IndicatorThemeLink` on PROMES import.** (`feat:` — stage README) In [import-promes/route.ts](../../app/api/admin/curriculum/import-promes/route.ts): resolve `themeLinkPlan` theme names against `Theme` rows for the target `semesterId` (normalised match per Assumption 2); inside the existing `$transaction`, `createMany` links with `skipDuplicates`; add `themeLinksCreated` + `themeLinksSkippedUnmatched` to the commit payload and the audit `after` (replacing `themeLinksDeferred`). Extend `PromesCommitPayload` in `lib/validations/curriculum.ts`. **No migration:** `IndicatorThemeLink` already carries `@@id([indicatorId, themeId])`, so `skipDuplicates` gives idempotence for free. **Security (Assumption 7):** the theme query MUST be filtered on `semesterId` + `tenantId`, and indicators MUST be taken from the rows this import just wrote — never from a client-supplied id — because the join table has no `tenantId` of its own. *Accept:* vitest covers matched-write, unmatched-skip, re-import idempotence, theme from another semester/tenant rejected; build+vitest green. (independent)
- [ ] **T2 — Surface theme-link resolution in the import preview.** (`feat:` — stage README) Preview branch returns `themeLinks: { matched: number, unmatched: string[] }`. `app/admin/semesters/[id]/import/client.tsx` renders a non-blocking info panel when `unmatched.length > 0`, listing the names with the remedy copy from AC2; matched count shown on the success toast. Cross-check `design-system.html` §alert (reuse the existing inactive-conflict panel pattern, non-destructive variant). *Accept:* preview payload typed + tested; panel renders; build+vitest green. (depends T1)
- [ ] **T3 — Curriculum calendar importer.** (`chore:`) `scripts/import-curriculum-calendar.ts` — args `--tenant <id> --semester <id> --file <csv> [--commit]`. Parse → validate (AC4 rules) → print a diff table (themes/subthemes/weeks to create, existing untouched) → write in one transaction under `--commit`. Idempotent: re-running matches on `(semesterId, name)` for Theme, `(themeId, name)` for SubTheme, `(subThemeId, number)` for Week. Unit-test the pure validate+group function against a fixture CSV incl. gap, overlap, non-Monday-start, and duplicate-week-number cases. *Accept:* vitest covers the validator; dry-run against a fixture prints the expected plan; build+vitest green. (independent)
- [ ] **T4 — Curriculum readiness verifier.** (`chore:`) `scripts/verify-curriculum-readiness.ts` — args `--tenant <id> --academic-year <id>`. Runs the 5 AC5 checks, prints a per-check PASS/FAIL table with the offending rows named (class names missing a walas, date gaps as ranges, elements with zero linked indicators per age group), exits non-zero on any FAIL. Read-only; no writes, no mutations. Unit-test the pure check functions with fixture data. *Accept:* vitest covers each check's pass + fail branch; script runs clean against the local/staging DB; build+vitest green. (independent)
- [ ] **T5 — Holidays Jan–Jun 2027.** (`chore:`) Extend `prisma/data/holidays.ts` with the AC6 dates (populated from the owner manifest item 5; until it arrives, land the file structure + a documented `TODO(owner-input)` marker and the SQL generator). Document the calendar-year-vs-academic-year mismatch in a file header comment. *Accept:* data file typechecks; consuming loader unaffected; build+vitest green. (independent)
- [ ] **T6 — Runbook + docs sync.** (`docs:`) `docs/runbooks/prod-curriculum-content-load.md` per AC7 — ordered procedure, per-step rollback, the input manifest, and the readiness-verifier gate. Update `CLAUDE.md` File Structure (`scripts/` list gains the 2 new scripts; `docs/runbooks/` reference). Record the design-system cross-check in Verification. Run `/audit-docs`. *Accept:* `/audit-docs` zero `fail`; doc-sync pre-commit passes. (depends T1–T5)

---

## Implementation

- **Commit shape:** T1–T5 landed in one `feat(curriculum)` commit rather than one-per-task (a `git add -A` swept the in-progress script files in with the route change). Message describes T1/T2; T3–T5 are additive new files with no behavioural overlap, so the history is still bisectable. T6 + the staging seeder follow as separate commits.
- **T1 — IKTP×Tema links on import.** New `lib/curriculum/theme-match.ts` (`normaliseThemeName` trim→collapse→casefold, `indexThemes`, `resolveThemeNames`; punctuation deliberately preserved, unmatched de-duped on the normalised key so one missing tema spelled two ways reports once). `app/api/admin/curriculum/import-promes/route.ts`: resolves `themeLinkPlan` against `theme.findMany({ tenantId, semesterId, status: ACTIVE })` before the preview is built (so both branches share the numbers), and inside the existing `$transaction` re-reads the just-written indicators keyed `(objectiveId, order)` — `createMany` returns no ids in Postgres — then `indicatorThemeLink.createMany({ skipDuplicates })`. `themeLinksDeferred` in the audit `after` replaced by `themeLinksCreated` + `themeLinksSkippedUnmatched`. `lib/validations/curriculum.ts` gains `PromesPreviewPayload.themeLinks` + `PromesCommitPayload.applied.{themeLinks,themeLinksUnmatched}`. No migration — `IndicatorThemeLink` already has `@@id([indicatorId, themeId])`.
- **T2 — Preview surface.** `app/admin/semesters/[id]/import/client.tsx`: two `role="status"` Alerts — unmatched-tema (lists up to 10 names + remedy copy + matched count) and all-matched confirmation. Commit toast reports `N kaitan tema`; a second `toast.warning` fires when names went unmatched (warn, don't block — the objectives did save).
- **T3 — Calendar importer.** `lib/curriculum/calendar-csv.ts` (pure: RFC-4180-ish `splitCsvLine` handling quoted commas + escaped quotes, `parseCalendarCsv` structural validation with per-line numbers, `buildCalendarPlan` cross-row validation — Mon/Fri brackets, `start ≤ end`, unique + contiguous week numbers from 1, no overlapping brackets, inside the semester window, one order per theme/sub-theme name) + `scripts/import-curriculum-calendar.ts` (dry-run default, `--commit` writes in one transaction, idempotent on natural keys).
- **T4 — Readiness verifier.** `lib/curriculum/readiness.ts` (pure checks: themes-per-semester, week coverage ignoring weekends, exactly-one-HOMEROOM-per-class, all 10 ageGroup×element pairs carry a theme-linked indicator, holidays present in **both** calendar years of the academic window) + `scripts/verify-curriculum-readiness.ts` (read-only, per-check PASS/FAIL table naming offending rows, non-zero exit on any FAIL). `AcademicYear.startDate/endDate` are `String` YYYY-MM-DD, unlike `Semester`/`Week` which are UTC-midnight `DateTime` — the script handles both.
- **T5 — Holidays.** `prisma/data/holidays.ts` documents the calendar-year vs academic-year mismatch, adds an empty `holidays2027` with a `TODO(owner-input)` marker (SKB 3 Menteri 2027 not published/supplied — deliberately not estimated, since a wrong date mis-counts school days on every raport) and an `allHolidays` union for academic-window consumers.
- **T6 — Runbook + docs.** `docs/runbooks/prod-curriculum-content-load.md` (why-each-step table, input manifest incl. the exact PROMES + CSV layouts, 7 ordered steps with per-step rollback, readiness gate, smoke walk, staging section). `README.md` curriculum module row notes the link-writing behaviour. `CLAUDE.md` File Structure `scripts/` list gains the three new scripts.
- **Staging demo content (out-of-spec, added on owner request).** `scripts/seed-demo-curriculum.ts` — dry-run default, **hard-refuses the prod DB ref**, everything suffixed `(Demo)`, idempotent on natural keys. Writes a Semester + 8 Mon–Fri pekan brackets around *today* (so `getCurrentWeek` resolves), 2 themes × 2 sub-themes, and all 5 curriculum elements' objectives + indicators + theme links for both age groups. Uses the same tables the real import writes, so it exercises the same read paths.

## Verification

**Full local gate (verbatim):**
- `npx vitest run` — `Test Files  261 passed | 2 skipped (263)` · `Tests  2536 passed | 42 todo (2578)`. New: theme-match 15, calendar-csv 20, readiness 23, import-promes route 35 (7 new link cases).
- `npm run build` — compiled successfully, all routes emitted.
- `npx tsc --noEmit` — clean.
- `npm run lint` — `✖ 58 problems (0 errors, 58 warnings)`, all pre-existing.
- `bash scripts/verify-api-auth.sh` — `✓ API auth coverage OK: 189 / 189`.
- `bash scripts/verify-rls-coverage.sh` — `✓ RLS coverage OK: 38 / 38`.
- Playwright: deferred to the required CI `Playwright E2E` check — this worktree's `.env` points at the staging Supabase pooler and the harness refuses `E2E_ALLOW_REMOTE_DB` runs (same environment constraint recorded in the 2026-06-06 and 2026-06-01 cycles).

**Staging content load + end-to-end proof (DB ref `udbivhchbizpxoryejgz`, never prod):**
- `scripts/seed-demo-curriculum.ts --commit` → 1 semester, 2 tema, 4 sub-tema, 8 pekan, 10 tujuan, 26 indikator, **36 kaitan IKTP×Tema**.
- `loadWeeklyAssessment("t_annisaa", <walas employeeId>, "2026-07-31")` against staging returned: class `DCARE` (ageGroup A) · pekan 2 (2026-07-27 → 2026-07-31) · tema "Diriku (Demo)" / sub-tema "Tubuhku (Demo)" · 5 students · **9 indicators across all 5 curriculum elements**. Same loader the walas page renders — this is the previously-empty picker now populated.
- `scripts/verify-curriculum-readiness.ts --tenant t_annisaa` → 3 of 6 PASS. Passing: week coverage for the seeded semester, all 10 ageGroup×element pairs linked, holidays. Failing (all pre-existing staging state, not regressions): the older demo Semester 1 has no themes/weeks, and the `KB — Panduan Contoh` class has no walas. Reported rather than papered over — that is the check doing its job.

- **T1/T2 — Cross-checked `design-system.html` §alert** for the two new IKTP×Tema panels on `/admin/semesters/[id]/import`. Both reuse the existing `Alert` / `AlertTitle` / `AlertDescription` primitives already used by the active/inactive conflict panels on the same screen — default (non-destructive) variant, `role="status"` rather than `role="alert"` since neither blocks the commit. No new visual primitives, no new colour tokens, no bespoke spacing.

## Ship Notes

*(filled by `/ship` — the prod load execution gets recorded here when it runs)*

**Risks carried into the load (not code):**
- **Guardian accounts.** Prod has 1 GUARDIAN `User` against 307 `Parent` rows. Parent perkembangan and parent raport are correct code with no audience. Separate track — does not block walas/sentra entry or admin raport.
- **PROMES theme columns.** If the school's authored workbook lacks the E+ theme-marker columns, T1 has nothing to link and Penilaian Pekanan stays empty. Detected at preview; fallback is the manual matrix in `/admin/semesters/[id]/objectives`. Worth confirming with Kepala Divisi Pendidikan **before** the load starts.
- **Cutover timing.** TA 2026/2027 Semester 1 is already underway (started July). Weeks loaded with past start dates are fine (`getCurrentWeek` is a date-bracket lookup), but any pekan already taught is unassessed in the ERP and stays that way — fresh-start from load date.
