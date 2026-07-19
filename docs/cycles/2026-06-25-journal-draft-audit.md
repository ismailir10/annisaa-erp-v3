# Journal Draft Audit

## Context
Recent UAT no longer shows active blocker/major failures on the teacher journal happy path, but the June 24 UI sweep deferred two journal items with real user harm: teacher checklist taps can still be lost when Bu Sari navigates away before pressing `Simpan`, and journal notes/audit rows still show roles or UUIDs instead of human author identity. The June 4 UAT also left admin Buku Penghubung unexercised, so this cycle treats admin journal as an explicit verification target instead of assuming parity from teacher/parent coverage.

## Spec
- [ ] Teacher class-day journal entry persists each checklist tap immediately through `/api/student-journal/entries/batch` with a single-entry payload; the sticky bottom `Simpan` bar is removed so there is no hidden batch-save contract.
- [ ] Teacher class-day optimistic save reverts the tapped cell and checked count on 4xx/5xx/network failure, with a visible toast; rapid repeat taps settle to the latest visible state without stale responses overwriting newer user intent.
- [ ] Admin student-journal detail removes the placebo `Simpan Perubahan` success path; existing per-cell admin edits remain optimistic, revert on failure, and keep the audit affordance.
- [ ] Notes across teacher, parent, and admin student-journal views use shared `<NoteThread>` rendering with author initials/avatar, author name, role badge, journal date, and created timestamp.
- [ ] Student-journal week APIs return `authorUserId`, `authorName`, `createdAt`, and `updatedAt` for notes on teacher, parent, and admin routes; admin audit route returns `changedByName` alongside `changedByUserId`.
- [ ] Note create/update/delete paths write `StudentJournalAudit` rows for `NOTE` changes where they do not already; admin note delete keeps audit coverage and includes human actor name in the audit tab.
- [ ] Focused tests cover note author metadata/audit helpers and teacher optimistic-save state behavior; Playwright coverage is added only if deterministic local selectors/fixtures already exist.
- [ ] `design-system` cross-check recorded for student-journal UI changes; no new hardcoded arbitrary colors or one-off note row implementation.

Non-goals:
- No schema migration or immutable historical name snapshot in this cycle; actor display resolves from existing `User` rows, with fallback copy for missing names.
- No teacher per-student week editing beyond the current class-day checklist flow.
- No admin creation of missing journal entries from empty cells; existing V1 behavior remains explicit.
- No broad UI sweep leftovers outside student-journal T8/T19.

Assumptions:
- `StudentJournalNote.authorUserId` and `StudentJournalAudit.changedByUserId` always point to `User.id` in the same tenant for active journal rows; missing/deleted users can render fallback names.
- Existing `/api/student-journal/entries/batch` can serve per-tap saves with a single-entry payload after rate-limit tuning, without a new endpoint.
- Parent own-note edit/delete continues to rely on `authorUserId` from the week API.

## Tasks
- [ ] **Task 1: Teacher per-tap class-day save** — Modify `app/teacher/student-journal/entry/page.tsx` and `components/student-journal/class-day-grid.tsx` so each toggle saves immediately, tracks pending cells, ignores stale responses, removes sticky `Simpan`, and reverts on failure. Acceptance: unit/component test proves failure revert and stale-response guard.
- [ ] **Task 2: Note author/audit API enrichment** — Add shared student-journal note/audit metadata helpers and wire teacher, parent, admin week routes plus admin audit route and note mutation routes. Acceptance: Vitest route/helper coverage proves author names and `NOTE` audit rows for create/update/delete.
- [ ] **Task 3: Shared note thread + admin detail cleanup** — Extend `components/student-journal/note-thread.tsx`, replace admin local `NoteRow`, show audit actor names, and remove admin `Simpan Perubahan` placebo controls while preserving direct optimistic cell edits. Acceptance: UI tests or focused component/helper tests prove rendered author/name/timestamp and no placebo save path.
- [ ] **Task 4: Verification, docs, and ship readiness** — Update teacher/admin JTBD journal jobs if behavior changed, record design-system cross-check, run gates, add Playwright pass/defer note, fill Ship Notes, and perform final review. Acceptance: `npm run build`, `npx vitest run`, audit-docs, and Playwright local pass or documented CI deferral are recorded.

## Implementation

## Verification

## Ship Notes
