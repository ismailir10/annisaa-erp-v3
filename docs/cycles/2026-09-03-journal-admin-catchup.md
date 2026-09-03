# Buku Penghubung — Cycle D (admin catch-up)

## Context

Cycles A/B/C (#521-523) rebuilt the journal module's identity, week-navigation, notes-as-conversation and teacher-speed UX — but only reached the teacher and parent surfaces. A UI/UX review found admin's two journal detail surfaces never got the same fixes, even though the backend already supports admin end-to-end:

1. **The exact bug Cycle B fixed for teacher/parent is still live for admin.** Both `app/admin/student-journal/students/[id]/page.tsx` (the monitoring detail page) and `components/admin/student-journal-block.tsx` (the Buku Penghubung card on the student dossier) still read notes from the week-scoped `/week` payload and render them inline — so a note written three weeks ago is invisible on the current week's page for an admin, exactly the "belum ada catatan" bug Cycle B's `NoteThreadPanel` was built to fix. `lib/student-journal/guards.ts`'s `requireNoteAccessForStudent` already documents admin support ("Admin (SUPER_ADMIN | SCHOOL_ADMIN): tenant scope only"), and `NoteThread` (the presentational component both admin surfaces already use) already has an `"admin"` empty-state copy entry, reached by simply omitting the `audience` prop — admin was designed in from the start, just never wired to the thread API.
2. **Cycle C's empty-week copy never reached admin.** `WeekGrid`'s `emptyWeekMessage` prop is only passed by the teacher and parent call sites. Admin's two WeekGrid instances (school + home tabs on the monitoring detail page) and the dossier card's one instance still render the pre-Cycle-C silent wall of dashes on a genuinely empty week.
3. **Admin's journal detail pages predate the shared detail-page chrome.** Both `students/[id]/page.tsx` and `classes/[id]/page.tsx` hand-roll their own back-link + `PageHeader` and (on the student page) a bespoke skeleton stack, instead of `DetailPageHeader`/`DetailPageSkeleton` — the primitives 6 other admin detail modules already standardized on. Visible margin/typography shift when an admin moves between the journal detail page and any other detail page in the same session.
4. **Double page padding.** `app/admin/student-journal/page.tsx` (the category/indicator template editor) wraps its own content in `px-page-x py-page-y`, on top of the identical padding `app/admin/layout.tsx`'s `<main>` already applies — a visible margin jump moving between this tab and its siblings (Monitoring, Attendance).

None of this touches teacher, parent, the note/thread API, or the database — it wires two already-built, already-authorized primitives (`NoteThreadPanel`, `emptyWeekMessage`) into admin, and swaps two hand-rolled headers for the shared components.

## Spec

- [x] Both admin journal surfaces (`students/[id]/page.tsx`, `student-journal-block.tsx`) render the full note thread via `NoteThreadPanel`, not `weekData.notes` — a note written any number of weeks ago is visible on the current week's view.
- [x] Admin's delete-a-note flow (admin can delete any note; teacher/parent cannot delete admin's) keeps working exactly as today — same confirm copy, same endpoint, same "Ya, Nonaktifkan" dialog — just triggers a `NoteThreadPanel` refetch instead of a local `weekData.notes` splice.
- [x] All 3 admin `WeekGrid` instances pass a staff-worded `emptyWeekMessage`, matching Cycle C's teacher copy ("Belum ada centang di pekan ini.") since both admin surfaces show the same school/home ticks a teacher fills.
- [x] `students/[id]/page.tsx` and `classes/[id]/page.tsx` render their header via `DetailPageHeader` and (where applicable) `DetailPageSkeleton`, matching the other 6 admin detail modules. No visual regression to the week-nav / edit-toggle actions already in the header.
- [x] `student-journal/page.tsx` no longer double-applies page padding.
- [x] No API, schema, or route changes. No teacher/parent-facing change.
- [x] Gates green: `npm run build`, `npx vitest run`, `verify-api-auth.sh`, `verify-rls-coverage.sh`, `audit-docs.sh`; Playwright local pass or CI-deferral recorded.

### Non-goals

- No unread-badge UI for admin (the read watermark is written as a side effect of `NoteThreadPanel` mounting — same as teacher/parent — but nothing in this cycle surfaces a count anywhere in admin; that's separate, unscoped work).
- No reply-threading, no push/email notification — unchanged, out of scope everywhere per Cycle B.
- No change to `classes/[id]/page.tsx`'s roll-up table, search, or pagination — header only.
- No retrofit of either page to the dossier shell (Recipe 2b) — that's a separate, larger decision tracked in `docs/cycles/2026-09-03-detail-page-pattern-decision.md` and not this cycle's concern; both pages stay Recipe 2a, just on the shared 2a header/skeleton primitives.

### Assumptions

1. `NoteThreadPanel`'s `audience` prop can be made optional (`"teacher" | "parent" | undefined`) rather than adding a new `"admin"` literal — `NoteThread` underneath already treats "no audience" as the admin case (its own doc comment: "Admin callers omit the prop"), so widening the type to match is the smaller, more consistent change than inventing a third literal.
2. `markReadOnOpen` stays at `NoteThreadPanel`'s default (`true`) for both admin surfaces — the watermark upsert is idempotent and per-reader, so writing it for an admin view is harmless even with no admin-facing badge to clear yet, and it means an admin unread-count feature later needs no data migration.
3. Admin's own note-delete endpoint (`/api/student-journal/admin/notes/[id]`) is unchanged — this cycle does not consolidate it with the teacher/parent note API, only re-points where its result goes (a `NoteThreadPanel` reload instead of a `weekData.notes` filter).
4. The dossier card's "Catatan pekan ini" heading becomes "Catatan" (drops "pekan ini") — the thread it now shows is no longer week-scoped, and the old heading would misdescribe it.

## Tasks

- [x] **T1 — Widen `NoteThreadPanel` for admin.** `components/student-journal/note-thread-panel.tsx`: make `audience` optional, pass it straight through to `NoteThread` unchanged (already accepts `undefined`). *Acceptance:* teacher/parent call sites unchanged (still pass their literal); existing panel tests still pass.
- [x] **T2 — `app/admin/student-journal/students/[id]/page.tsx`.** Replace the Catatan tab's direct `NoteThread` + `weekData.notes` with `NoteThreadPanel` (no `audience`, `studentId`, a `reloadToken` state bumped after a successful delete, `canEdit={() => true}`, `onDelete` unchanged). Add `emptyWeekMessage="Belum ada centang di pekan ini."` to both WeekGrid instances (school + home tabs). Replace the hand-rolled back-link + `PageHeader` with `DetailPageHeader`, and the bespoke loading stack with `DetailPageSkeleton`. *Acceptance:* a note from 3+ weeks ago renders on the current week's Catatan tab; delete still works and refreshes the thread; an empty school/home week shows the copy instead of a bare grid; header/loading visually match the pattern on `students/[id]` (the main dossier) and `guardians/[id]`.
- [x] **T3 — `components/admin/student-journal-block.tsx`.** Replace the hand-rolled `<ul>` notes list (and the now-unused `notes` field read off the week payload) with `NoteThreadPanel` (no `audience`, `studentId`, read-only — no `onEdit`/`onDelete`/`canEdit`). Add `emptyWeekMessage="Belum ada centang di pekan ini."` to its WeekGrid. Rename the section heading from "Catatan pekan ini" to "Catatan". *Acceptance:* the dossier's Buku Penghubung card shows the same full thread as T2's page, not just the viewed week; empty-week grid shows the copy; "Buka Buku Penghubung lengkap →" link is unchanged.
- [x] **T4 — `app/admin/student-journal/classes/[id]/page.tsx`.** Replace the hand-rolled back-link + `PageHeader` with `DetailPageHeader`. *Acceptance:* header visually matches T2's page and the rest of the admin detail modules; roll-up table, search, and week-nav actions unchanged.
- [ ] **T5 — `app/admin/student-journal/page.tsx`.** Drop the page-level `px-page-x py-page-y`, keep `space-y-section`. *Acceptance:* no double inset vs. `layout.tsx`'s `<main>`; visually identical to the Monitoring/Attendance tabs' margins.

T1 is a dependency for T2/T3 (both consume the widened prop) but is a one-line type change with no behavior change to existing callers — sequenced first, then T2-T5 touch disjoint files and are independent of each other.

## Implementation

- Subagent plan: driver=claude-sonnet-5, dirty-work=claude-sonnet-5. T1 and T5 are one-line mechanical edits done inline by the driver (fan-out overhead exceeds the benefit for a single-line type widening / class-name removal). T2, T3, T4 touch disjoint files and were dispatched in parallel to three dirty-work-tier subagents, each given the exact pre-specced change; driver reviewed and committed the results rather than implementing them.
- T1: `components/student-journal/note-thread-panel.tsx` — `audience` widened from required to optional; passthrough to `NoteThread` unchanged (already accepts `undefined`). Type-only change, no markup — nothing new to cross-check against `design-system.html` for this task specifically; the design-system cross-check for the actual rendered surfaces (T2/T3) lands in the Verification section once they land.
- T2: `app/admin/student-journal/students/[id]/page.tsx` + `__tests__/page.test.tsx` — Catatan tab now renders `NoteThreadPanel` instead of `NoteThread` fed by `weekData.notes`; added `noteReloadToken` state bumped on successful delete (replacing the old local `weekData.notes` splice); `emptyWeekMessage` added to both WeekGrid instances; header/loading swapped to `DetailPageHeader`/`DetailPageSkeleton`. Removed the now-unused `Note` type, `notes` field, `PageHeader`/`ArrowLeft`/`Link` imports. Cross-checked `design-system.html` — `DetailPageHeader`/`DetailPageSkeleton`/`WeekGrid`/`NoteThreadPanel` are all existing shared primitives used exactly as their other callers use them; no new component or token.
- T3: `components/admin/student-journal-block.tsx` + `app/admin/students/[id]/__tests__/dossier-sections.test.tsx` — hand-rolled `<ul>` notes list replaced with a read-only `NoteThreadPanel` (no audience/edit/delete props) under a "Catatan" heading; `emptyWeekMessage` added to its WeekGrid; removed the now-unused `Note` type, `ROLE_LABELS` map, and `notes` field. Cross-checked `design-system.html` — same shared primitives as T2, read-only usage matches the card's own documented intent.
- T4: `app/admin/student-journal/classes/[id]/page.tsx` — hand-rolled back-link + `PageHeader` replaced with `DetailPageHeader`; DataTable/search/pagination/week-nav untouched. Cross-checked `design-system.html` — `DetailPageHeader` used identically to T2 and the other 6 admin detail modules.

## Verification

## Ship Notes
