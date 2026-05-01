# Student Journal — Cross-Actor Audit + Gap Fix

## Context

The Student Journal (Buku Penghubung) module shipped in cycle `2026-04-21-student-journal` covering admin template config, teacher class-day entry, and parent home entry across three portals. A cross-actor audit (this cycle) traced every capability and surfaced gaps that erode the daily-use experience for teachers and parents:

- **Teacher cannot add a note from the class-day grid.** The compose-note dialog only lives on the student-week view (`app/teacher/student-journal/students/[id]/page.tsx`). Teachers running through 25 students daily must navigate per-student to leave context — friction that kills the loop.
- **`StudentJournalAudit` table has zero UI surface anywhere.** Every entry/note write is recorded but no role can see it. Admin overrides are invisible to the teacher who originally entered the data and to the parent who reads it.
- **English error copy leaked** into `entries/batch` API responses (`"Invalid JSON body"`, `"Invalid request body"`) — violates `voice.md`.
- **Parent week view has no empty state** when a child exists but the selected week has no entries — the `WeekGrid` renders blank, breaching `portal.md` Empty State Contract.
- **Category deactivation does not cascade to indicators** — child indicator rows remain `ACTIVE` at the DB level, filtered only at query time. Inconsistency invites future bugs.
- **`status` field is `String` not Prisma enum** on `StudentJournalNote/Category/Indicator` — type safety lives only in Zod, schema accepts anything.
- **Tenant scoping partial** on `entries/batch` — sub-queries rely on the teacher-class guard for cross-tenant safety instead of explicit `tenantId` where-clauses.

False alarms cleared by recon (NOT in scope, already shipped):
- Parent bottom-nav `BookHeart` tab — wired at `components/parent/bottom-nav.tsx:12`.
- Notes soft-delete — `DELETE /notes/[id]` correctly sets `status: "INACTIVE"`, no hard delete.
- Teacher edit own entries — `entries/batch` upsert allows repeat saves.

This cycle is one-mega-cycle full audit fix: capability gap (teacher add note from grid), audit visibility for non-admin roles, copy/voice pass, empty-state contract, schema consistency, and tenant scoping tighten.

## Spec

**Acceptance criteria:**

- [ ] Teacher on `app/teacher/student-journal/entry/page.tsx` (class-day grid) can click an "Tambah Catatan" affordance per student row, opens a dialog with date + body inputs, POSTs to `/api/student-journal/notes`, optimistically appends to a local notes-count badge.
- [ ] Teacher student-week page (`app/teacher/student-journal/students/[id]/page.tsx`) shows an "Diedit admin" badge on any entry whose latest `StudentJournalAudit` row has `entityType=ENTRY`, `action=UPDATE`, `changedByUserId` belonging to a `SCHOOL_ADMIN`/`SUPER_ADMIN`. Clicking the badge shows tooltip with timestamp + before/after `checked` value.
- [ ] Parent week view (`app/parent/student-journal/page.tsx`) shows the same "Diedit admin" badge on entries it displays.
- [ ] New `GET /api/student-journal/students/[id]/week` (and `children/[id]/week`) responses include the latest audit-edit summary per entry (one extra field per entry: `lastAdminEdit?: { changedAt, changedByName }` or null).
- [ ] All journal API error messages return Bahasa Indonesia strings. `entries/batch` no longer returns `"Invalid JSON body"` / `"Invalid request body"` — replaced with `"Body permintaan tidak valid"` / `"JSON tidak valid"`.
- [ ] Parent week view renders an EmptyState (`BookHeart` icon, copy "Belum ada catatan minggu ini", "Catatan akan muncul saat guru atau orang tua mengisi.") when the week has zero entries AND zero notes for the selected child.
- [ ] `PUT /api/student-journal/categories/[id]` with `status: "INACTIVE"` cascades-deactivates all child indicators in the same transaction. New unit test asserts the cascade.
- [ ] `StudentJournalNote.status`, `StudentJournalCategory.status`, `StudentJournalIndicator.status`, `StudentJournalTemplate.status` migrated from `String` to a shared `JournalStatus` Prisma enum (`ACTIVE | INACTIVE`). Migration is non-destructive (existing values preserved).
- [ ] `entries/batch` tenant scoping tightened — every Prisma `where` (indicator lookup, enrollment validation) includes explicit `tenantId: session.tenantId` in addition to the existing teacher-class guard.
- [ ] Voice/copy pass — every user-facing string on admin/teacher/parent journal pages reviewed against `.claude/standards/voice.md` (Indonesian, Islamic courtesy layer where appropriate, persona-correct register). Document changed strings in Implementation section.
- [ ] Frontend gate satisfied — Verification section cites `.claude/standards/design-system.html` §15 (Student Journal) for the new Add-Note-on-Grid affordance + audit badge.
- [ ] All existing tests still pass. New unit tests added for: (a) cascade-deactivate indicators on category, (b) audit-edit summary in week response, (c) tenant scoping on batch route.

**Non-goals:**

- No drag-reorder UI for indicators (schema already supports `order`; UI is nice-to-have, deferred).
- No new audit-log page for admin (`/admin/student-journal/monitoring` stays as class-completion view).
- No teacher self-edit constraint changes (repeat-save already works correctly per recon).
- No performance work (N+1, bundle analysis) — explicit non-goal per scope choice.
- No notes-per-indicator or notes-per-class features — scope is fixing existing surface, not adding new entities.

**Assumptions:**

1. The "Diedit admin" badge surfaces ONLY admin overrides (entries where `changedByUserId` is admin role). Teacher-self-edits are not flagged. Reason: teachers re-saving the grid is normal, not noteworthy.
2. Audit summary embedded in the week response is acceptable performance-wise for a ~5-day × ~25-indicator window (~125 entries). T4 contract caps it at exactly 2 Prisma queries (audit findMany + admin-user findMany) merged in app code — no per-row lookup, no N+1.
3. JSON-string-to-enum Prisma migration is safe because all existing rows hold either `"ACTIVE"` or `"INACTIVE"` values (verified via Q3/Q8 of recon). No data backfill needed.
4. Bahasa Indonesia error copy in API responses is acceptable for both UI consumption and dev-tools — frontend already shows toasts in Indonesian, so passing through is consistent.
5. The "Tambah Catatan" affordance on the class-day grid will be a small icon-button in the student-row header (not a per-cell button), reusing the existing `parent-note-dialog.tsx` shape adapted for teacher (or a new `teacher-note-dialog.tsx` if the existing one is too parent-specific).

## Tasks

Ordered. Each is committable independently. Dependencies marked.

- [x] **T1 — Prisma enum migration for `JournalStatus`.**
  - **Pre-migration data check (required):** run `SELECT DISTINCT status FROM "StudentJournalTemplate"` and same for `StudentJournalCategory`, `StudentJournalIndicator`, `StudentJournalNote` against staging DB. Confirm every distinct value is exactly `ACTIVE` or `INACTIVE` (case-sensitive). If any other value appears, normalize via a one-off `UPDATE` migration BEFORE generating the enum migration.
  - Add `enum JournalStatus { ACTIVE INACTIVE }` to `prisma/schema.prisma`. Change `status String @default("ACTIVE")` → `status JournalStatus @default(ACTIVE)` on `StudentJournalTemplate`, `StudentJournalCategory`, `StudentJournalIndicator`, `StudentJournalNote`.
  - Generate migration. Update `lib/validations/student-journal.ts` Zod schemas to use the enum literal. Update every callsite that passes `status: "ACTIVE" | "INACTIVE"` as a string to use `JournalStatus.ACTIVE | JournalStatus.INACTIVE` from `@prisma/client`. **Confirmed callsites that MUST be updated in the T1 commit (build will fail otherwise):**
    - `prisma/seed.ts` line 377 — `StudentJournalTemplate` create
    - `app/api/student-journal/entries/home/route.ts` line ~53 — indicator validation `status: "ACTIVE"`
    - `app/api/student-journal/entries/batch/route.ts` lines ~62-69 — indicator validation `status: "ACTIVE"` (T3 will further tighten tenant scoping; T1 only swaps the enum)
    - `app/api/student-journal/categories/[id]/route.ts` (T2 cascade callsite)
    - Any other `app/api/student-journal/**` route returned by `grep -r 'status: "ACTIVE"' app/api/student-journal prisma/seed.ts`
  - **Acceptance:** pre-migration `SELECT DISTINCT status FROM ...` output documented in Implementation section for all 4 tables; `npx prisma migrate dev` succeeds; `npm run build` (TypeScript check) green; `npx vitest run` green; `grep -r 'status: "ACTIVE"' app/api/student-journal prisma/seed.ts lib/validations/student-journal.ts` returns zero results.
  - **Depends on:** none. **Blocks:** T2, T3, T4 (all touch `status` typing).

- [x] **T2 — Cascade-deactivate indicators on category PUT.**
  - In `app/api/student-journal/categories/[id]/route.ts`: when PUT body sets `status: JournalStatus.INACTIVE`, wrap the update in `prisma.$transaction` and additionally `prisma.studentJournalIndicator.updateMany({ where: { categoryId: id }, data: { status: JournalStatus.INACTIVE } })`. When PUT sets `status: JournalStatus.ACTIVE`, do NOT auto-reactivate child indicators (admin must reactivate explicitly).
  - **Acceptance:** new unit test in `__tests__/api/student-journal/categories.test.ts` proves two concrete observable states: (a) after PUT `{status:'INACTIVE'}` on a category whose indicators are `ACTIVE`, `findMany({where:{categoryId}})` returns ALL child indicators with `status: 'INACTIVE'`; (b) after PUT `{status:'ACTIVE'}` on a category whose indicators are `INACTIVE` from step (a), `findMany({where:{categoryId}})` STILL returns all child indicators with `status: 'INACTIVE'` (no auto-reactivate). `npm run build && npx vitest run` green.
  - **Depends on:** T1.

- [x] **T3 — Tenant scoping tighten on `entries/batch`.**
  - In `app/api/student-journal/entries/batch/route.ts`: add explicit `tenantId: session.tenantId` to every Prisma `where` (indicator validation, enrollment validation). Replace English error strings with Indonesian: `"JSON tidak valid"`, `"Body permintaan tidak valid"`. Update any `status: "ACTIVE"` string literal in `where` clauses to `status: JournalStatus.ACTIVE`.
  - **Acceptance:** new unit test asserts cross-tenant indicator IDs are rejected even with a valid teacher-class guard. `npm run build && npx vitest run` green.
  - **Depends on:** T1 (status field is now an enum after T1; build will fail without enum import).

- [x] **T4 — Audit summary in week endpoints.**
  - Extend `app/api/student-journal/students/[id]/week/route.ts` and `app/api/student-journal/children/[id]/week/route.ts` response: per entry, attach `lastAdminEdit: { changedAt: Date, changedByName: string } | null`.
  - **Implementation contract — exactly two queries, no per-row lookups:**
    1. `prisma.studentJournalAudit.findMany({ where: { tenantId, entityType: 'ENTRY', action: 'UPDATE', entityId: { in: entryIds } }, orderBy: { changedAt: 'desc' } })` — fetch all audit rows for the visible entries in one query.
    2. `prisma.user.findMany({ where: { id: { in: distinctChangerIds }, role: { in: ['SCHOOL_ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, name: true } })` — resolve admin names + filter to admin-only changers in one query.
    3. Merge in application code: build a `Map<userId, name>` of admins, then for each entryId pick the first audit row (already sorted desc) whose `changedByUserId` is in the admin map. Attach as `lastAdminEdit`.
  - Note: `StudentJournalAudit` has no FK relation to `User` in Prisma, so `include: { user: true }` will not work — must use the two-query merge above.
  - **Acceptance:** new unit test asserts shape; admin-edited entry shows `lastAdminEdit`, teacher-saved entry shows `null`, teacher-edited (non-admin) entry shows `null`. Test asserts helper makes exactly 2 Prisma queries (audit findMany + user findMany) and zero per-entry lookups. `npx vitest run` green.
  - **Depends on:** T1.

- [ ] **T5 — "Diedit admin" badge in teacher + parent week views.**
  - Update `app/teacher/student-journal/students/[id]/page.tsx` and `app/parent/student-journal/page.tsx` (and any client component) to render a small `Pencil` icon when `entry.lastAdminEdit` is non-null.
  - **Touch-friendly interaction:** use Shadcn `Popover` (click/tap-to-open), NOT bare `Tooltip` — Radix Tooltip is hover-only and does not open on iOS/Android tap. Popover content shows: "Diedit admin pada {tanggal}" + admin name. Apply `aria-label="Entri ini diedit oleh admin pada {tanggal}"` to the icon button for screen readers.
  - **Frontend gate + commit-msg hook:** stage the cycle doc with the Implementation section updated to include "design-system.html §15" AND stage `README.md` with a one-line entry under the Student Journal module table noting "audit visibility (Diedit admin badge)" — both in the SAME commit as the `.tsx` files. Use commit subject `feat(student-journal):` so commit-msg narrow rule (which requires README staged for `feat:` touching `app/**`) passes cleanly.
  - **Acceptance:** Playwright smoke confirms popover opens on click/tap + content text correct; aria-label asserted; commit lands without hook rejection. Cite `design-system.html` §15 in Implementation section.
  - **Depends on:** T4.

- [ ] **T6 — "Tambah Catatan" affordance on teacher class-day grid.**
  - **Component decision:** parameterize existing `components/student-journal/parent-note-dialog.tsx` — add TWO optional props: `placeholder?: string` (default keeps current "Tulis catatan rumah di sini...") AND `title?: string` (default keeps current `mode === "create" ? "Tulis Catatan" : "Edit Catatan"`). Rename the file to `note-compose-dialog.tsx` and rename the exported component `ParentNoteDialog` → `NoteComposeDialog`. **Confirmed import callsite to update in the same commit:** `app/parent/student-journal/page.tsx` line 23 — change import path AND component name AND pass current placeholder explicitly. Do NOT fork a new `teacher-note-dialog.tsx` — DRY violation.
  - Add a per-student icon button (`MessageSquarePlus`, `size="icon"`, ghost variant) to the student-row header in `components/student-journal/class-day-grid.tsx`. Click opens `NoteComposeDialog` with `placeholder="Tulis catatan untuk {namaSiswa}..."`, `title="Tulis Catatan untuk {namaSiswa}"`, and date defaulted to the grid date. Submit POSTs to `/api/student-journal/notes`. Show success toast in Indonesian ("Catatan tersimpan"). Append optimistically to a small `(N catatan)` badge that links to student-week view. Add `aria-label="Tambah catatan untuk {namaSiswa}"` on the icon button.
  - **Mobile:** verify the icon button doesn't push the indicator grid past the row width on iPad portrait (768px) and on a 360px Android phone — teacher uses both. Document in Verification.
  - **Frontend gate + commit-msg hook:** stage cycle doc with `design-system.html §15` citation in the Implementation section AND stage `README.md` with a one-line entry under the Student Journal module table noting "teacher add-note affordance on class-day grid" — both in the SAME commit as the `.tsx` files. Use commit subject `feat(student-journal):` so commit-msg narrow rule passes.
  - **Acceptance:** Playwright spec in `e2e/teacher.spec.ts` adds a step that opens dialog, fills body, submits, verifies toast and notes-count badge increments. Mobile breakpoint check screenshot in Verification. Parent portal still works (regression check via existing parent journal Playwright spec).
  - **Depends on:** none (independent of T1–T5).

- [ ] **T7 — Parent week empty state for zero-entries weeks.**
  - In `app/parent/student-journal/page.tsx`: when selected child has zero entries AND zero notes for the visible week, render `EmptyState` with `BookHeart` icon, title `"Belum ada catatan minggu ini"`, description `"Catatan akan muncul saat guru atau orang tua mengisi."` Distinguish from no-children state (already exists at line 165–173).
  - **Commit subject:** use `fix(student-journal):` (bug-fix prefix per portal Empty State Contract gap) — avoids commit-msg narrow rule that requires README staged for `feat:` touching `app/**`. Cycle doc still must be staged (broad rule + frontend gate).
  - **Frontend gate:** stage cycle doc with `design-system.html §15` citation in the Implementation section in the SAME commit as the `.tsx` file.
  - **Acceptance:** Playwright parent spec covers the empty branch.
  - **Depends on:** none.

- [ ] **T8 — Indonesian voice/copy pass (scoped).**
  - **Scope cap (hard limit):** review only (a) every string introduced or changed in T3, T5, T6, T7, plus (b) a 10-string spot-sample per page tree (admin/teacher/parent journal pages — 30 strings total max). Do NOT walk every string in the four trees.
  - Cross-check sampled strings against `.claude/standards/voice.md` per-persona register (admin neutral-formal, teacher warm-direct, parent reassuring). Document each change in Implementation section as a table (file:line, before, after, reason).
  - **Acceptance:** every string introduced/changed in T3/T5/T6/T7 is Bahasa Indonesia and persona-correct; 30-string spot-sample documented in a table; any English leaks found in the spot-sample logged as a follow-up issue (NOT fixed in this cycle).
  - **Depends on:** T3, T5, T6, T7.

- [ ] **T9 — End-of-cycle gate + cycle doc finalization.**
  - Run `npm run build && npx vitest run && npx playwright test`. Fill Verification section (gate output, screenshots of badge + add-note dialog + parent empty state). README.md is already incrementally updated by T5 + T6 (per-task line-items). T9 only consolidates if needed — re-read README Student Journal section for coherence and add any missing summary line. Fill Ship Notes (Prisma migration name, no env changes, rollback = revert migration + revert PR).
  - **Acceptance:** all gates green; README coherent + cycle doc finalized; ready for `/ship`.
  - **Depends on:** T1–T8.

## Implementation

- **T4 — Audit summary in week endpoints.**
  - `lib/student-journal/audit.ts` — added `resolveLastAdminEditByEntryId(tenantId, entryIds)` helper. Exactly 2 Prisma queries: audit `findMany` filtered to `entityType=ENTRY, action=UPDATE, entityId in [...]` ordered desc by `changedAt`, then user `findMany` filtered to `SCHOOL_ADMIN | SUPER_ADMIN` for distinct changers. Merges in app code via Map. Falls back to "Admin" label when `User.name` is null. JSDoc documents the demoted-admin caveat (badge disappears if role flipped to TEACHER post-edit; intentional, fix path noted).
  - `app/api/student-journal/students/[id]/week/route.ts` — calls helper after entries fetched, decorates each entry with `lastAdminEdit: {changedAt, changedByName} | null`.
  - `app/api/student-journal/children/[id]/week/route.ts` — same pattern across schoolEntries + homeEntries (one helper call covers both).
  - `tests/student-journal/audit-summary.test.ts` — new, 7 cases (zero entries skips DB; no audit rows = 1 query no user lookup; admin vs teacher distinction; role filter shape; where-clause shape; null-name fallback to "Admin"; multiple-edits-pick-latest).
  - `tests/student-journal/audit.test.ts` — added `vi.mock("@/lib/db")` since audit.ts now imports prisma at module level (caught by failing test on first run).
  - Verified: `npx vitest run` 823 passed (+7) / 42 todo / 2 skipped. Code-reviewer initially flagged spec acceptance text claiming "≤3 prisma queries total per call" — corrected to "helper makes exactly 2 queries; no per-entry lookup" since route-level total includes pre-existing categories/entries/notes fetches.

- **T3 — Tenant scoping tighten + Indonesian errors on `entries/batch`.**
  - `app/api/student-journal/entries/batch/route.ts` — added defensive nested `category.template.tenantId` filter on indicator findMany and `student.tenantId` filter on enrollment findMany. Pre-T3 was sound (template.tenantId is `@unique`, so transitive scoping held), but the explicit filters document the trust boundary and survive future refactors.
  - English error strings replaced: `"Invalid JSON body"` → `"JSON tidak valid"`, `"Invalid request body"` → `"Body permintaan tidak valid"`, `"Too many requests"` → `"Terlalu banyak permintaan"`, `"Invalid indicators"` → `"Indikator tidak valid"`, `"One or more students not in class"` → `"Beberapa siswa tidak terdaftar di kelas ini"`.
  - `app/api/student-journal/entries/home/route.ts` — parity fix: added `category.template.tenantId` defensive filter on indicator findMany (caught by code-reviewer as asymmetric hardening).
  - New test: `tests/student-journal/api-entries-batch-tenant-scope.test.ts` — 5 cases (indicator where contains template.tenantId, enrollment where contains student.tenantId, cross-tenant indicator → 400, Indonesian copy on bad JSON, Indonesian copy on missing enrollments).
  - Verified: `npx vitest run` 816 passed (+5) / 42 todo / 2 skipped.

- **T2 — Cascade-deactivate indicators on category PUT.**
  - `app/api/student-journal/categories/[id]/route.ts` — when `parsed.data.status === JournalStatus.INACTIVE`, wraps category update + indicator `updateMany` in `prisma.$transaction`. Indicator `updateMany` filtered to `{ categoryId, status: ACTIVE }` so already-INACTIVE rows are NOT touched (preserves their `updatedAt` audit signal — caught in code review). Reactivation (status: ACTIVE) and non-status updates (e.g. `order` only) skip the transaction entirely — no auto-reactivate cascade.
  - New test: `tests/student-journal/api-categories-cascade.test.ts` — 4 cases (deactivate cascades, reactivate doesn't, non-status doesn't, cross-tenant 404). Mocks via `vi.hoisted` to avoid hoisting race.
  - Verified: `npx vitest run tests/student-journal/api-categories-cascade.test.ts` 4/4 pass; full suite 811 passed (+4) / 42 todo / 2 skipped.

- **T1 — `JournalStatus` enum migration.**
  - Schema: added `enum JournalStatus { ACTIVE INACTIVE }`; changed `status` field from `String` to `JournalStatus` on `StudentJournalTemplate`, `StudentJournalCategory`, `StudentJournalIndicator`, `StudentJournalNote`. `StudentJournalEntry` and `StudentJournalAudit` unchanged (no `status` field).
  - Migration: `prisma/migrations/20260501000000_student_journal_status_enum/migration.sql` — hand-written (Prisma `migrate dev` blocked by pre-existing RLS shadow-DB issue). Uses `ALTER COLUMN ... TYPE "JournalStatus" USING "status"::"JournalStatus"` with default-drop/restore. Applied to staging DB via `prisma migrate deploy`.
  - Pre-migration `SELECT DISTINCT status` per table (run 2026-05-01 against staging DB):
    - `StudentJournalTemplate` — 1 row, all `ACTIVE`
    - `StudentJournalCategory` — 7 rows, all `ACTIVE`
    - `StudentJournalIndicator` — 10 rows, all `ACTIVE`
    - `StudentJournalNote` — 51 rows, all `ACTIVE`
    No `INACTIVE` or out-of-enum values existed; cast was safe.
  - Callsite sweep (10 routes + 1 seed file):
    - `app/api/student-journal/categories/route.ts` — narrowed URL `?status` param to `JournalStatus | undefined`; rejects unknown values with 400 (was: silently fell back to `ACTIVE`); removed redundant `status: "ACTIVE"` from template upsert (default applies).
    - `app/api/student-journal/template/route.ts` — removed redundant `status: "ACTIVE"` from upsert.
    - `app/api/student-journal/entries/batch/route.ts` — `JournalStatus.ACTIVE` on indicator + nested category filter (lines 64, 67).
    - `app/api/student-journal/entries/home/route.ts` — `JournalStatus.ACTIVE` on indicator filter.
    - `app/api/student-journal/admin/class-roll-up/route.ts` — `JournalStatus.ACTIVE` on indicator + nested category (lines 70, 72).
    - `app/api/student-journal/admin/classes/route.ts` — `JournalStatus.ACTIVE` on indicator + category (lines 53, 55).
    - `app/api/student-journal/admin/students/[id]/week/route.ts` — 5 sites (category SCHOOL + indicators + category HOME + indicators + note).
    - `app/api/student-journal/students/[id]/week/route.ts` — 3 sites (category + indicators + note).
    - `app/api/student-journal/children/[id]/week/route.ts` — 5 sites (category SCHOOL + indicators + HOME + indicators + note).
    - `app/api/student-journal/class-grid/route.ts` — 2 sites (category + indicators).
    - `prisma/seed.ts` — 1 site (template create, line 378).
  - Non-journal callsites left as plain `"ACTIVE"` strings: `StudentEnrollment.status`, `ClassSection.status`, `Student.status` — these models still have `String` status fields. Verified disambiguation by reading each file's Prisma model context.
  - Zod schemas (`lib/validations/student-journal.ts`) unchanged: `z.enum(["ACTIVE", "INACTIVE"])` produces literal-narrowed type assignable to `JournalStatus`.
  - `tsconfig.tsbuildinfo` was modified by build but is gitignored — untracked via `git rm --cached`.

## Verification

- **T4 gates passed:**
  - `npm run build` — green.
  - `npx vitest run` — 823 passed (+7 from T4), 42 todo, 2 skipped.
  - Code-reviewer flagged: (a) demoted-admin silent-drop semantics — addressed via JSDoc caveat on helper; (b) spec acceptance "≤3 queries total per call" inaccurate — corrected acceptance text to match actual helper contract (2 queries).

- **T3 gates passed:**
  - `npm run build` — green.
  - `npx vitest run` — 816 passed (+5 from T3), 42 todo, 2 skipped.
  - Code-reviewer (superpowers, security-sensitive) cleared T3; noted entries/home parity gap → fixed in same commit.

- **T2 gates passed:**
  - `npm run build` — green.
  - `npx vitest run` — 93 test files / 811 tests passed (+4 from T2), 42 todo, 2 skipped.
  - Code-reviewer caught `updateMany` would touch already-INACTIVE rows + drift their `updatedAt` — fixed before commit by adding `status: ACTIVE` to the where clause.

- **T1 gates passed:**
  - `npm run build` — green (Next.js 16 production build, all routes compile).
  - `npx vitest run` — 92 test files / 807 tests passed, 42 todo, 2 skipped (pre-existing).
  - `grep -rn 'status: "ACTIVE"' app/api/student-journal lib/validations/student-journal.ts` — only non-journal-model lines remain (StudentEnrollment, ClassSection — still `String` per schema). Acceptance met.
  - Pre-migration `SELECT DISTINCT status` confirmed clean before `migrate deploy` ran.

## Ship Notes

<!-- filled by /ship -->
