# Journal User-Harm Pair (repo-audit P0.3)

## Context
Executes **P0.3** from `docs/cycles/2026-07-19-repo-audit.md`: the two "real user harm" journal items open since June — T8 (teacher checklist taps lost when Bu Sari navigates away before pressing `Simpan`) and T19 (journal notes/audit rows show roles or UUIDs instead of human author identity) — plus the admin `Simpan Perubahan` placebo button. Adopts the rescued `feat/journal-draft-audit` WIP (cherry-picked; spec + `lib/student-journal/note-metadata.ts` + tests + partial teacher per-tap rewrite). CTO review of the WIP found: (a) `entry/page.tsx` passes a `pendingCells` prop `ClassDayGrid` does not yet accept — does not compile; (b) page file exports named helpers that belong in `lib/`; (c) Tasks 2–4 unstarted.

Exploration facts baked into Tasks: `/api/student-journal/entries/batch` rate limit is 30/min per teacher — too low for per-tap saves, must be raised; teacher (`students/[id]/week`) and admin (`admin/students/[id]/week`) week routes omit `authorUserId` (parent route has it); no route returns author names or `updatedAt`; author-side note POST/PUT/DELETE and entries batch write **no** `StudentJournalAudit` rows (only admin entry PUT and admin note DELETE do); admin detail page imports `NoteThread` but renders a local `NoteRow` instead; the audit tab fetches `changedByUserId` but never renders an actor.

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
- [x] **Task 1: Teacher per-tap class-day save** — Finish the WIP: move the exported helpers (`getJournalCellKey`, `applyJournalCellValue`, `shouldApplyJournalSaveResult`) from `app/teacher/student-journal/entry/page.tsx` into `lib/student-journal/optimistic-save.ts`; add `pendingCells?: Set<string>` support to `components/student-journal/class-day-grid.tsx` (per-cell saving affordance); raise `entries/batch` rate limit from 30/min to a per-tap-safe ceiling (300/min per teacher, key unchanged). Acceptance: unit test proves failure revert and stale-response guard; build compiles.
- [x] **Task 2: Note author/audit API enrichment** — Wire `lib/student-journal/note-metadata.ts` into teacher/parent/admin week routes (add `authorUserId` + `updatedAt` to selects where missing, return `authorName`) and admin audit route (`changedByName`); add `NOTE` audit-row writes (CREATE/UPDATE/DELETE, `$transaction`) to `notes/route.ts` POST and `notes/[id]/route.ts` PUT/DELETE. Acceptance: Vitest route coverage proves author names and `NOTE` audit rows for create/update/delete.
- [ ] **Task 3: Shared note thread + admin detail cleanup** — Extend `components/student-journal/note-thread.tsx`, replace admin local `NoteRow`, show audit actor names, and remove admin `Simpan Perubahan` placebo controls while preserving direct optimistic cell edits. Acceptance: UI tests or focused component/helper tests prove rendered author/name/timestamp and no placebo save path.
- [ ] **Task 4: Verification, docs, and ship readiness** — Update teacher/admin JTBD journal jobs if behavior changed, record design-system cross-check, run gates, add Playwright pass/defer note, fill Ship Notes, and perform final review. Acceptance: `npm run build`, `npx vitest run`, audit-docs, and Playwright local pass or documented CI deferral are recorded.

## Implementation

- **T1 (per-tap save)** — WIP page rewrite adopted from `feat/journal-draft-audit` (cherry-pick), then finished: helpers (`GridState`, `getJournalCellKey`, `applyJournalCellValue`, `shouldApplyJournalSaveResult`) moved from the page into new `lib/student-journal/optimistic-save.ts` (page files export no extras); `components/student-journal/class-day-grid.tsx` gained optional `pendingCells?: Set<string>` — pending indicator buttons render `opacity-60 animate-pulse` (existing utilities, no new colors) and stay tappable (requestId guard handles re-taps); `app/api/student-journal/entries/batch/route.ts` rate limit raised 30→300/min, same per-teacher key. Sticky `Simpan` bar + `pb-32` removed. New `tests/student-journal/optimistic-save.test.ts` (8 tests: key format, immutability, sibling preservation, stale-response guard).
- **T2 (author/audit APIs)** — teacher (`students/[id]/week`), admin (`admin/students/[id]/week`), parent (`children/[id]/week`) note selects now include `authorUserId` + `updatedAt`; responses enriched with `authorName` via `enrichNotesWithAuthorMetadata`. `admin/audit` rows enriched with `changedByName`. Author-side note mutations now write `StudentJournalAudit` NOTE rows in `$transaction` with the mutation: POST `notes` → CREATE (afterJson snapshot), PUT `notes/[id]` → UPDATE (before/after body), DELETE → DELETE (before status). Response shapes additive only. New tests: `api-teacher-week-author-name`, `api-admin-audit-changer-name`, `api-notes-audit-writes`.

## Verification

- Between-task gate after T1+T2: `npm run build` green; `npx vitest run` 227 files passed / 2 skipped, 2175 passed / 42 todo (+22 new tests vs staging baseline 2153).

## Ship Notes
