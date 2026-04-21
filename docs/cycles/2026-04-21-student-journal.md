# Student Journal (Buku Penghubung)

> Cycle doc for the Student Journal feature. Written 2026-04-21 by CTO (Opus 4.7) via `/brainstorming`. Approved design before task breakdown. Implementation to follow via `/build` with subagent dispatch for independent slices.

## Context

An Nisaa' School ERP uses a paper "Buku Penghubung" today — a weekly booklet where the homeroom teacher ticks each student's daily Ibadah, Perilaku, and Akademis indicators (checkmarks Mon-Fri) and signs per day, with a free-form "Catatan Guru" section for ad-hoc notes that parents read at home. Parents currently have no structured way to signal what happened at home.

Digitising this replaces a paper artefact parents and teachers both rely on and unlocks:
- Teachers stop losing books or re-copying missed days.
- Parents see school-side signals on the parent portal without waiting for the physical book.
- School admin (principal / kepala sekolah) gets oversight across classes without flipping through stacks of booklets.

**Scope decisions locked during brainstorming (2026-04-21):**

| # | Decision | Rationale |
|---|----------|-----------|
| Q1 | **Bi-directional** — school side (teacher fills) + home side (parent fills, optional). | Matches real buku penghubung intent; parent-optional because parents rarely have time. |
| Q2 | **Admin-configurable template per tenant** (categories + indicators, not hardcoded). | Matches repo's ERPNext-style CRUD standard; programs reuse one template. |
| Q3 | **Daily class-day batch entry by teacher** (grid: students × indicators for one day). | Reuses existing `class-attendance` muscle memory; fastest for 20-student class. |
| Q4 | **Per-day signature implicit via audit trail** (no separate signature field); notes as lightweight thread per student per date. | Avoids a redundant signature UI; `recordedByUserId` + `createdAt` is the signature. |
| Q5 | **One template, `scope` enum (SCHOOL / HOME)** — parent side uses same template model. | One CRUD surface for admin (tabs); no duplicated indicator schema. |
| Q6 | **Admin has full visibility + edit rights** over all entries and notes; every admin write produces an audit row. | Principals need correction authority for parent-teacher conferences; audit preserves trust. |

**Naming:** product name remains "Buku Penghubung" (Indonesian, user-facing). All code, routes, models, and identifiers use English (`student-journal`, `StudentJournalEntry`, etc.) per user request 2026-04-21.

---

## Spec

### Acceptance Criteria

#### Data Model (T1)

- [ ] Six Prisma models added, all tenant-scoped, all with `status ACTIVE|INACTIVE` except `StudentJournalEntry` (soft-delete via `status`, not hard-delete):
  - `StudentJournalTemplate` — singleton per tenant, linked optionally to `AcademicYear`.
  - `StudentJournalCategory` — `templateId`, `scope (SCHOOL|HOME)`, `name`, `order`, `status`.
  - `StudentJournalIndicator` — `categoryId`, `label`, `order`, `status`.
  - `StudentJournalEntry` — `(tenantId, studentId, classSectionId, indicatorId, date, checked, scope, recordedByUserId)` with `@@unique([studentId, indicatorId, date, scope])`.
  - `StudentJournalNote` — `(tenantId, studentId, date, authorUserId, authorRole, body, status)`; soft-delete only.
  - `StudentJournalAudit` — `(tenantId, entityType, entityId, action, beforeJson, afterJson, changedByUserId, changedAt)` for admin write trail.
- [ ] Enums: `StudentJournalScope { SCHOOL, HOME }`, `StudentJournalAuditAction { CREATE, UPDATE, DELETE }`, `StudentJournalAuditEntity { ENTRY, NOTE }`.
- [ ] Indexes: `(tenantId, classSectionId, date)` on `Entry` for class-day grid; `(tenantId, studentId, date)` on `Entry` and `Note` for student week view.
- [ ] Zod schemas in `lib/validations/student-journal.ts` covering template create, category CRUD, indicator CRUD, entry batch (array of `{ indicatorId, checked }`), note body (≤2000 chars).
- [ ] Migration runs clean on fresh DB and on existing staging DB.

#### Seed (T2)

- [ ] Idempotent seed extends `prisma/seed.ts`:
  - Creates one `StudentJournalTemplate` per existing tenant if missing.
  - SCHOOL-scope categories: **Ibadah** (Tahfizul Qur'an, Qiro'atul Qur'an, Membawa Infaq, Praktek Sholat Subuh Berjama'ah), **Perilaku** (9 items from image: Datang tepat waktu, Berpakaian lengkap dan rapih, Patuh dan santun pada guru, Salam dan jabat tangan dengan guru, Membuang sampah pada tempatnya, Bersikap baik kepada teman, Berkata baik dan jujur, Tertib pada saat belajar, Membawa Buku Penghubung), **Akademis** (Semangat mengikuti pelajaran, Menyelesaikan tugas, Merapihkan alat tulis).
  - HOME-scope categories: **Ibadah Rumah** (Sholat 5 waktu, Mengaji / tilawah, Doa harian), **Akhlak Rumah** (Membantu orang tua, Berkata baik, Merapihkan kamar, Tidur tepat waktu).
  - Re-running seed does not duplicate categories or indicators.

#### Admin — Template Config (T3)

- [ ] `GET /api/student-journal/template` returns current tenant template (create on first read if missing).
- [ ] `GET/POST/PUT /api/student-journal/categories` with `?scope=SCHOOL|HOME` filter.
- [ ] `POST/PUT /api/student-journal/indicators`.
- [ ] Admin page `/admin/student-journal` with title "Buku Penghubung — Template":
  - Tabs: `Sekolah` / `Rumah` (scope switch).
  - Accordion per category; Indicators listed inside with drag-handle reorder.
  - "Tambah Kategori" button opens Shadcn Dialog with `Field` + `Input` (Indonesian labels: Nama Kategori, Urutan).
  - Category row: edit name inline, drag to reorder, ⋮ dropdown with Deactivate (soft delete).
  - Indicator row: edit label inline, drag to reorder, ⋮ dropdown with Deactivate.
  - Status filter on category list: Semua / Aktif / Tidak Aktif.
  - All follows [CLAUDE.md](../../CLAUDE.md) CRUD Standard: ConfirmDialog for destructive, `toast.success/error`, no hard delete.

#### Teacher — Entry Flow (T4 + T5 + T6)

- [ ] `GET /api/student-journal/class-grid?classSectionId=&date=` returns `{ students[], indicators[] (school scope, active), entries[] (pre-fill) }`. Auth: `TEACHER` role AND teacher has active `TeachingAssignment` for `classSectionId`.
- [ ] `POST /api/student-journal/entries/batch` upserts an array of entries for one class-day; idempotent (re-save same day updates existing rows, no duplicates via the unique constraint).
- [ ] `/teacher/student-journal` (mobile, max-w-md):
  - Pick assigned class (dropdown of `TeachingAssignment` rows).
  - Pick date (default today; block future dates).
  - CTA "Isi Penghubung" routes to entry page.
- [ ] `/teacher/student-journal/entry` renders class-day grid:
  - One student per row (tap to expand the indicator checklist below; sticky save bar at the bottom).
  - Tap indicator to toggle; visual state reflects `checked` vs unchecked.
  - "Simpan" button runs batch upsert, shows `toast.success("Tersimpan")`, stays on page.
  - Skeleton loading; `EmptyState` if no assigned class.
- [ ] `/teacher/student-journal/students/[id]`:
  - Week grid read-only (Mon-Fri × school indicators) with teal check for checked.
  - Week picker (prev / next / this week).
  - Notes thread: list of `{ date, authorRole, body }` sorted desc.
  - "Tambah Catatan" Dialog: date picker + textarea; `POST /api/student-journal/notes`.
  - Teacher can edit own notes: `PUT /api/student-journal/notes/[id]` (guarded to `authorUserId === session.userId`).

#### Parent — School View + Home Fill (T7 + T8)

- [ ] New bottom-nav tab in `/parent` layout: icon `BookHeart` + label **Penghubung**, between Kehadiran and Rapor. Matches teacher pattern: teal underline active, Framer Motion `layoutId`.
- [ ] `/parent/student-journal`:
  - Child selector (if guardian has multiple children).
  - Week picker.
  - Tabs: `Di Sekolah` / `Di Rumah` / `Catatan`.
- [ ] `GET /api/student-journal/children/[id]/week?weekStart=` returns `{ school: Entry[], home: Entry[], notes: Note[] }`. Auth: verify `StudentGuardian` row links `session.userId` to `studentId`.
- [ ] Sekolah tab: read-only week grid.
- [ ] Rumah tab: **editable** week grid. Tap cell to toggle. Empty cell = not filled (not a negative). No nag banners, no completion percentage, no streak.
- [ ] `POST /api/student-journal/entries/home` upserts parent's own home entries (`scope=HOME`, `recordedByUserId=session.userId`). Rejects any `studentId` the parent does not guardian.
- [ ] Catatan tab: read-only thread (teacher + parent). Parent reply is **v2**, not this cycle.
- [ ] Home tap target ≥44px; grid scrolls smoothly on mid-range Android.

#### Admin — Oversight + Edit + Audit (T9 + T10)

- [ ] `/admin/student-journal/monitoring`:
  - StatCards: Total entries minggu ini, Kelas sudah isi, Siswa dengan catatan, Hari kosong.
  - `DataTable` of classes: Kelas, Siswa, % kelengkapan, Terakhir diisi, action Lihat.
- [ ] `GET /api/student-journal/admin/class-roll-up?classSectionId=&weekStart=` returns per-student completion for each indicator over the week.
- [ ] `/admin/student-journal/classes/[id]?week=`: student × indicator aggregated grid, drill into student detail.
- [ ] `/admin/student-journal/students/[id]`:
  - Tabs: `Sekolah` / `Rumah` / `Catatan` / `Audit`.
  - Sekolah + Rumah tabs: week grid read-only by default.
  - Edit toggle in `PageHeader`: cells become clickable to flip checked, Save + Cancel in card header.
  - `PUT /api/student-journal/admin/entries/[id]` updates the entry **and** inserts a `StudentJournalAudit` row in a Prisma transaction. Rollback if either fails.
  - `DELETE /api/student-journal/admin/notes/[id]` soft-deletes (`status=INACTIVE`) plus audit row, atomic.
  - Audit tab: `DataTable` of edits with before/after JSON diff (use a simple side-by-side view; no external diff library).

#### Security (cross-cutting)

- [ ] Every route calls `getSession()`; returns 401 if missing.
- [ ] Admin routes use `isAdminRole(session.role)` (not `session.role === 'SCHOOL_ADMIN'` — that bug pattern came up in the student CRUD cycle and must not repeat).
- [ ] Teacher routes verify `TeachingAssignment` covers `classSectionId` with `status=ACTIVE`.
- [ ] Parent routes verify `StudentGuardian` row links `session.userId` to `studentId`.
- [ ] All writes tenant-filter `where: { tenantId: session.tenantId }`.
- [ ] Zod validation on all POST / PUT inputs.
- [ ] Rate limit on all write endpoints (`lib/rate-limit.ts`).
- [ ] No hard delete anywhere.

#### Testing (T11)

- [ ] Vitest: Zod schemas, weekStart calc, audit diff builder, auth guard helpers.
- [ ] Vitest API: admin CRUD tenant isolation, teacher batch idempotency, parent scope rejection, admin audit transaction rollback, role matrix denial.
- [ ] Playwright: one admin test (create category + indicator, audit visible after edit), one teacher test (open class grid → tick → save → add note), one parent test (view school grid + fill home grid).
- [ ] Manual smoke at end of cycle on mid-range Android emulation:
  - Teacher fills 5 students × 12 indicators in <60s (UAT `click-to-visible` <3s threshold).
  - Parent home grid scrolls at 60fps; tap targets ≥44px.
  - Admin audit diff renders correctly after an edit.

#### Documentation

- [ ] README.md updated: add **Student Journal** to module table, mark CRUD status, add to roadmap as done.
- [ ] This cycle doc's Implementation, Verification, and Ship Notes sections filled by `/build` and `/ship`.

---

## Tasks

Ordered. One commit per task. Between-task gate (`npm run build && npx vitest run`) must pass before the next task starts. End-of-cycle gate (adds Playwright) before the final commit.

1. **Schema + validations** — Prisma models, enums, indexes, Zod schemas in `lib/validations/student-journal.ts`. No UI. Migration runs clean.
2. **Seed defaults** — extend `prisma/seed.ts` with SCHOOL + HOME categories and indicators. Idempotent.
3. **Admin template config (API + UI)** — template singleton, category + indicator CRUD, `/admin/student-journal` page with School/Home tabs, reorder, soft-delete.
4. **Teacher class-grid API** — `GET class-grid`, `POST entries/batch`, `TeachingAssignment` auth gate, Vitest API tests.
5. **Teacher entry UI** — `/teacher/student-journal` picker page, `/teacher/student-journal/entry` grid page, sticky save, toast.
6. **Teacher student week view + notes** — `/teacher/student-journal/students/[id]`, week grid, note API (`POST`/`PUT`), add-note Dialog.
7. **Parent journal API + school-view UI** — `GET children/[id]/week`, `/parent/student-journal` page, new bottom-nav tab, Sekolah tab week grid.
8. **Parent home-fill UI** — Rumah tab editable grid, `POST entries/home`, optional-no-nag UX.
9. **Admin monitoring + class roll-up** — `/admin/student-journal/monitoring`, `/admin/student-journal/classes/[id]`, roll-up API, StatCards + DataTable.
10. **Admin student detail + edit + audit** — `/admin/student-journal/students/[id]` with Sekolah/Rumah/Catatan/Audit tabs, edit toggle, transactional audit writes, diff viewer.
11. **E2E + perf smoke + docs** — 3 Playwright tests, manual smoke against UAT thresholds, README update, Ship Notes.

**Subagent dispatch plan (from user request 2026-04-21):**

| Phase | Main session | Subagents |
|---|---|---|
| T1-T3 | all (schema + seed + admin UI) | none |
| T4-T5 vs T7-T8 | T6 (teacher notes) | **Subagent A** does T4+T5 (teacher API + entry UI); **Subagent B** does T7+T8 (parent API + UI). Parallel dispatch because teacher and parent stacks are independent. |
| T9-T10 | T9 (admin monitoring) | **Subagent C** does T10 (admin edit + audit) after T9 lands, because T10 reuses T9's shared components. |
| T11 | all (cross-cutting) | none |

Dispatched subagents each own one commit per their slice, run their own between-task gate, and return a summary for main session to merge and commit.

---

## Implementation

_To be filled by `/build` task-by-task._

---

## Verification

_To be filled by `/build`. End-of-cycle gate output + manual smoke notes._

---

## Ship Notes

_To be filled by `/ship`. Migrations, new env vars, rollback plan._
