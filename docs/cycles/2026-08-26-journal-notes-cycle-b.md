# Buku Penghubung — Cycle B (notes as a conversation, unread markers)

## Context

Cycle A (`docs/cycles/2026-08-26-journal-ux-cycle-a.md`, merged as #521) fixed who and when: every
journal screen now names its student or class, and the week control cannot wander. What it left
untouched is the finding that costs the module its purpose — **a note is only visible during the
week it was written in**.

Both note surfaces read from the week payload, which filters `StudentJournalNote` to the five days
of the viewed week. Verified live on staging: the teacher's own page for Abdullah showed "Belum ada
catatan" while a real note from that guru sat three weeks back, and the parent (Nurul) had to page
back three weeks, blind, to reach her own 10 Agu note — a note her parent *home page* was happily
previewing on a card. The journal is sold to wali as "catatan guru sampai ke rumah"; today the
catatan arrives and then disappears on Monday.

The second half of the same problem is that nobody is told a note exists. There is no badge, dot, or
count anywhere: a wali only discovers a guru's message by opening the Catatan tab of the right week,
and a guru only discovers a wali's reply the same way. With 10 notes on all of staging, that is not
a data problem — it is the reason there are only 10 notes.

Outcome: the note thread becomes a conversation with history, reachable in one tap from either side,
and each side is told when the other has written something new.

## Spec

### ⚠ Schema change — read this first

This cycle adds **one new table**. It is additive; nothing existing is altered or backfilled.

```prisma
model StudentJournalNoteRead {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String   // the reader (teacher, wali, or admin)
  studentId  String
  lastReadAt DateTime
  updatedAt  DateTime @updatedAt

  @@unique([userId, studentId])
  @@index([tenantId, studentId])
}
```

A **read watermark**, one row per reader per student — not a per-note receipt. Unread count for a
reader is `notes where authorUserId != me AND createdAt > lastReadAt AND status = ACTIVE`.

Three consequences worth agreeing on before it ships:

1. **A missing row means "nothing unread", not "everything unread".** The alternative — treating the
   absence of a watermark as "all notes are new" — would greet every wali on rollout with a badge
   counting months of already-read history. The cost is that notes written *before* a reader's first
   visit to the journal never badge; the row is created on that first visit and everything after it
   counts. Stated here because it is a product call, not a technical one.
2. **Marking read is a write on a read-shaped action.** Opening the notes surface POSTs the
   watermark. It is one upsert per reader per student per visit, keyed by a unique index, so it
   cannot fan out.
3. **The table is tenant-scoped**, so the migration must ship `ENABLE ROW LEVEL SECURITY` plus a
   `service_role` policy in the same file or `scripts/verify-rls-coverage.sh` fails the build.

Migration runs against staging on merge and against prod at the next promotion. E2E writes to the
staging database (`docs` + prior incidents), so the migration must be additive and non-asserting —
it is.

### Acceptance criteria

- [ ] Notes are readable independent of the viewed week, on both sides, newest first, with the
      note's own date on each card.
- [ ] The thread pages: an initial page of 20 with a "Muat lebih banyak" control, cursor-based so a
      note written mid-scroll cannot duplicate or skip a row.
- [ ] The week grid stays week-scoped — this cycle changes the note thread only, not the checklist.
- [ ] Teacher sees an unread count per student on the class-day grid, and the count clears after
      opening that student's page.
- [ ] Parent sees an unread count on the Catatan tab (and per child, on the child switcher, when
      more than one child has unread notes); it clears after opening the tab.
- [ ] Unread never counts the reader's own notes, and never counts a soft-deleted note.
- [ ] A reader with no watermark row sees zero unread, and reading creates the row.
- [ ] Cross-tenant and cross-family reads stay impossible: the notes list and the mark-read call
      reuse the exact authorization the existing note POST already applies (teacher must be assigned
      to one of the student's active classes; guardian must have an ACTIVE link; admin is
      tenant-scoped).
- [ ] Gates green: `tsc --noEmit`, `vitest run`, `eslint` on touched files, `verify-api-auth.sh`,
      `verify-rls-coverage.sh`, `audit-docs.sh`; build + Playwright via the required CI checks.
- [ ] Verified in Chrome on the PR preview as the real teacher and parent accounts, cross-checked
      against `design-system.html`.

### Non-goals

- **Reply threading.** A note stays a flat, dated entry; "reply to this note" is a later cycle.
- **Push/email notification.** The badge is in-app only.
- **J1 weekend entries** — still deferred by owner decision (Cycle A Context).
- Teacher bulk-fill, completeness counters, picker deep-link, grid legibility — still Cycle C.
- Admin note surfaces keep their current week-scoped reading; only shared components change.

### Assumptions

1. Unread is per **reader**, not per role — an admin writing on behalf of staff does not clear the
   guru's badge.
2. "Opening the surface" is the read signal: the teacher opening a student's week page, the parent
   opening the Catatan tab. No scroll tracking, no per-note "mark as read".
3. 20 notes per page is enough that paging is rare; the control is there for the long tail.

## Tasks

- [ ] **T1 — Schema + migration.** Add `StudentJournalNoteRead` to `prisma/schema.prisma` and a
      migration under `prisma/migrations/20260826000000_add_student_journal_note_read/` carrying the
      table, the unique index, `ENABLE ROW LEVEL SECURITY` and a `service_role` policy.
      *Acceptance:* `verify-rls-coverage.sh` passes with the new model counted; no ALTER on any
      existing table.
- [ ] **T2 — Shared note authorization.** Lift the role branching inside
      `app/api/student-journal/notes/route.ts` POST into a reusable
      `requireNoteAccessForStudent(studentId)` in `lib/student-journal/guards.ts`, and have the POST
      call it. Pure refactor, no behaviour change. *Acceptance:* existing note POST tests pass
      untouched.
- [ ] **T3 — Notes thread API.** `GET /api/student-journal/notes?studentId=&cursor=&limit=` —
      role-branched via T2, newest first, cursor `(createdAt,id)`, `limit` capped at 50, author
      metadata via the existing `enrichNotesWithAuthorMetadata`. *Acceptance:* returns notes from
      any week; a guardian for another family gets 403; cursor paging is stable across an insert.
- [ ] **T4 — Unread count + mark read.** `POST /api/student-journal/notes/read` upserts the
      watermark. Add `unreadNoteCount` to the teacher week payload, the children week payload, and a
      per-student `unreadNoteCounts` map to `class-grid`. *Acceptance:* count excludes own notes and
      INACTIVE notes; missing watermark → 0; upsert is idempotent per reader+student.
- [ ] **T5 — Teacher UI.** The student week page's Catatan section reads the thread API (not the
      week payload), pages, and POSTs the watermark on mount; the class-day grid shows an unread
      badge per student. *Acceptance:* the note written 3 weeks earlier is visible on the current
      week's page; badge clears after visiting.
- [ ] **T6 — Parent UI.** Catatan tab reads the thread API and pages; unread badge on the tab and on
      any child pill with unread notes; watermark POSTed when the tab opens. *Acceptance:* Nurul's
      10 Agu note is visible without paging weeks; badge clears after opening the tab.

## Implementation

**T1 — watermark table.** `StudentJournalNoteRead` in `prisma/schema.prisma` +
`prisma/migrations/20260826000000_add_student_journal_note_read/`: one table, a unique index on
`(userId, studentId)`, a `(tenantId, studentId)` index, RLS enabled with the `service_role` policy
every other tenant-scoped table carries. No ALTER, no backfill — the absence of a row is meaningful.

**T2 — shared note authorization.** `requireNoteAccessForStudent(studentId)` in
`lib/student-journal/guards.ts`, lifted verbatim out of the note POST's role branching and now used
by all three note surfaces (write, thread read, mark read). It returns the **student's** tenantId,
which is what keeps a note written by a cross-tenant guru pengganti visible to the wali who owns it.
`scripts/verify-api-auth.sh`'s helper allowlist gained the new function — it calls `getSession`
internally, so a route guarded by it is genuinely authenticated, and the gate would otherwise force a
redundant `getSession()` call at the top of the read route.

**T3 — thread API.** `GET /api/student-journal/notes?studentId=&cursor=&limit=` returns notes with
**no date filter at all**, `createdAt desc, id desc`, `take: limit + 1` where the extra row is the
has-more probe and never reaches the client. The cursor is a note id rather than an offset: notes
arrive while a reader scrolls, and an offset would duplicate or skip a row each time one did. `limit`
is clamped to 50.

**T4 — unread.** `lib/student-journal/note-reads.ts` owns the three operations —
`countUnreadNotes` (one student), `countUnreadNotesByStudent` (a whole roster in one query plus an
in-memory group, so a 30-student class is not 30 round trips), and `markNotesRead` (the upsert).
`POST /api/student-journal/notes/read` moves the watermark, rate-limited per user after the auth
check. Unread is surfaced in two places: the thread response carries `unreadCount` for the student it
is about, and `class-grid` carries an `unreadNoteCounts` map for the roster badge. The week payloads
were left alone — the surfaces that need a count already call one of those two.

## Verification

## Ship Notes
