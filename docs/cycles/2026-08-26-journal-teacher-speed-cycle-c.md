# Buku Penghubung — Cycle C (teacher speed, grid legibility)

## Context

Cycles A and B fixed what the module *said* — every screen now names its student and class, the week
control cannot wander, and a catatan survives the week it was written in. What is still unfixed is
what the module *costs*, and it is the reason the staging data is as thin as it is.

Filling one class-day is nine students × seven indicators = **63 taps**, one accordion at a time,
with no way to mark a student complete in one gesture and no sign anywhere of how much of the class
is done. Reaching that screen costs three more taps through a class-and-date form that, for a guru
assigned to exactly one class, has exactly one answer. Correcting yesterday means going back to that
form and retyping the date, because the per-student week view is read-only with no way into the day.

The reading side has its own tax. In the read-only grid a filled cell and an empty one are the same
weight of grey — `✓` and `—` at the same size and colour — so a full week and an empty week look
alike at arm's length. In the parent's "Di rumah" grid an editable cell and a locked one differ only
by 50% opacity, so a wali cannot tell which squares are hers to tap; the rule that governs them lives
only in an aria-label. An empty week says nothing at all: a wall of dashes reads as a broken product
rather than a week the school has not filled yet. And the roster prints three rows of "Abdullah …"
above the nickname "Abdullah" with an avatar reading "A" — one student, three ways, none of them
distinguishing.

Outcome: filling the journal costs a fraction of the taps, the guru can see how far along the class
is and jump straight into any day that needs fixing, and both grids say plainly what is filled, what
is editable, and what is simply not there yet.

## Spec

**No schema change.** Every task here is UI or an additive field on an existing response. No
migration, no new table, no new column.

### Acceptance criteria

- [x] A teacher with exactly one teaching assignment lands on today's grid without filling a form;
      the picker remains reachable and is not skipped when the teacher asks for it explicitly.
- [x] The fill page offers a visible way back to "another class or date" — auto-routing must never
      strand a guru on today.
- [x] A student's expanded checklist can be marked complete, and cleared, in one gesture; the bulk
      action writes through the same coalescer as individual taps and rolls back the same way.
- [x] The fill page shows how much of the class is done (`N/M siswa lengkap`), updating as cells are
      tapped, not only on reload.
- [x] The per-student week view offers a jump into the fill grid for that student's class — no
      retyping a date into the picker to correct a day.
- [x] In the read-only grid a filled cell is unmistakable at a glance: the same check mark the
      editable grid uses, in the same accessible colour, not a grey glyph the same weight as the
      empty state.
- [x] In an editable grid, a cell the reader may tap looks different from one they may not, before
      any interaction and without relying on opacity alone.
- [x] A week with no school entries at all says so in words rather than rendering a silent wall of
      dashes.
- [x] A roster row identifies its student once: two-letter initials, and no nickname line when the
      nickname is just the first word of the name.
- [x] The parent journal header names the child and class it is showing.
- [x] Gates green: `tsc --noEmit`, `vitest run`, `eslint`, `verify-api-auth.sh`,
      `verify-rls-coverage.sh`, `audit-docs.sh`; build + Playwright via the required CI checks.
- [x] Verified in Chrome on the PR preview as the real teacher and parent accounts, cross-checked
      against `design-system.html`.

### Non-goals

- **"Salin dari kemarin"** (copy yesterday's ticks). It needs a new read of the previous school day
  and a merge rule for partially-filled days; bulk mark-all covers most of the same ground at a
  fraction of the risk. Deferred.
- **Teacher home nudge** ("2 kelas belum diisi hari ini") — the completeness figure lands on the fill
  page this cycle; surfacing it on `/teacher` is a follow-up.
- **J1 weekend entries** — still deferred by owner decision (Cycle A Context).
- Reply threading and push notification — still out (Cycle B non-goals).
- Admin journal surfaces: unchanged except where they consume the shared `WeekGrid`, whose
  legibility changes apply everywhere by design.

### Assumptions

1. "Complete" for a student means every ACTIVE indicator ticked for that day — the same definition
   the existing `N/7` counter already uses per row.
2. Auto-routing to today's grid is right for a **single-assignment** teacher only. With two or more
   classes the picker is a real question and stays.
3. ~~The week view's jump targets the student's first active class.~~ **Corrected during
   preview-verify:** it must target the first class *this teacher is assigned to*. The week route
   grants on any enrollment while `class-grid` guards the specific class, so "first enrollment" sent
   a guru to a Forbidden screen for the real two-enrollment student on staging. See Verification.
4. Making the read-only check mark match the editable one is a legibility fix, not a licence: the
   cell stays non-interactive.

## Tasks

- [x] **T1 — One-tap into today.** `/teacher/student-journal` auto-routes to
      `entry?classId=…&date=<today>` when the teacher holds exactly one assignment, unless
      `?pick=1`. The fill page gains a "Ganti kelas atau tanggal" control pointing back at
      `?pick=1`. *Acceptance:* single-assignment teacher reaches the grid with zero form input;
      multi-class teacher sees the picker unchanged; the escape hatch never loops.
- [x] **T2 — Bulk fill per student.** "Tandai semua" / "Hapus semua" inside the expanded checklist,
      routed through the existing `JournalWriteCoalescer` so one gesture is one batched request with
      the existing rollback. *Acceptance:* marking all sets every indicator for that student;
      failure rolls the whole gesture back with one toast; per-cell pending styling still applies.
- [x] **T3 — Class completeness.** `N/M siswa lengkap` on the fill page header, derived from live
      grid state. *Acceptance:* the count moves as cells are tapped, and reads `0/9` on an untouched
      class-day.
- [x] **T4 — Jump from the week view into the day.** Teacher week API returns the student's active
      class ids; the page renders a link into the fill grid for the viewed week's today (or the
      week's last school day when viewing a past week). *Acceptance:* the link carries the right
      classId + date; absent when the student has no active class.
- [x] **T5 — Grid legibility.** In `components/portal/week-grid.tsx`: read-only filled cells render
      the same `Check` icon in `text-primary-text` as the editable mode, empty cells a muted dash at
      the same size; editable-but-locked cells become visually distinct from editable ones by more
      than opacity. *Acceptance:* unit tests assert the read-only checked cell renders the icon, and
      that locked cells keep their existing aria reason.
- [x] **T6 — Empty-week copy.** When a week carries no school entries, both journal surfaces say so
      above the grid instead of rendering only dashes. *Acceptance:* copy appears only when the week
      is genuinely empty, and never on a week with at least one tick.
- [x] **T7 — Roster row + parent header identity.** `ClassDayGrid` uses two-letter initials and drops
      a nickname that is merely the first word of the name; the parent journal header names the child
      and class. *Acceptance:* "Abdullah Faris Siregar" shows `AF` and no duplicate nickname line;
      the parent header reads `Bilal · TKIT-A`.

## Implementation

**T1 — one tap into today.** `/teacher/student-journal` routes a single-assignment teacher straight
to `entry?classId=…&date=<today>` unless `?pick=1`. The redirect lives in **its own effect**: folded
into the fetch effect it put `router` in a dependency array that also triggered the fetch, and since
`router` is a fresh object per render under some setups the effect re-ran on its own `setState` —
**642 requests in half a second**, caught by the first test written against it. The redirect effect
writes no state, so a re-run is inert. The fill page's back link and its new "Ganti kelas atau
tanggal" action both carry `?pick=1`, so the escape hatch cannot loop.

**T2 — bulk fill.** `handleBulkSet(studentId, checked)` walks the student's indicators and reuses the
same `setCell` path as a single tap, so one gesture folds into one coalesced batch with the existing
per-cell rollback — no second write path. `ClassDayGrid` renders "Tandai semua" / "Hapus semua" only
when a handler is passed; each disables itself when it would be a no-op.

**T3 — completeness.** `N/M siswa lengkap` under the fill header, computed from live grid state
rather than the loaded payload: the guru reads it *while* tapping, and a figure that only moved on
reload would be worse than none.

**T4 — jump into the day.** The teacher week API now returns `student.classes` (ids **and** names,
de-duplicated by id — the DCARE case is two sections sharing one label). The week page renders
"Isi hari ini" on the current week, or "Isi <tanggal>" pointing at the viewed week's last day when
paging back, and renders nothing when the student has no active class.

**T5 — legibility.** In `WeekGrid`, a filled read-only cell now draws the same `Check` icon in
`text-primary-text` that the editable grid uses, and an empty one a quiet rule — they were `✓` and
`—` as text at identical size and colour. Locked editable cells stopped differing from live ones by
opacity alone: **an empty box now means "you may tick this" and a dash means "not yours to fill"**,
which is the distinction a wali could not previously make on the "Di rumah" grid.

**T6 — empty-week copy.** `WeekGrid` takes an optional `emptyWeekMessage`, rendered only when the
week holds no ticks at all. Parent: "Sekolah belum mengisi jurnal untuk pekan ini."; teacher:
"Belum ada centang di pekan ini." An unchecked entry row still counts as empty — a row exists in the
database, but there is nothing there for a reader.

**T7 — identity.** `ClassDayGrid` derives two-letter initials (three "A" avatars in a row on the
DCARE roster identified nothing) and drops a nickname that is merely the first word of the name. The
parent journal header's subtitle now reads `Bilal · TKIT-A` instead of a static tagline.

## Verification

**Gates** (worktree `feat/journal-teacher-speed-cycle-c`, branched from `origin/staging` `18ee0a3d`):

- `npx tsc --noEmit` — ✅ exit 0.
- `npx vitest run` — ✅ `Test Files 337 passed | 2 skipped (339)` · `Tests 3285 passed | 42 todo (3327)`.
- `npx eslint` on every touched path — ✅ 0 errors, 0 warnings. Two rounds of pushback were fixed rather than suppressed: the `react-hooks/refs` rule rejected a ref written during render (the first shape of the auto-route fix), and the pre-commit typography floor had already rejected `text-[10px]` badges in cycle B.
- `bash scripts/verify-api-auth.sh` — ✅ `196 / 196`. `bash scripts/verify-rls-coverage.sh` — ✅ `42 / 42`. `bash scripts/audit-docs.sh` — ✅ 0 fail.
- `npm run build` + Playwright — deferred to the required CI checks (Turbopack/worktree symlink limitation, as in cycles A and B).

**A render loop caught by its first test.** The auto-route began life inside the fetch effect, whose dependency array then had to include `router`. Under the test's `useRouter` mock — and any setup where the router object is not referentially stable — the effect re-ran on its own `setState`: **642 requests in 500 ms**, measured. The redirect is now a separate, state-free effect; a re-run of it is inert. This is the argument for writing the test before believing the feature.

**A real bug found by preview-verify, not by the suite.** Clicking the new "Isi hari ini" on staging landed on *"Data kelas tidak bisa dimuat"* with a `Forbidden` toast. Cause: the week route grants access when the teacher is assigned to **any** of the student's active classes, but `class-grid` guards the **specific** class — and Abdullah holds two ACTIVE DCARE enrollments, of which this guru teaches only the second. The link was built from `classes[0]`, the one he cannot fill. Fixed by returning only the caller's *assigned* classes in `student.classes` (identity still lists every class name via `classNames`), with the week route's `findFirst` widened to `findMany` to get the ids. Re-verified after the fix.

**Preview-verify** — Chrome MCP on PR #523's preview, signed in as the real teacher and parent:

- **Teacher** `/teacher/student-journal` → auto-routed to `entry?classId=…&date=2026-08-26`; header reads `DCARE · Rabu, 26 Agustus 2026`, `0/8 siswa lengkap`, with "Ganti kelas atau tanggal" beside it. Avatars read `AF`, `AI` — no duplicate nickname line.
- **Bulk fill, exercised for real:** one tap on "Tandai semua" took the row to `7/7`, flipped the avatar to a check, moved the header to `1/8 siswa lengkap`, and spent the button; "Hapus semua" put it back to `0/7` and `0/8`. Staging was left as found.
- `?pick=1` → the class/date form renders, no re-route.
- **Teacher week view** → "Isi hari ini" present, "Belum ada centang di pekan ini." above the grid, and the jump now opens the right class-day.
- **Parent** → header reads `Bilal · TKIT-A`; the school tab says "Sekolah belum mengisi jurnal untuk pekan ini."; on "Di rumah", Sen/Sel/Rab render tappable boxes while Kam/Jum render dashes — the editable-vs-locked distinction is now shape, not opacity.

**Design system:**
- [x] Cross-checked `design-system.html` + `.claude/standards/portal.md`. Bulk controls and the header action reuse `tap-target` with existing tokens; the read-only check is the same `Check` in `text-primary-text` the editable grid already used; no new spacing value, no arbitrary hex.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none.
- **Routes:** none added or removed. `GET /api/student-journal/students/[id]/week` returns one added field, `student.classes` (the caller's assigned classes only).
- **Data:** none written by this change. Preview-verify wrote and then cleared one student's ticks on staging; nothing else.
- **Behaviour change worth announcing to teachers:** a guru with exactly one class no longer sees the class/date form on entry. It remains at `/teacher/student-journal?pick=1`, reachable from "Ganti kelas atau tanggal" on the fill page.
- **Rollback:** revert the commits; nothing persisted, no consumer outside this repo reads `student.classes`.
- **Follow-up:** "Salin dari kemarin" and the teacher-home completeness nudge were both scoped out (see Non-goals); J1 weekend entries still deferred.
