# Absensi kelas — mark everyone Hadir at once, choose exceptions directly

## Context
Owner feedback after the rate-limit fix (ismailir10/annisaa-erp-v3#567): "the UI is ugly … most students are expected to be present, teacher need to do it one by one." Today `/teacher/class-attendance` makes the common case the most expensive one: every present child is one tap and one POST. The exceptions are hidden — a tap cycles Hadir → Alpa → Sakit → Izin, so Izin is four taps and four saves, and one tap too many saves Alpa. Every saved row grows an "Absensi tersimpan" line underneath, doubling the list height, and a paragraph at the bottom explains how the screen works. `POST /api/student-attendance/mark` already accepts a `records[]` batch, so the fix is UI only.

## Spec
- [x] One sticky primary button above the bottom nav: **"Tandai N siswa lainnya Hadir"**, where N = children with no recorded status. One POST with all N records. It never touches a child who already has a status. When N = 0 the bar reads "Semua siswa sudah dicatat" and the button is gone.
- [x] Each row shows the child's name (+ nickname) and a four-option control **H · S · I · A** (Hadir, Sakit, Izin, Alpa — the rapor letters). One tap selects that status and saves it; no cycling. Screen readers get a `radiogroup` labelled with the child's name and `radio` options named with the full word. Targets ≥ 44px.
- [x] Selected option is filled in its status colour; unrecorded rows are neutral. No per-row "Absensi tersimpan" line.
- [x] One status line under the summary: "Menyimpan absensi…" while any save is in flight, then "Absensi tersimpan". A single-row failure shows inline on that row with "Coba lagi" (same message + retry-the-same-choice behaviour as today). A bulk failure reverts those rows to unrecorded, shows one alert, and the bulk button stays as the retry.
- [x] Toolbar compacted to one line: class (Select only when the teacher has more than one class, plain text otherwise) + date input. Summary on one line: "Hadir x · Sakit x · Izin x · Alpa x · y belum".
- [x] The explanatory paragraph at the bottom is removed.
- [x] Existing guarantees kept: saves per child are serialized; a late response for an older choice or an older class/date never overwrites the newer one; counts only include confirmed saves; `data-testid="roster-row"` stays for the perf-budget e2e.
- [x] Vitest: direct pick posts that status; bulk posts only unrecorded children in one request and leaves Sakit/Izin rows alone; bulk failure reverts; single failure + retry; stale-save and stale-context tests ported.

### Non-goals
- API, schema, rate limits (done in #567).
- Session attendance (`/teacher/sessions/[id]`), notes per child, check-in/out times.
- Undo for the bulk action (every row stays one tap from any status).

### Assumptions
1. H/S/I/A letters are understood by teachers (standard rapor abbreviations); full words are in the accessible names and the summary line.
2. Order H · S · I · A follows the rapor, not the old cycle order.
3. The owner's "proceed" approves this Spec, the PR, its self-merge to `staging`, and — explicitly requested — the staging → `main` promotion afterwards.

## Tasks
- [x] **T1 — Redesign the class attendance page.** Page + tests + doc fix (the previous cycle doc lost its `## Ship Notes` heading). *Accept:* new Vitest cases green; build + full Vitest green. *Depends on:* none.

## Implementation
- Subagent plan: driver=claude-opus-5-5, no subagents — one task on one page; fan-out costs more than it saves.
- Task 1: `app/teacher/class-attendance/page.tsx` — `persistStatus`/`cycleStatus` replaced by `persist(studentIds[], status, {bulk})`: one request for N children, optimistic update, per-child operation ids + queues kept (a child's saves stay serialized; the bulk waits on every included child's queue), only current operations land. Bulk failure removes the rows' saving state and shows one alert on the bar; single failure keeps the row error + "Coba lagi". Rows are an `ul` with a `radiogroup` of four 44px `radio` buttons (H · S · I · A, full words as accessible names), subtle status row tint, `data-testid="roster-row"` kept on the `li`. Sticky bulk bar reuses the session page's `bottom-[calc(4rem+safe-area)]` pattern. Class shows as text when the teacher has one class. Help paragraph removed. Tests ported to radios + 2 new bulk cases. `.claude/standards/portal.md` "Cycle-Tap Attendance" → "Class Attendance Entry" (exception-first + bulk rules); `docs/uat/jobs/teacher.md` ATT-01/02 steps; `CLAUDE.md` standards index; previous cycle doc regains its `## Ship Notes` heading; counts block refreshed.

## Verification
- Task 1: `npm run build` exit 0; `npx vitest run` 422 files passed / 2 skipped, 3933 tests passed; class-attendance suite 8/8; eslint 0 errors (1 pre-existing unused-disable warning); `audit-docs.sh` 0 fail after `--write`.
- [x] Cross-checked design-system.html §16 Flow B for the class roster: kept its intent (everyone-present costs one tap, live tally, sticky CTA above the bottom nav, `--status-*` tokens only); replaced its "cycle-tap, not radio" note with a superseded pointer to `portal.md` § Class Attendance Entry, which already preferred explicit choices.
- Playwright: local run deferred to CI (env cannot execute it — no local Postgres or Docker; `.env` points at hosted Supabase, which the e2e guard refuses).
  Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.

## Ship Notes
- Teacher flow is now exception-first: pick S/I/A for the few, then "Tandai N siswa lainnya Hadir" once. A 30-child class drops from 30+ taps (and 30+ requests) to about 4.
- No more tap-to-cycle; tapping an already-selected option does nothing.
- UI only — no API, schema or dependency change.
