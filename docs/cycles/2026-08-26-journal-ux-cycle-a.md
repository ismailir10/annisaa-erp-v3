# Buku Penghubung UX — Cycle A (identity, week navigation, copy)

## Context

An end-to-end review of the student-journal module on the staging preview (2026-08-25, teacher
`ismail10rabbanii@` on class DCARE + parent `rightjet.hq@` with two children) found that the module's
two most-used screens never name the thing they are about. `/teacher/student-journal/students/[id]`
renders a week grid with no student name, nickname, or class anywhere on the page — the reported bug —
and `/teacher/student-journal/entry` renders "Isi Buku Penghubung" plus a date with no class name, so a
teacher assigned to more than one class cannot tell which roster is on screen. Both are rooted in the
API rather than the markup: `GET /api/student-journal/students/[id]/week` and
`GET /api/student-journal/class-grid` return grid data and nothing that identifies the subject.

The same pass found the week navigator drifting between surfaces: the teacher label prints
`7 Jun – 11 Jun` with **no year**, so paging to June 2027 (which the control happily allows — verified
live) is indistinguishable from June 2026; the parent label prints the year; neither offers a way back
to the current week. The parent page also keeps the viewed week in React state only, so a refresh or a
back-button press silently snaps the wali back to this week, while the teacher page honours `?week=`.
Finally a cluster of small copy defects undercuts the trust the journal is meant to build: the
teacher's own empty state tells the teacher that "catatan dari guru" will appear once written, the
parent empty state says "Belum ada catatan" twice in a row, and a note author renders as
`Ismail Rabbani (Teacher)` beside a `Guru` badge — the role stated twice, once in English.

Outcome: every journal screen states whose data it shows, the week control behaves the same way
everywhere and cannot wander into a year the reader can't see, the parent's week survives a refresh,
and the copy stops contradicting its own reader.

**UAT input.** `docs/uat/reports/2026-05-01-student-journal.md` is the only UAT report for this area.
It is ~16 weeks old and several cycles have landed on these files since, so its findings are treated as
**possibly stale — verify before acting**. Its two blockers (fixed-bottom Simpan bar; wali-kelas 403 on
the per-student week route) both read as already fixed in the current code, and neither is in scope
here. No finding from it is carried into this cycle's spec.

**Deferred on purpose — J1, weekend entries.** The review also proved that `weekDates()` returns
Mon–Fri only while the teacher picker accepts any date ≤ today and `entryBatchSchema` validates only
the string shape, so entries saved on a Saturday are written and then never rendered by any surface
(teacher, parent, or admin). Verified with live data: student `cms41al32003bi5x72axm73vb` holds two
`checked` SCHOOL entries dated **Sat 2026-08-15** that no week grid shows. The owner's decision on
2026-08-26 is to **keep the current Mon–Fri behaviour as-is for this cycle** — no change to the week
range, the picker bounds, or the API's accepted dates. It is recorded here so it is not lost; it needs
a school-side answer (does DCARE operate on Sabtu?) before it can be fixed correctly, and the two
orphan rows on staging still need a decision of their own.

## Spec

Acceptance criteria:

- [ ] `GET /api/student-journal/students/[id]/week` returns the student's `name`, `nickname` and
      active class name(s) alongside the existing week payload, scoped to the same tenant + teaching
      assignment check that already guards the route (no widening of who can read what).
- [ ] `/teacher/student-journal/students/[id]` shows the student's name as the page title, with
      nickname and class as supporting text, above the week grid — visible before the grid loads is
      not required, but it must be visible whenever the week data has loaded.
- [ ] `GET /api/student-journal/class-grid` returns the class section's name and program name.
- [ ] `/teacher/student-journal/entry` shows the class name alongside the date in its header.
- [ ] `WeekNavigator` gains an optional disabled-next state and an optional "kembali ke pekan ini"
      reset; both journal surfaces (teacher per-student week, parent journal) opt in, so neither can
      page into a future week and both can return to the current week in one tap.
- [ ] Week range labels on both journal surfaces render the year exactly once, in the same shape the
      parent attendance page already uses (`24 Agu – 28 Agu 2026`), from one shared helper.
- [ ] `/parent/student-journal` keeps the viewed week in the URL (`?week=YYYY-MM-DD`), so a refresh,
      a shared link, or a back-button press restores the same week; the existing `?view=` tab param
      keeps working alongside it.
- [ ] The note thread's empty state addresses its actual reader: teacher surfaces do not tell the
      teacher to wait for a teacher's note, and the parent copy does not repeat its own title.
- [ ] A note author is named once: a trailing role parenthetical in the stored name
      (`… (Teacher)`) no longer renders next to the role badge.
- [ ] The note compose dialog names the student it is about and states who will read the note.
- [ ] `components/portal/week-grid.tsx` no longer returns an unkeyed fragment from `categories.map`
      (React key warning).
- [ ] Gates green: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx eslint` on touched
      files, `bash scripts/verify-api-auth.sh`, `bash scripts/verify-rls-coverage.sh`.
- [ ] Each change verified visually on the staging preview in Chrome, signed in as the real teacher
      and parent accounts, and cross-checked against `design-system.html` (PageHeader/typography/
      spacing tokens unchanged, no new bespoke components).

Non-goals:

- **J1 weekend/non-school-day handling** — explicitly deferred (see Context). No change to
  `weekDates()`, the picker's `max`, or `entryBatchSchema`.
- Notes remain week-scoped. Decoupling the note thread from the week, unread markers, and reply
  threading are Cycle B.
- Teacher bulk-fill, class completeness counters, picker deep-link, roster row dedupe, and grid
  legibility (checked-vs-empty, editable-vs-locked) are Cycle C.
- Admin journal surfaces (`/admin/student-journal/**`) are out of scope; only shared components they
  consume may change, and their behaviour must not.
- `/parent/attendance` and `/teacher/assessments/weekly` keep their current next-week behaviour —
  both deliberately allow looking ahead (attendance even has "Pekan ini belum dimulai" copy for it),
  so they consume the upgraded `WeekNavigator` without opting into the new bound.

Assumptions:

1. A student with several active enrollments (the DCARE case: two ACTIVE rows, both named `DCARE`)
   should render distinct class names joined, not the first one silently.
2. Blocking *next week* is right for both journal surfaces because a future week can hold no data by
   construction — `WeekGrid` locks future cells and the picker caps at today.
3. Stripping a trailing role parenthetical from a stored author name is safe: `(Teacher)` there is a
   seed artefact, and matching is limited to known role words rather than "any parenthetical".
4. The parent `?week=` param follows the existing `?view=` pattern (`router.replace`, `scroll:false`),
   so tab state and week state compose rather than fight.

## Tasks

- [ ] **T1 — Student identity in the teacher week API.** Extend
      `app/api/student-journal/students/[id]/week/route.ts` to select the student's `name`/`nickname`
      and the names of the active class sections already fetched for the authorization check, and
      return them as `data.student`. Reuse the existing `enrollments` query — no extra round trip.
      *Acceptance:* route returns `data.student = { id, name, nickname, classNames[] }`; existing
      403/404 paths unchanged; `verify-api-auth.sh` still passes.
- [ ] **T2 — Teacher per-student week header.** Render `PageHeader` on
      `app/teacher/student-journal/students/[id]/page.tsx` with the student's name as title and
      nickname · class as subtitle, and pass the name into `NoteComposeDialog`'s title. Depends on T1.
      *Acceptance:* page shows the student's name once loaded; a vitest case asserts the name renders
      from the fetched payload.
- [ ] **T3 — Class identity on the fill page.** Return `data.classSection = { id, name, programName }`
      from `app/api/student-journal/class-grid/route.ts` and render it in the
      `app/teacher/student-journal/entry/page.tsx` header alongside the date. Independent of T1/T2.
      *Acceptance:* header reads class name + formatted date; existing grid behaviour untouched.
- [ ] **T4 — WeekNavigator bound + reset + shared label.** Add optional `nextDisabled` and
      `onToday`/`todayHref` (+ label) to `components/portal/week-navigator.tsx`; add a shared week
      range formatter (year once, matching `/parent/attendance`) and use it on both journal surfaces;
      opt both into the disabled-next bound and the reset. Independent of T1–T3.
      *Acceptance:* next control is disabled and announced as such on the current week; "pekan ini"
      reset appears only when off the current week; `/parent/attendance` and
      `/teacher/assessments/weekly` render unchanged; unit tests cover disabled + reset.
- [ ] **T5 — Parent week in the URL.** Move `/parent/student-journal`'s `currentWeek` into a `?week=`
      search param (validated `YYYY-MM-DD`, invalid → current week), composing with `?view=`.
      Depends on T4 only for the label helper. *Acceptance:* navigating weeks updates the URL; a
      reload restores the same week; a vitest case covers seeding from the param and rejecting junk.
- [ ] **T6 — Copy + fragment key.** Teacher-audience empty state in
      `components/student-journal/note-thread.tsx`; de-duplicated parent empty-state description;
      role-parenthetical strip in `lib/student-journal/note-display.ts`; audience hint in
      `components/student-journal/note-compose-dialog.tsx`; keyed fragment in
      `components/portal/week-grid.tsx`. Independent of T1–T5 except the dialog title from T2.
      *Acceptance:* unit tests cover the author-label strip and both empty states; no React key
      warning from the week grid in the test run.

## Implementation

**T1 + T2 — the student the week belongs to.**
`app/api/student-journal/students/[id]/week/route.ts` now selects `student` and `classSection.name`
on the enrollments query it already ran for the authorization check, and returns
`data.student = { id, name, nickname, classNames[] }` — no extra round trip, class names
de-duplicated for the two-ACTIVE-enrollment case. Identity resolves to `null` rather than throwing
when a row carries no relation, so a partial payload degrades to the old grid-only page instead of a
500. `app/teacher/student-journal/students/[id]/page.tsx` renders the shared `PageHeader` (name as
`h1`, `nickname · class` as subtitle) with a two-line skeleton while the week loads, and passes the
name into the note dialog's title. `components/student-journal/note-compose-dialog.tsx` gained an
`audience` prop that renders the "who reads this" line through the existing
`ResponsiveFormDialog` description slot (so it is wired to `aria-describedby`, not a loose `<p>`),
plus a lint fix: `today` is read per render instead of memoised on `open`.

**T3 — the class the grid belongs to.** `app/api/student-journal/class-grid/route.ts` fetches the
class section alongside the enrollments (one `Promise.all`, so no added latency) and returns
`data.classSection = { id, name }`. Fetched independently rather than read off an enrollment row so
an empty class still names itself. `app/teacher/student-journal/entry/page.tsx` renders
`DCARE · Selasa, 25 Agustus 2026` as its header subtitle — class first, because "which roster is
this" is the question the old header left unanswered. Program name was deliberately not surfaced:
the picker already shows it and it doubles the subtitle's length at 375 px.

**T4 — week navigation that cannot wander.** `components/portal/week-navigator.tsx` gained two
optional behaviours: `nextDisabled` renders the forward control as a real disabled `<button>` in
both href and handler modes (a `Link` without an href would still focus and read as actionable) with
an aria-label that says why, and `onToday`/`todayHref` renders the way back — only when a caller
passes one, so surfaces that don't opt in keep their exact previous shape. `lib/format.ts` gained
`formatWeekRangeLabel(start, end)`, printing the year once at the end (`24 Agu – 28 Agu 2026`);
both journal surfaces and `/parent/attendance` now share it, where before the teacher journal printed
no year at all and the parent journal printed it twice. `/parent/attendance` and
`/teacher/assessments/weekly` consume the component unchanged — both deliberately allow looking
ahead (attendance even has "Pekan ini belum dimulai" copy for it), so neither opts into the bound.

**T5 — the parent's week survives a reload.** `/parent/student-journal` derives its week from
`?week=YYYY-MM-DD` instead of component state, composing with the existing `?view=` tab param via
the same `router.replace(..., { scroll: false })` pattern. A junk or impossible date falls back to
the current week rather than erroring at the reader, and any day in a week is snapped to its Monday
so a link to "the day Ustadzah wrote" opens that week.

**T6 — copy that addresses its reader.** `components/student-journal/note-thread.tsx` takes
`audience: "parent" | "teacher"` (admin keeps the default) and picks its empty-state description
from one map — the teacher surface no longer tells a guru that "catatan dari guru" will appear once
written, and the parent copy no longer repeats its own title. `lib/student-journal/note-display.ts`
strips a trailing role parenthetical from a stored author name, so a seeded
`Ismail Rabbani (Teacher)` renders as `Ismail Rabbani` beside the `Guru` badge instead of stating
the role twice, once in English; initials follow the cleaned name. `components/portal/week-grid.tsx`
returns a keyed `<Fragment>` from `categories.map` instead of a bare `<>`, clearing the React key
warning every render of every journal grid produced.

## Verification

## Ship Notes
