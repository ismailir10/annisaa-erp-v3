# Journal UX — class-level journal bulk, note edit/delete + draft guard, roster guard, cross-role signals

## Context
The full E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`) found that the teacher's daily loop is much slower than the parent-facing promise and that several cross-role signals never arrive. Finding ids: **TCH-7** (no class-level bulk in the daily journal: ~40 taps for 20 students), **X-4** (teacher cannot edit/delete her own catatan although the API allows it; JTBD-TEACHER-JOURNAL-03), **TCH-3** (tapping outside the note dialog silently discards the typed note), **TCH-2** (session roster masuk/pulang/penjemput only saves on "Simpan absensi", a reload loses taps silently), **X-5** (the parent's "Di rumah" checklist is invisible to the class teacher), **X-21** (teacher gets no signal when admin approves/rejects leave), **X-6** (a new public admission inquiry never surfaces on the admin dashboard / work queue), **DOC-1** (assigning a homeroom teacher never backfills existing class sessions, so the teacher home shows no class), **DOC-4** (autosave taps give no visible confirmation), plus small minors **TCH-9** (future dates selectable in class attendance), **TCH-12 / X-7** (parent attendance banner says "semoga lekas sehat" for Alpa / Izin), **TCH-13** (`/teacher/sessions` is a 404).

Overlap: PR #575 (`claude/fix-display-signals`) changes `lib/student-journal/note-reads.ts` and `lib/format.ts`; this cycle deliberately touches neither.

## Spec
- [x] DOC-1: creating a HOMEROOM assignment (and removing one) re-derives the teacher on the class's sessions dated today or later via `backfillSessionTeacher`; substituted sessions are untouched; failure of the backfill never fails the assignment; running it twice is a no-op.
- [ ] TCH-12/X-7: the "istirahat dulu, semoga lekas sehat" line shows only when the week has a Sakit day; Alpa-only and Izin-only weeks get their own copy.
- [ ] TCH-9: the class-attendance date input cannot pick a future date. TCH-13: `/teacher/sessions` redirects to the sessions list on the teacher home.
- [ ] TCH-3: closing the note dialog (outside tap, Escape, Batal) with an unsaved draft asks "Buang catatan?"; nothing is asked for an untouched or just-saved dialog. Applies to teacher and parent composers (one shared component).
- [ ] X-4: the teacher sees edit + delete (with confirm) on her own catatan only, on the per-student page; other authors' notes show no controls.
- [ ] TCH-7: the teacher journal entry page has a class-level bulk sheet: choose "semua indikator" / a category / one indicator, choose all students or a selection, tap "Tandai" (or "Kosongkan"); the whole gesture is one batched write (chunked, bounded), shows a "Batalkan" undo, and per-student taps still work. Common case (all indicators, all students) is 3 taps: open, apply, (undo optional).
- [ ] TCH-2: the session roster shows "Belum disimpan" while it differs from the saved state, warns on reload/close (`beforeunload`), on in-app link navigation and on the browser Back button.
- [ ] X-5: the teacher's per-student week page shows the parent's "Di rumah" ticks read-only.
- [ ] X-21: the teacher home lists leave decisions (approved/rejected) from the last 7 days with the admin's reason for a rejection.
- [ ] X-6: new admission inquiries (status INQUIRY, created in the last 14 days) appear as a work-queue kind on `/admin` and `/admin/work-queue`, with a tile and a link to the admission.
- [ ] DOC-4: the weekly assessment level taps show a saving/saved/error status line like the journal; class attendance already shows one (verified in browser).

### Non-goals
- No Prisma schema migration, no new dependency, no push/email notification, no change to `lib/student-journal/note-reads.ts` or `lib/format.ts`.
- No redesign of the per-student accordion; bulk is an added control, not a replacement.

### Assumptions
1. "Not yet followed up" for an inquiry = status still `INQUIRY` (the admin moving it to VISIT_SCHEDULED/VISITED/ADMITTED/CANCELLED removes it from the queue); "new" = created within the last 14 days.
2. Leave decisions come from `LeaveRequest.reviewedAt` (no new table); "last 7 days" is measured against now.
3. The existing batch endpoint (`POST /api/student-journal/entries/batch`) is reused for bulk; it gets a hard bound (500 entries per request) and the client chunks larger gestures.
4. Browser Back cannot be truly blocked; the roster guard uses a sentinel history entry to intercept it.

## Tasks
- [x] **T1 — DOC-1 homeroom backfill.** Call `backfillSessionTeacher` from the teaching-assignments POST/DELETE for HOMEROOM; vitest.
- [ ] **T2 — Minors TCH-12/X-7, TCH-9, TCH-13.** Banner copy by reason, future-date guard, sessions index redirect; vitest.
- [ ] **T3 — TCH-3 discard guard in the note composer.** vitest (jsdom).
- [ ] **T4 — X-4 teacher edit/delete own notes.** Shared delete confirm, teacher student page wiring; vitest.
- [ ] **T5 — TCH-7 class-level bulk.** Batch bound + chunk helper, bulk sheet, undo; vitest.
- [ ] **T6 — TCH-2 session roster unsaved-changes guard.** Guard hook + dirty indicator; vitest.
- [ ] **T7 — X-5 teacher sees "Di rumah".** Week API returns home scope, read-only grid; vitest.
- [ ] **T8 — X-21 leave decisions on the teacher home.** Server query + section; vitest.
- [ ] **T9 — X-6 new inquiries in the admin work queue.** Source, kind, tile; vitest.
- [ ] **T10 — DOC-4 assessment save status.** vitest.
- [ ] **T11 — Verification, JTBD refresh, Ship Notes.**

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, dirty-work=none (Sonnet is the harness tier and there is no cheaper tier used). Tasks run sequentially inline: T3-T5 share the note/journal components and T2/T6/T8 share the teacher home and client patterns, so a subagent would need the whole plan as context; the brief runs one cycle per build agent.

- T1 (DOC-1): `app/api/admin/classes/[id]/teaching-assignments/route.ts` — after a HOMEROOM assignment is created, and after a HOMEROOM is removed, the route calls the existing (but never wired) `backfillSessionTeacher(classId, tenantId)`, which re-points today-and-later non-substituted `ClassSession` rows (substituted sessions and past days are left alone; running it twice changes nothing). The call is failure-isolated in `syncSessionTeacher` (logged, never fails the already-saved assignment); ASSISTANT changes and a refused (409) HOMEROOM never trigger it. Test: `app/api/__tests__/teaching-assignments-backfill.test.ts` (6 cases; the existing `lib/sessions/__tests__/teacher-backfill.test.ts` already covers the substituted/past/null semantics).

## Verification
- T1: gates passed on the staged tree: `npm run build` exit 0; `npx vitest run` 430 files passed / 2 skipped, 4079 tests passed (also needed `npx prisma generate` once: the worktree had no `lib/generated`).
- design-system: frontend tasks are checked against `.claude/standards/design-system.html` (existing Sheet/ConfirmDialog/SaveStatus/TaskRow primitives, status tokens, 44 px targets, no new colours).

## Ship Notes
- Pending.
