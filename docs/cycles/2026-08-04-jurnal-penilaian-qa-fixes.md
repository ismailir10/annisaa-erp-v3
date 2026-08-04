# Jurnal + Penilaian — QA blocker & major fixes

## Context

The 2026-08-04 cross-role QA pass on staging (report: [`docs/qa/2026-08-04-jurnal-penilaian-cross-role-staging.md`](../qa/2026-08-04-jurnal-penilaian-cross-role-staging.md)) drove Jurnal and Penilaian end to end across admin, teacher and parent on the deployed preview at `5dba30ac`, corroborated by direct reads against the staging DB.

The cross-role data chains themselves were sound — a sentra entry propagated correctly to the admin monitor, parent Capaian, raport auto-suggest and the published parent raport; per-child and per-family scoping held on all ten probes. What the pass surfaced was one blocker and four majors, all confirmed both live and in the source at `origin/staging`.

This cycle fixes exactly those five. The twelve minors and the staging seed-drift item stay open in the report.

## Spec

**B1 (blocker) — walas IKTP picker is non-functional.**
`app/teacher/assessments/weekly/client.tsx` wrapped a raw `<select>` inside `<NativeSelect>`, which is itself a `<select>`. The resulting `<select><select>…</select></select>` is invalid: the visible outer select rendered zero options, the real picker got a 0×0 box, and React threw hydration error #418. Because `activeIndicatorId` defaults to `indicators[0].id`, taps still saved — always against IKTP #1 of 9, with nothing on screen naming the indicator. Introduced by the UI Consistency Sweep (#369); the other four `NativeSelect` call sites are correct.

Acceptance: one `<select>`, all indicators as options, label wired, selectable, and the "no IKTP linked" empty state preserved.

**M1 — admin Buku Penghubung monitoring is not academic-year scoped.**
`app/api/student-journal/admin/classes/route.ts` filtered only on `tenantId` + the class section's own `status`, so archived cohorts leaked in: staging listed 15 classes, 7 of them from the ARCHIVED 2024/2025 year. `/api/admin/penilaian` already scopes by the active `AcademicYear`.

Acceptance: only the active year's sections; 422 with the same Indonesian copy as the penilaian route when no year is active.

**M2 — "Total entri minggu ini" is wrong.** The KPI reverse-engineered the entry count out of an already-rounded `completionPct`. With 4 real entries the percentage rounded to 3% and the card displayed **1**, while the drill-down on the same data correctly showed 4/30.

Acceptance: the API returns a raw `checkedCount`; the card sums it.

**M3 — "Siswa terdaftar aktif" counts enrolment rows, not students.** Summing per-class `studentCount` displayed **37** against **21** distinct active students, double-counting anyone enrolled in two years.

Acceptance: a tenant-level `summary.activeStudentCount` over DISTINCT students.

**M4 — teacher journal entry writes are unaudited.** `entries/batch` upserted with no `StudentJournalAudit` row, while admin edits and note creation did — so the Audit tab showed later admin corrections but never the original entry, on a record parents read. The parent-side `entries/home` path had the same gap.

Acceptance: both paths audit; CREATE when no prior row, UPDATE when the value flips, nothing when a re-save changes nothing.

**Non-goals:** the twelve minors in the report (greeting timezone, honorific, semester label, `not-found.tsx`, contrast, perf, copy) and the staging seed drift (d1). Not fixed here.

## Tasks

- [x] T1 — B1: pass the props to `NativeSelect` instead of nesting a second `<select>`
- [x] T2 — M1: scope the journal admin class query to the active `AcademicYear`
- [x] T3 — M2/M3: return `checkedCount` + `summary.activeStudentCount`; consume both in the monitor
- [x] T4 — M4: extract one audited entry writer and route both `entries/batch` and `entries/home` through it
- [x] T5 — regression coverage for T1–T4, verified to fail against the pre-fix code

## Implementation

| File | Change |
|---|---|
| `app/teacher/assessments/weekly/client.tsx` | Unnested the picker — `NativeSelect` now carries `id` / `data-testid` / `value` / `onChange` directly. `data-testid="indicator-picker"` preserved for existing selectors. |
| `app/api/student-journal/admin/classes/route.ts` | Active-`AcademicYear` lookup + `academicYearId` filter (422 when unset, matching `/api/admin/penilaian`). Swapped the enrolment `groupBy` for a `findMany` so one pass yields both per-class counts and the distinct student set. Returns `checkedCount` per row and `summary.activeStudentCount`. |
| `app/admin/student-journal/monitoring/page.tsx` | `totalEntries` sums the raw `checkedCount`; "Siswa terdaftar aktif" reads `summary.activeStudentCount`. Dead `hariKosong` removed (computed, never rendered). |
| `lib/student-journal/entry-writes.ts` *(new)* | `upsertJournalEntriesWithAudit` — interactive transaction that reads prior state, upserts, and emits CREATE/UPDATE audit rows, skipping no-op re-saves. 20 s timeout since a full-roster save is a sequential upsert+audit pair per cell. Does no authorisation; callers validate scope. |
| `app/api/student-journal/entries/{batch,home}/route.ts` | Both write through the shared helper, so the SCHOOL and HOME paths cannot drift apart again. |
| `__tests__/api/student-journal/entries-home-today-only.test.ts` | Mock updated for the interactive `$transaction(async tx => …)` form. |

New tests: `__tests__/api/student-journal/entry-writes-audit.test.ts` (6), `__tests__/api/student-journal/admin-classes-scope.test.ts` (6), `app/teacher/assessments/weekly/__tests__/indicator-picker.test.tsx` (5).

## Verification

- `npm run build` — exit 0.
- `npx vitest run` — **2 failed | 271 passed | 2 skipped (275 files)**; **2608 tests passed**.
  The 2 failures are pre-existing and unrelated (stale-request race assertions in `app/teacher/assessments/center/[center]/__tests__/client.test.tsx` and `app/teacher/class-attendance/__tests__/page.test.tsx`). Verified independently: stashing this branch's changes and running those two files against clean `5dba30ac` reproduces `Test Files 2 failed | 1 passed`. Neither file is touched here.
- `npm run lint` — 0 errors, 60 warnings (all pre-existing `no-unused-vars` in test fixtures).
- **Guards proven against the pre-fix code**, not just asserted green: reverting `weekly/client.tsx` to `HEAD` fails 3 of 5 picker tests; reverting `admin/classes/route.ts` fails 5 of 6 scope tests.
- Regression fixed en route: switching to the interactive transaction broke `entries-home-today-only.test.ts`, whose mock encoded the array-form `$transaction` contract. Confirmed a genuine regression (it passes on clean HEAD) and updated the mock.
- Frontend diffs cross-checked against `design-system.html` — no visual tokens changed; `NativeSelect` renders the same control, the fix only removes an invalid nested element.
- Playwright: **deferred to the required CI `Playwright E2E` check**. This harness cannot spin the local Playwright stack; no e2e spec covers the weekly IKTP picker today, and the three new Vitest suites cover the changed behaviour deterministically.
- Preview-verify on the Vercel preview is still owed before merge — the blocker was found in the browser and should be confirmed there.
- Local browser verification was attempted and is **not** available in this harness: the preview server cannot spawn (`getcwd: Operation not permitted` before the shell starts). Not a launch-config problem; the Vercel preview is the verification path.
- `/audit-docs` — **0 fail, 0 warn.** routes 185/185, portal pages 41/13/8, components 65/65, e2e specs 33/33, all 10 standards files present, File Structure paths all resolve. This cycle adds no route, page, component or spec, so no doc counters move.
- Test-skip delta gate: HEAD 0, `origin/staging` 0 — no new gated-out tests.

## Ship Notes

- **Migrations:** none. No schema change; `StudentJournalAudit` already existed and was simply not being written by these two routes.
- **Env vars:** none.
- **API contract:** `GET /api/student-journal/admin/classes` gains `checkedCount` per row and a `summary` object, and now returns **422** when no `AcademicYear` is ACTIVE. The only consumer is `/admin/student-journal/monitoring`, updated in the same commit. A tenant with no active academic year will see an error toast where it previously saw every class ever created — that is the intended correction, but it is a visible behaviour change worth watching after deploy.
- **Data:** audit rows now accrue on every teacher/parent journal tap. Volume is roughly one row per changed cell; no-op re-saves write nothing.
- **Rollback:** revert the commit. No data migration to unwind; audit rows already written are additive and harmless.
- **Still open from the QA report:** 12 minors (m1–m12) and the staging seed drift (d1) — notably the parent greeting reading server UTC and the `=== "FATHER"` comparison that greets every father "Bu", both on the first screen a parent sees.
