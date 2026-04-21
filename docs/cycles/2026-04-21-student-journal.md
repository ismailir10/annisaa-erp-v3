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

Ordered. **One commit per task.** Between-task gate (`npm run build && npx vitest run`) must pass before the next task starts. End-of-cycle gate (adds `npx playwright test`) before the final commit.

Task-level overview:

1. **Schema + validations** — Prisma models, indexes, Zod schemas.
2. **Seed defaults** — SCHOOL + HOME categories and indicators.
3. **Admin template config (API + UI)** — template singleton, category + indicator CRUD.
4. **Teacher class-grid API + tests** — `GET class-grid`, `POST entries/batch`.
5. **Teacher entry UI** — picker + class-day grid + sticky save.
6. **Teacher student week view + notes** — week grid + note thread + add-note Dialog.
7. **Parent journal API + school-view UI** — `GET children/[id]/week` + Sekolah tab.
8. **Parent home-fill UI** — Rumah tab editable grid + `POST entries/home`.
9. **Admin monitoring + class roll-up** — `/admin/student-journal/monitoring` + class detail.
10. **Admin student detail + edit + audit** — tabs + edit toggle + transactional audit.
11. **E2E + perf smoke + docs** — 3 Playwright specs, smoke, README, Ship Notes.

**Subagent dispatch plan:**

| Phase | Main session | Subagents |
|---|---|---|
| T1-T3 | all (shared schema + seed + admin UI) | none |
| T4-T5 **parallel** T7-T8 | T6 (teacher notes, depends on T4 class-grid shape) | **Subagent A** → T4+T5; **Subagent B** → T7+T8. Independent stacks. |
| T9 then T10 | T9 (monitoring) | **Subagent C** → T10 after T9 merges (T10 reuses T9 components). |
| T11 | all | none |

Each subagent owns its commits, runs the between-task gate, returns a summary. Main session reviews diff before moving forward.

---

### File structure (new)

```
prisma/
  schema.prisma                                 (+6 models, +3 enums)
  seed.ts                                       (extended)
lib/validations/
  student-journal.ts                            NEW — all Zod schemas
lib/student-journal/
  week.ts                                       NEW — weekStart calc, date helpers
  audit.ts                                      NEW — before/after JSON diff builder
  guards.ts                                     NEW — teacher/parent/admin auth gates
app/api/student-journal/
  template/route.ts                             GET, POST
  categories/route.ts                           GET, POST
  categories/[id]/route.ts                      PUT
  indicators/route.ts                           POST
  indicators/[id]/route.ts                      PUT
  class-grid/route.ts                           GET
  entries/batch/route.ts                        POST
  entries/home/route.ts                         POST
  students/[id]/week/route.ts                   GET (teacher-scoped)
  children/[id]/week/route.ts                   GET (parent-scoped)
  notes/route.ts                                POST
  notes/[id]/route.ts                           PUT
  admin/class-roll-up/route.ts                  GET
  admin/students/[id]/week/route.ts             GET
  admin/entries/[id]/route.ts                   PUT (transactional)
  admin/notes/[id]/route.ts                     DELETE (transactional)
  admin/audit/route.ts                          GET
app/admin/student-journal/
  page.tsx                                      template config (tabs)
  monitoring/page.tsx                           oversight dashboard
  classes/[id]/page.tsx                         class week view
  students/[id]/page.tsx                        student detail (4 tabs, edit toggle)
app/teacher/student-journal/
  page.tsx                                      picker
  entry/page.tsx                                class-day grid
  students/[id]/page.tsx                        week view + notes
app/parent/student-journal/
  page.tsx                                      tabs (Sekolah / Rumah / Catatan)
components/student-journal/
  category-accordion.tsx                        admin config
  class-day-grid.tsx                            teacher entry
  week-grid.tsx                                 read-only week (shared)
  editable-week-grid.tsx                        admin + parent-home editable
  note-thread.tsx                               shared thread component
  audit-diff.tsx                                admin audit tab
config/nav.ts                                   +parent tab entry
e2e/
  admin.spec.ts                                 +1 test
  teacher.spec.ts                               +1 test
  parent.spec.ts                                +1 test
tests/student-journal/                          Vitest unit + API tests
  validations.test.ts
  week.test.ts
  audit.test.ts
  api-admin.test.ts
  api-teacher.test.ts
  api-parent.test.ts
```

---

### Task 1 — Schema + validations

**Files:**
- Modify: `prisma/schema.prisma` (append models + enum-like string fields)
- Create: `lib/validations/student-journal.ts`
- Create: `lib/student-journal/week.ts`
- Create: `tests/student-journal/validations.test.ts`
- Create: `tests/student-journal/week.test.ts`

**Convention note:** repo uses `String` for enum-like fields (see `StudentAttendance.status`), not Postgres enums. Follow that pattern. Migrations live under `prisma/migrations/`.

- [ ] **1.1 Write failing Zod test**

```ts
// tests/student-journal/validations.test.ts
import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateIndicatorSchema,
  entryBatchSchema,
  noteBodySchema,
} from "@/lib/validations/student-journal";

describe("student-journal validations", () => {
  it("createCategorySchema accepts SCHOOL scope", () => {
    const r = createCategorySchema.safeParse({ name: "Ibadah", scope: "SCHOOL", order: 0 });
    expect(r.success).toBe(true);
  });
  it("createCategorySchema rejects bad scope", () => {
    const r = createCategorySchema.safeParse({ name: "X", scope: "FOO", order: 0 });
    expect(r.success).toBe(false);
  });
  it("entryBatchSchema requires classSectionId and date YYYY-MM-DD", () => {
    const r = entryBatchSchema.safeParse({
      classSectionId: "c1",
      date: "2026-04-21",
      entries: [{ studentId: "s1", indicatorId: "i1", checked: true }],
    });
    expect(r.success).toBe(true);
  });
  it("entryBatchSchema rejects malformed date", () => {
    const r = entryBatchSchema.safeParse({ classSectionId: "c1", date: "21/04/2026", entries: [] });
    expect(r.success).toBe(false);
  });
  it("noteBodySchema caps body at 2000 chars", () => {
    const r = noteBodySchema.safeParse({ studentId: "s1", date: "2026-04-21", body: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });
});
```

Run: `npx vitest run tests/student-journal/validations.test.ts` — Expected: FAIL (schema module missing).

- [ ] **1.2 Implement Zod schemas**

```ts
// lib/validations/student-journal.ts
import { z } from "zod";

export const scopeSchema = z.enum(["SCHOOL", "HOME"]);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const createCategorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi"),
  scope: scopeSchema,
  order: z.number().int().nonnegative().default(0),
});
export const updateCategorySchema = createCategorySchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const createIndicatorSchema = z.object({
  categoryId: z.string().min(1),
  label: z.string().min(1, "Label indikator wajib diisi"),
  order: z.number().int().nonnegative().default(0),
});
export const updateIndicatorSchema = createIndicatorSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const entryBatchSchema = z.object({
  classSectionId: z.string().min(1),
  date: ymd,
  entries: z.array(z.object({
    studentId: z.string().min(1),
    indicatorId: z.string().min(1),
    checked: z.boolean(),
  })),
});

export const homeEntryBatchSchema = z.object({
  studentId: z.string().min(1),
  date: ymd,
  entries: z.array(z.object({
    indicatorId: z.string().min(1),
    checked: z.boolean(),
  })),
});

export const noteBodySchema = z.object({
  studentId: z.string().min(1),
  date: ymd,
  body: z.string().min(1, "Catatan kosong").max(2000, "Catatan maksimal 2000 karakter"),
});
export const noteUpdateSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const adminEntryUpdateSchema = z.object({
  checked: z.boolean(),
});
```

Run: `npx vitest run tests/student-journal/validations.test.ts` — Expected: PASS.

- [ ] **1.3 Write failing weekStart test**

```ts
// tests/student-journal/week.test.ts
import { describe, it, expect } from "vitest";
import { weekStart, weekDates } from "@/lib/student-journal/week";

describe("weekStart", () => {
  it("returns Monday for a Wednesday", () => {
    expect(weekStart("2026-04-22")).toBe("2026-04-20");
  });
  it("returns Monday for a Sunday", () => {
    expect(weekStart("2026-04-26")).toBe("2026-04-20");
  });
  it("returns Monday for a Monday", () => {
    expect(weekStart("2026-04-20")).toBe("2026-04-20");
  });
});

describe("weekDates", () => {
  it("returns 5 dates Mon-Fri for a given weekStart", () => {
    expect(weekDates("2026-04-20")).toEqual([
      "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24",
    ]);
  });
});
```

- [ ] **1.4 Implement week helpers**

```ts
// lib/student-journal/week.ts
export function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function weekDates(weekStartYmd: string): string[] {
  const start = new Date(`${weekStartYmd}T00:00:00Z`);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
```

Run: `npx vitest run tests/student-journal/week.test.ts` — Expected: PASS.

- [ ] **1.5 Add Prisma models**

Append to `prisma/schema.prisma`:

```prisma
// ══════════════════════════════════════════════════════════════
// PHASE 8: Student Journal (Buku Penghubung)
// ══════════════════════════════════════════════════════════════

model StudentJournalTemplate {
  id              String    @id @default(cuid())
  tenantId        String    @unique
  academicYearId  String?
  status          String    @default("ACTIVE") // ACTIVE | INACTIVE
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  categories StudentJournalCategory[]

  @@index([tenantId])
}

model StudentJournalCategory {
  id         String @id @default(cuid())
  templateId String
  scope      String // SCHOOL | HOME
  name       String
  order      Int    @default(0)
  status     String @default("ACTIVE")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  template   StudentJournalTemplate   @relation(fields: [templateId], references: [id])
  indicators StudentJournalIndicator[]

  @@index([templateId, scope, status])
}

model StudentJournalIndicator {
  id         String @id @default(cuid())
  categoryId String
  label      String
  order      Int    @default(0)
  status     String @default("ACTIVE")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  category StudentJournalCategory @relation(fields: [categoryId], references: [id])
  entries  StudentJournalEntry[]

  @@index([categoryId, status])
}

model StudentJournalEntry {
  id               String   @id @default(cuid())
  tenantId         String
  studentId        String
  classSectionId   String?  // null when scope=HOME (home entries not tied to class)
  indicatorId      String
  date             String   // YYYY-MM-DD
  scope            String   // SCHOOL | HOME
  checked          Boolean
  recordedByUserId String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  indicator StudentJournalIndicator @relation(fields: [indicatorId], references: [id])

  @@unique([studentId, indicatorId, date, scope])
  @@index([tenantId, classSectionId, date])
  @@index([tenantId, studentId, date])
}

model StudentJournalNote {
  id            String   @id @default(cuid())
  tenantId      String
  studentId     String
  date          String   // YYYY-MM-DD
  authorUserId  String
  authorRole    String   // TEACHER | GUARDIAN | SUPER_ADMIN | SCHOOL_ADMIN
  body          String   @db.Text
  status        String   @default("ACTIVE") // ACTIVE | INACTIVE (soft delete)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, studentId, date])
}

model StudentJournalAudit {
  id             String   @id @default(cuid())
  tenantId       String
  entityType     String   // ENTRY | NOTE
  entityId       String
  action         String   // CREATE | UPDATE | DELETE
  beforeJson     Json?
  afterJson      Json?
  changedByUserId String
  changedAt      DateTime @default(now())

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, changedAt])
}
```

Run:
```
npx prisma migrate dev --name student_journal
npx prisma generate
npm run build
npx vitest run
```
Expected: migration applies, build green, all tests pass.

- [ ] **1.6 Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/validations/student-journal.ts lib/student-journal/week.ts tests/student-journal
git commit -m "feat(student-journal): add schema, validations, week helpers"
```

---

### Task 2 — Seed defaults

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **2.1 Add seed block (idempotent by tenant + name)**

Append to the seed script (inside the per-tenant loop):

```ts
// Student Journal seed — idempotent
const tmpl = await prisma.studentJournalTemplate.upsert({
  where: { tenantId: tenant.id },
  update: {},
  create: { tenantId: tenant.id, status: "ACTIVE" },
});

const defaults: Array<{ scope: "SCHOOL" | "HOME"; name: string; indicators: string[] }> = [
  { scope: "SCHOOL", name: "Ibadah", indicators: [
    "Tahfizul Qur'an", "Qiro'atul Qur'an", "Membawa Infaq", "Praktek Sholat Subuh Berjama'ah",
  ]},
  { scope: "SCHOOL", name: "Perilaku", indicators: [
    "Datang di Sekolah tepat waktu",
    "Berpakaian lengkap dan rapih",
    "Patuh dan santun pada guru",
    "Salam dan jabat tangan dengan guru",
    "Membuang sampah pada tempatnya",
    "Bersikap baik kepada teman",
    "Berkata baik dan jujur",
    "Tertib pada saat belajar",
    "Membawa Buku Penghubung",
  ]},
  { scope: "SCHOOL", name: "Akademis", indicators: [
    "Semangat mengikuti pelajaran", "Menyelesaikan tugas", "Merapihkan alat tulis",
  ]},
  { scope: "HOME", name: "Ibadah Rumah", indicators: [
    "Sholat 5 waktu", "Mengaji / tilawah", "Doa harian",
  ]},
  { scope: "HOME", name: "Akhlak Rumah", indicators: [
    "Membantu orang tua", "Berkata baik", "Merapihkan kamar", "Tidur tepat waktu",
  ]},
];

for (const [ci, cat] of defaults.entries()) {
  const existing = await prisma.studentJournalCategory.findFirst({
    where: { templateId: tmpl.id, scope: cat.scope, name: cat.name },
  });
  const category = existing ?? await prisma.studentJournalCategory.create({
    data: { templateId: tmpl.id, scope: cat.scope, name: cat.name, order: ci },
  });
  for (const [ii, label] of cat.indicators.entries()) {
    const existingInd = await prisma.studentJournalIndicator.findFirst({
      where: { categoryId: category.id, label },
    });
    if (!existingInd) {
      await prisma.studentJournalIndicator.create({
        data: { categoryId: category.id, label, order: ii },
      });
    }
  }
}
```

- [ ] **2.2 Run seed twice, verify idempotency**

```
npx prisma db seed
npx prisma db seed
```
Expected: second run logs no duplicate categories (check count with `npx prisma studio` or a quick raw query).

- [ ] **2.3 Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(student-journal): seed default SCHOOL + HOME categories and indicators"
```

---

### Task 3 — Admin template config (API + UI)

**Files:**
- Create: `lib/student-journal/guards.ts`
- Create: `app/api/student-journal/template/route.ts`
- Create: `app/api/student-journal/categories/route.ts`
- Create: `app/api/student-journal/categories/[id]/route.ts`
- Create: `app/api/student-journal/indicators/route.ts`
- Create: `app/api/student-journal/indicators/[id]/route.ts`
- Create: `app/admin/student-journal/page.tsx`
- Create: `components/student-journal/category-accordion.tsx`
- Create: `tests/student-journal/api-admin.test.ts`

- [ ] **3.1 Write shared admin guard**

```ts
// lib/student-journal/guards.ts
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminRole(session.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}
```

- [ ] **3.2 Implement `/api/student-journal/template` (GET creates if missing)**

```ts
// app/api/student-journal/template/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";

export async function GET() {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const tmpl = await prisma.studentJournalTemplate.upsert({
    where: { tenantId: session.tenantId },
    update: {},
    create: { tenantId: session.tenantId, status: "ACTIVE" },
  });
  return NextResponse.json({ data: tmpl });
}
```

- [ ] **3.3 Implement categories GET + POST**

```ts
// app/api/student-journal/categories/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { createCategorySchema, scopeSchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const scopeParam = searchParams.get("scope");
  const scope = scopeParam ? scopeSchema.parse(scopeParam) : undefined;
  const statusFilter = searchParams.get("status") ?? "ACTIVE";

  const tmpl = await prisma.studentJournalTemplate.findUnique({ where: { tenantId: session.tenantId } });
  if (!tmpl) return NextResponse.json({ data: [] });

  const categories = await prisma.studentJournalCategory.findMany({
    where: {
      templateId: tmpl.id,
      ...(scope && { scope }),
      ...(statusFilter !== "ALL" && { status: statusFilter }),
    },
    include: { indicators: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ data: categories });
}

export async function POST(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const limit = await rateLimit(req, "sj-categories-post");
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const tmpl = await prisma.studentJournalTemplate.upsert({
    where: { tenantId: session.tenantId },
    update: {},
    create: { tenantId: session.tenantId },
  });
  const cat = await prisma.studentJournalCategory.create({
    data: { templateId: tmpl.id, ...parsed.data },
  });
  return NextResponse.json({ data: cat });
}
```

- [ ] **3.4 Implement categories `[id]` PUT (edit + deactivate + reorder)**

```ts
// app/api/student-journal/categories/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { updateCategorySchema } from "@/lib/validations/student-journal";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await prisma.studentJournalCategory.findUnique({
    where: { id }, include: { template: true },
  });
  if (!existing || existing.template.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await prisma.studentJournalCategory.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: updated });
}
```

- [ ] **3.5 Implement indicators POST + PUT (same tenant-check pattern via category → template)**

```ts
// app/api/student-journal/indicators/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { createIndicatorSchema } from "@/lib/validations/student-journal";

export async function POST(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const parsed = createIndicatorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const cat = await prisma.studentJournalCategory.findUnique({
    where: { id: parsed.data.categoryId }, include: { template: true },
  });
  if (!cat || cat.template.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }
  const ind = await prisma.studentJournalIndicator.create({ data: parsed.data });
  return NextResponse.json({ data: ind });
}
```

```ts
// app/api/student-journal/indicators/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { updateIndicatorSchema } from "@/lib/validations/student-journal";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const parsed = updateIndicatorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await prisma.studentJournalIndicator.findUnique({
    where: { id }, include: { category: { include: { template: true } } },
  });
  if (!existing || existing.category.template.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await prisma.studentJournalIndicator.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: updated });
}
```

- [ ] **3.6 Admin config page (tabs, accordion)**

```tsx
// app/admin/student-journal/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CategoryAccordion } from "@/components/student-journal/category-accordion";
import { toast } from "sonner";

type Scope = "SCHOOL" | "HOME";

export default function StudentJournalAdminPage() {
  const [scope, setScope] = useState<Scope>("SCHOOL");
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (s: Scope) => {
    setLoading(true);
    const res = await fetch(`/api/student-journal/categories?scope=${s}&status=ALL`);
    if (!res.ok) { toast.error("Gagal memuat kategori"); setLoading(false); return; }
    const data = await res.json();
    setCategories(data.data);
    setLoading(false);
  };
  useEffect(() => { load(scope); }, [scope]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Buku Penghubung — Template"
        description="Atur kategori dan indikator untuk sekolah dan rumah."
        actions={<Button><Plus className="w-4 h-4 mr-2" />Tambah Kategori</Button>}
      />
      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <TabsTrigger value="SCHOOL">Sekolah</TabsTrigger>
          <TabsTrigger value="HOME">Rumah</TabsTrigger>
        </TabsList>
        <TabsContent value={scope} className="mt-4">
          <CategoryAccordion
            categories={categories}
            loading={loading}
            onRefresh={() => load(scope)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **3.7 CategoryAccordion component**

```tsx
// components/student-journal/category-accordion.tsx
"use client";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function CategoryAccordion({ categories, loading, onRefresh }: {
  categories: any[]; loading: boolean; onRefresh: () => void;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!categories.length) return <EmptyState title="Belum ada kategori" description="Tambahkan kategori pertama." />;

  return (
    <Accordion type="multiple" className="space-y-2">
      {categories.map((cat) => (
        <AccordionItem key={cat.id} value={cat.id} className="border rounded-md">
          <AccordionTrigger className="px-3">
            <div className="flex items-center gap-2">
              <span>{cat.name}</span>
              {cat.status !== "ACTIVE" && <Badge variant="secondary">Tidak Aktif</Badge>}
              <Badge variant="outline">{cat.indicators.length} indikator</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 space-y-2">
            {cat.indicators.map((ind: any) => (
              <div key={ind.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <span>{ind.label}</span>
                {ind.status !== "ACTIVE" && <Badge variant="secondary">Tidak Aktif</Badge>}
              </div>
            ))}
            <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" />Tambah Indikator</Button>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

Note: Dialog forms for create/edit wired via `onRefresh` callback — keep this task focused on read-only accordion; add/edit Dialogs can land with the same commit or a small follow-up within the same task. If growth creeps, split the Dialog impl into step 3.8 as a separate sub-commit within task 3.

- [ ] **3.8 Write API tests**

```ts
// tests/student-journal/api-admin.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Minimal contract tests — full harness lives in tests/setup.
// Purpose: verify tenant isolation on category create.

describe("/api/student-journal/categories POST", () => {
  it("rejects non-admin role with 403", async () => {
    // stub: import the route handler, pass mocked session
    // Expected: 403
  });
  it("scopes created category to current tenant", async () => {
    // create via route, assert Category.template.tenantId === session.tenantId
  });
});
```

(Expand with the real API test harness already used in the repo — follow the pattern from `tests/api-employees.test.ts` if present.)

Run:
```
npm run build
npx vitest run
```
Expected: green.

- [ ] **3.9 Commit**

```bash
git add app/api/student-journal app/admin/student-journal components/student-journal lib/student-journal/guards.ts tests/student-journal/api-admin.test.ts
git commit -m "feat(student-journal): admin template config API + UI"
```

---

### Task 4 — Teacher class-grid API + tests (SUBAGENT A)

**Files:**
- Create: `app/api/student-journal/class-grid/route.ts`
- Create: `app/api/student-journal/entries/batch/route.ts`
- Modify: `lib/student-journal/guards.ts` (add `requireTeacherForClass`)
- Create: `tests/student-journal/api-teacher.test.ts`

- [ ] **4.1 Teacher guard**

```ts
// append to lib/student-journal/guards.ts
export async function requireTeacherForClass(classSectionId: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "TEACHER") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employee: { userId: session.userId, tenantId: session.tenantId },
      classSectionId,
      status: "ACTIVE",
    },
  });
  if (!assignment) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}
```

(Add `import { prisma } from "@/lib/prisma";` at top of file if not already there.)

- [ ] **4.2 class-grid GET**

```ts
// app/api/student-journal/class-grid/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeacherForClass } from "@/lib/student-journal/guards";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const classSectionId = searchParams.get("classSectionId");
  const date = searchParams.get("date");
  if (!classSectionId || !date) return NextResponse.json({ error: "classSectionId and date required" }, { status: 400 });

  const { session, error } = await requireTeacherForClass(classSectionId);
  if (error) return error;

  const [students, categories, entries] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: { classSectionId, status: "ACTIVE" },
      include: { student: { select: { id: true, name: true, nickname: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.studentJournalCategory.findMany({
      where: {
        template: { tenantId: session.tenantId },
        scope: "SCHOOL",
        status: "ACTIVE",
      },
      include: {
        indicators: { where: { status: "ACTIVE" }, orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    }),
    prisma.studentJournalEntry.findMany({
      where: { tenantId: session.tenantId, classSectionId, date, scope: "SCHOOL" },
    }),
  ]);

  return NextResponse.json({
    data: {
      students: students.map((e) => e.student),
      categories,
      entries,
    },
  });
}
```

- [ ] **4.3 entries batch POST**

```ts
// app/api/student-journal/entries/batch/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeacherForClass } from "@/lib/student-journal/guards";
import { entryBatchSchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limit = await rateLimit(req, "sj-entries-batch");
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = entryBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { session, error } = await requireTeacherForClass(parsed.data.classSectionId);
  if (error) return error;

  // Verify all indicators are SCHOOL-scope and same tenant
  const indicatorIds = [...new Set(parsed.data.entries.map((e) => e.indicatorId))];
  const indicators = await prisma.studentJournalIndicator.findMany({
    where: { id: { in: indicatorIds } },
    include: { category: { include: { template: true } } },
  });
  const invalid = indicators.some((i) => i.category.scope !== "SCHOOL" || i.category.template.tenantId !== session.tenantId);
  if (invalid || indicators.length !== indicatorIds.length) {
    return NextResponse.json({ error: "Invalid indicators" }, { status: 400 });
  }

  // Verify all students enrolled in that class
  const studentIds = [...new Set(parsed.data.entries.map((e) => e.studentId))];
  const enrolled = await prisma.studentEnrollment.findMany({
    where: { classSectionId: parsed.data.classSectionId, studentId: { in: studentIds }, status: "ACTIVE" },
    select: { studentId: true },
  });
  if (enrolled.length !== studentIds.length) {
    return NextResponse.json({ error: "One or more students not in class" }, { status: 400 });
  }

  const results = await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.studentJournalEntry.upsert({
        where: {
          studentId_indicatorId_date_scope: {
            studentId: e.studentId,
            indicatorId: e.indicatorId,
            date: parsed.data.date,
            scope: "SCHOOL",
          },
        },
        update: { checked: e.checked, recordedByUserId: session.userId },
        create: {
          tenantId: session.tenantId,
          studentId: e.studentId,
          classSectionId: parsed.data.classSectionId,
          indicatorId: e.indicatorId,
          date: parsed.data.date,
          scope: "SCHOOL",
          checked: e.checked,
          recordedByUserId: session.userId,
        },
      })
    )
  );

  return NextResponse.json({ data: { saved: results.length } });
}
```

- [ ] **4.4 API tests (idempotency + auth)**

```ts
// tests/student-journal/api-teacher.test.ts
import { describe, it, expect } from "vitest";
// Integration-style test — use seeded tenant + teacher user + class.
// Verify:
//   1. Teacher without TeachingAssignment gets 403
//   2. Teacher with assignment can POST batch
//   3. Second POST same date upserts (no unique-constraint error, same row count)
//   4. Entry with indicator from HOME scope → 400
//   5. Entry with studentId not enrolled in class → 400
describe("teacher entries/batch", () => {
  it.todo("teacher without assignment gets 403");
  it.todo("teacher with assignment creates entries");
  it.todo("second batch upserts instead of duplicating");
  it.todo("HOME-scope indicator rejected");
  it.todo("unenrolled student rejected");
});
```

(Fill in with real harness. Budget these tests before moving to UI.)

Run: `npm run build && npx vitest run` — green.

- [ ] **4.5 Commit**

```bash
git add app/api/student-journal/class-grid app/api/student-journal/entries lib/student-journal/guards.ts tests/student-journal/api-teacher.test.ts
git commit -m "feat(student-journal): teacher class-grid API + batch upsert"
```

---

### Task 5 — Teacher entry UI (SUBAGENT A continues)

**Files:**
- Create: `app/teacher/student-journal/page.tsx`
- Create: `app/teacher/student-journal/entry/page.tsx`
- Create: `components/student-journal/class-day-grid.tsx`
- Modify: `app/teacher/home-client.tsx` (add quick-link card, optional)
- Modify: `config/nav.ts` or teacher bottom nav source (add "Penghubung" tab or link)

- [ ] **5.1 Picker page**

```tsx
// app/teacher/student-journal/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

export default function TeacherStudentJournalPicker() {
  const router = useRouter();
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/teacher/assignments");
      if (!res.ok) { toast.error("Gagal memuat kelas"); return; }
      const j = await res.json();
      setClasses(j.data ?? []);
      if (j.data?.[0]) setClassId(j.data[0].classSectionId);
    })();
  }, []);

  const go = () => {
    if (!classId) return toast.error("Pilih kelas dulu");
    router.push(`/teacher/student-journal/entry?classId=${classId}&date=${date}`);
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Buku Penghubung</h1>
      <Field>
        <FieldLabel>Kelas</FieldLabel>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.classSectionId} value={c.classSectionId}>{c.className}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Tanggal</FieldLabel>
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button className="w-full" onClick={go}>Isi Penghubung</Button>
    </div>
  );
}
```

(If `/api/teacher/assignments` doesn't exist, either reuse existing `/api/teacher/classes` or add a tiny endpoint inside task 5.)

- [ ] **5.2 Entry page**

```tsx
// app/teacher/student-journal/entry/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ClassDayGrid } from "@/components/student-journal/class-day-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TeacherEntryPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const classId = sp.get("classId") ?? "";
  const date = sp.get("date") ?? new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<Record<string, Record<string, boolean>>>({}); // studentId → indicatorId → checked

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/student-journal/class-grid?classSectionId=${classId}&date=${date}`);
      if (!res.ok) { toast.error("Gagal memuat"); return; }
      const j = await res.json();
      setData(j.data);
      const init: Record<string, Record<string, boolean>> = {};
      for (const e of j.data.entries) {
        init[e.studentId] ??= {};
        init[e.studentId][e.indicatorId] = e.checked;
      }
      setState(init);
    })();
  }, [classId, date]);

  const toggle = (studentId: string, indicatorId: string) => {
    setState((s) => ({ ...s, [studentId]: { ...(s[studentId] ?? {}), [indicatorId]: !(s[studentId]?.[indicatorId] ?? false) } }));
  };

  const save = async () => {
    setSaving(true);
    const entries = Object.entries(state).flatMap(([studentId, inds]) =>
      Object.entries(inds).map(([indicatorId, checked]) => ({ studentId, indicatorId, checked }))
    );
    const res = await fetch("/api/student-journal/entries/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classSectionId: classId, date, entries }),
    });
    setSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? "Gagal menyimpan"); return; }
    toast.success("Tersimpan");
  };

  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="p-4 pb-20 max-w-md mx-auto">
      <ClassDayGrid students={data.students} categories={data.categories} state={state} onToggle={toggle} />
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 safe-area-bottom max-w-md mx-auto">
        <Button className="w-full" disabled={saving} onClick={save}>{saving ? "Menyimpan..." : "Simpan"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **5.3 ClassDayGrid component**

```tsx
// components/student-journal/class-day-grid.tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClassDayGrid({ students, categories, state, onToggle }: any) {
  const [openStudent, setOpenStudent] = useState<string | null>(students[0]?.id ?? null);
  return (
    <div className="space-y-2">
      {students.map((s: any) => (
        <div key={s.id} className="border rounded-md">
          <button
            className="w-full text-left p-3 font-medium"
            onClick={() => setOpenStudent(openStudent === s.id ? null : s.id)}
          >
            {s.name}
          </button>
          {openStudent === s.id && (
            <div className="p-3 pt-0 space-y-3">
              {categories.map((cat: any) => (
                <div key={cat.id}>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">{cat.name}</div>
                  <div className="space-y-1">
                    {cat.indicators.map((ind: any) => {
                      const checked = state[s.id]?.[ind.id] ?? false;
                      return (
                        <button
                          key={ind.id}
                          onClick={() => onToggle(s.id, ind.id)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded border text-sm min-h-[44px]",
                            checked && "bg-primary/10 border-primary",
                          )}
                        >
                          <span>{ind.label}</span>
                          {checked && <Check className="w-4 h-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

Run: `npm run build && npx vitest run` — green.

- [ ] **5.4 Commit**

```bash
git add app/teacher/student-journal components/student-journal/class-day-grid.tsx
git commit -m "feat(student-journal): teacher entry flow — picker + class-day grid"
```

---

### Task 6 — Teacher student week view + notes (main session)

**Files:**
- Create: `app/teacher/student-journal/students/[id]/page.tsx`
- Create: `app/api/student-journal/students/[id]/week/route.ts`
- Create: `app/api/student-journal/notes/route.ts`
- Create: `app/api/student-journal/notes/[id]/route.ts`
- Create: `components/student-journal/week-grid.tsx`
- Create: `components/student-journal/note-thread.tsx`

- [ ] **6.1 week API (teacher-scoped)**

```ts
// app/api/student-journal/students/[id]/week/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { weekDates, weekStart } from "@/lib/student-journal/week";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: studentId } = await params;
  const { searchParams } = new URL(req.url);
  const ws = searchParams.get("weekStart") ?? weekStart(new Date().toISOString().slice(0, 10));

  // Teacher must be assigned to that student's active class
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
    select: { classSectionId: true },
  });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 404 });
  const assigned = await prisma.teachingAssignment.findFirst({
    where: { employee: { userId: session.userId, tenantId: session.tenantId }, classSectionId: enrollment.classSectionId, status: "ACTIVE" },
  });
  if (!assigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dates = weekDates(ws);
  const [categories, entries, notes] = await Promise.all([
    prisma.studentJournalCategory.findMany({
      where: { template: { tenantId: session.tenantId }, scope: "SCHOOL", status: "ACTIVE" },
      include: { indicators: { where: { status: "ACTIVE" }, orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    prisma.studentJournalEntry.findMany({
      where: { tenantId: session.tenantId, studentId, date: { in: dates }, scope: "SCHOOL" },
    }),
    prisma.studentJournalNote.findMany({
      where: { tenantId: session.tenantId, studentId, date: { in: dates }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({ data: { weekStart: ws, dates, categories, entries, notes } });
}
```

- [ ] **6.2 notes API**

```ts
// app/api/student-journal/notes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { noteBodySchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimit(req, "sj-notes-post");
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  // Teacher must be assigned; guardian must be linked
  if (session.role === "TEACHER") {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: parsed.data.studentId, status: "ACTIVE" },
    });
    const assigned = enrollment && await prisma.teachingAssignment.findFirst({
      where: { employee: { userId: session.userId, tenantId: session.tenantId }, classSectionId: enrollment.classSectionId, status: "ACTIVE" },
    });
    if (!assigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (session.role === "GUARDIAN") {
    const link = await prisma.studentGuardian.findFirst({
      where: { studentId: parsed.data.studentId, guardian: { userId: session.userId }, status: "ACTIVE" },
    });
    if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const note = await prisma.studentJournalNote.create({
    data: {
      tenantId: session.tenantId,
      studentId: parsed.data.studentId,
      date: parsed.data.date,
      authorUserId: session.userId,
      authorRole: session.role,
      body: parsed.data.body,
    },
  });
  return NextResponse.json({ data: note });
}
```

```ts
// app/api/student-journal/notes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { noteUpdateSchema } from "@/lib/validations/student-journal";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await prisma.studentJournalNote.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.authorUserId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const updated = await prisma.studentJournalNote.update({ where: { id }, data: { body: parsed.data.body } });
  return NextResponse.json({ data: updated });
}
```

- [ ] **6.3 WeekGrid + NoteThread shared components**

```tsx
// components/student-journal/week-grid.tsx
"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function WeekGrid({ categories, entries, dates, editable, onToggle }: {
  categories: any[]; entries: any[]; dates: string[];
  editable?: boolean; onToggle?: (indicatorId: string, date: string, next: boolean) => void;
}) {
  const lookup = new Map(entries.map((e) => [`${e.indicatorId}|${e.date}`, e.checked]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead>
          <tr>
            <th className="text-left p-2 sticky left-0 bg-background border-r">Indikator</th>
            {dates.map((d) => <th key={d} className="p-2 text-center">{d.slice(5)}</th>)}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <>
              <tr key={cat.id} className="bg-muted/50">
                <td colSpan={dates.length + 1} className="p-2 font-semibold text-xs">{cat.name}</td>
              </tr>
              {cat.indicators.map((ind: any) => (
                <tr key={ind.id} className="border-t">
                  <td className="p-2 sticky left-0 bg-background border-r">{ind.label}</td>
                  {dates.map((d) => {
                    const checked = lookup.get(`${ind.id}|${d}`) ?? false;
                    const cell = (
                      <div className={cn("w-8 h-8 mx-auto flex items-center justify-center rounded border",
                        checked ? "bg-primary/10 border-primary" : "border-border")}>
                        {checked && <Check className="w-4 h-4 text-primary" />}
                      </div>
                    );
                    return (
                      <td key={d} className="p-1 text-center">
                        {editable
                          ? <button onClick={() => onToggle?.(ind.id, d, !checked)} className="w-full min-h-[44px]">{cell}</button>
                          : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// components/student-journal/note-thread.tsx
"use client";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function NoteThread({ notes }: { notes: any[] }) {
  if (!notes.length) return <p className="text-sm text-muted-foreground">Belum ada catatan.</p>;
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <li key={n.id} className="border rounded p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline">{n.authorRole === "TEACHER" ? "Guru" : n.authorRole === "GUARDIAN" ? "Orang tua" : "Admin"}</Badge>
            <span className="text-xs text-muted-foreground">{formatDate(n.date)}</span>
          </div>
          <p className="whitespace-pre-wrap">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **6.4 Teacher student week page**

```tsx
// app/teacher/student-journal/students/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WeekGrid } from "@/components/student-journal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function TeacherStudentWeekPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState("");

  const load = async () => {
    const res = await fetch(`/api/student-journal/students/${id}/week`);
    if (!res.ok) { toast.error("Gagal memuat"); return; }
    setData((await res.json()).data);
  };
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    const res = await fetch("/api/student-journal/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: id, date, body }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Gagal"); return; }
    toast.success("Catatan tersimpan"); setOpen(false); setBody(""); load();
  };

  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Minggu ini</h1>
      <WeekGrid categories={data.categories} entries={data.entries} dates={data.dates} />

      <div className="flex items-center justify-between mt-6">
        <h2 className="font-semibold">Catatan</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Tambah Catatan</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Catatan Guru</DialogTitle></DialogHeader>
            <Field><FieldLabel>Tanggal</FieldLabel><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field><FieldLabel>Isi</FieldLabel><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={save}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <NoteThread notes={data.notes} />
    </div>
  );
}
```

- [ ] **6.5 Commit**

```bash
git add app/teacher/student-journal/students app/api/student-journal/students app/api/student-journal/notes components/student-journal/week-grid.tsx components/student-journal/note-thread.tsx
git commit -m "feat(student-journal): teacher student week view + notes thread"
```

---

### Task 7 — Parent journal API + school-view UI (SUBAGENT B, parallel to 4-5)

**Files:**
- Create: `app/api/student-journal/children/[id]/week/route.ts`
- Modify: `lib/student-journal/guards.ts` (add `requireGuardianForStudent`)
- Create: `app/parent/student-journal/page.tsx`
- Modify: parent bottom nav (add "Penghubung" tab with `BookHeart` icon)

- [ ] **7.1 Guardian guard**

```ts
// append to lib/student-journal/guards.ts
export async function requireGuardianForStudent(studentId: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "GUARDIAN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const link = await prisma.studentGuardian.findFirst({
    where: { studentId, guardian: { userId: session.userId }, status: "ACTIVE" },
  });
  if (!link) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}
```

- [ ] **7.2 Parent week API**

```ts
// app/api/student-journal/children/[id]/week/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { weekDates, weekStart } from "@/lib/student-journal/week";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await params;
  const { session, error } = await requireGuardianForStudent(studentId);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const ws = searchParams.get("weekStart") ?? weekStart(new Date().toISOString().slice(0, 10));
  const dates = weekDates(ws);

  const [schoolCats, homeCats, entries, notes] = await Promise.all([
    prisma.studentJournalCategory.findMany({
      where: { template: { tenantId: session.tenantId }, scope: "SCHOOL", status: "ACTIVE" },
      include: { indicators: { where: { status: "ACTIVE" }, orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    prisma.studentJournalCategory.findMany({
      where: { template: { tenantId: session.tenantId }, scope: "HOME", status: "ACTIVE" },
      include: { indicators: { where: { status: "ACTIVE" }, orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    prisma.studentJournalEntry.findMany({
      where: { tenantId: session.tenantId, studentId, date: { in: dates } },
    }),
    prisma.studentJournalNote.findMany({
      where: { tenantId: session.tenantId, studentId, date: { in: dates }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    data: {
      weekStart: ws,
      dates,
      schoolCategories: schoolCats,
      homeCategories: homeCats,
      schoolEntries: entries.filter((e) => e.scope === "SCHOOL"),
      homeEntries: entries.filter((e) => e.scope === "HOME"),
      notes,
    },
  });
}
```

- [ ] **7.3 Parent page shell (tabs + Sekolah view)**

```tsx
// app/parent/student-journal/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WeekGrid } from "@/components/student-journal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function ParentStudentJournalPage() {
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/parent/children");
      if (!res.ok) { toast.error("Gagal memuat"); return; }
      const j = await res.json();
      setChildren(j.data);
      if (j.data?.[0]) setChildId(j.data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!childId) return;
    (async () => {
      const res = await fetch(`/api/student-journal/children/${childId}/week`);
      if (!res.ok) { toast.error("Gagal memuat"); return; }
      setData((await res.json()).data);
    })();
  }, [childId]);

  if (!data) return <Skeleton className="h-64 w-full m-4" />;
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto pb-24">
      <h1 className="text-lg font-semibold">Buku Penghubung</h1>
      {children.length > 1 && (
        <select value={childId ?? ""} onChange={(e) => setChildId(e.target.value)} className="border rounded p-2 text-sm">
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <Tabs defaultValue="school">
        <TabsList className="w-full">
          <TabsTrigger value="school" className="flex-1">Di Sekolah</TabsTrigger>
          <TabsTrigger value="home" className="flex-1">Di Rumah</TabsTrigger>
          <TabsTrigger value="notes" className="flex-1">Catatan</TabsTrigger>
        </TabsList>
        <TabsContent value="school" className="mt-3">
          <WeekGrid categories={data.schoolCategories} entries={data.schoolEntries} dates={data.dates} />
        </TabsContent>
        <TabsContent value="home" className="mt-3">
          {/* Task 8 fills this */}
          <p className="text-sm text-muted-foreground">Segera hadir.</p>
        </TabsContent>
        <TabsContent value="notes" className="mt-3">
          <NoteThread notes={data.notes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **7.4 Parent bottom nav tab**

Locate the parent bottom-nav component (likely `app/parent/layout.tsx` or a `parent-bottom-nav.tsx`). Add a 4th/5th item:
```tsx
{ href: "/parent/student-journal", icon: BookHeart, label: "Penghubung" }
```
Maintain `framer-motion` active indicator (`layoutId`) and `safe-area-bottom` per [CLAUDE.md](../../CLAUDE.md) parent portal standard.

- [ ] **7.5 Commit**

```bash
git add app/api/student-journal/children app/parent/student-journal lib/student-journal/guards.ts app/parent/layout.tsx
git commit -m "feat(student-journal): parent week API + Sekolah tab + bottom-nav entry"
```

---

### Task 8 — Parent home-fill UI (SUBAGENT B continues)

**Files:**
- Create: `app/api/student-journal/entries/home/route.ts`
- Modify: `app/parent/student-journal/page.tsx` (wire Rumah tab to editable grid)

- [ ] **8.1 home POST**

```ts
// app/api/student-journal/entries/home/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { homeEntryBatchSchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limit = await rateLimit(req, "sj-entries-home");
  if (!limit.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = homeEntryBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { session, error } = await requireGuardianForStudent(parsed.data.studentId);
  if (error) return error;

  // Verify HOME-scope indicators same tenant
  const ids = parsed.data.entries.map((e) => e.indicatorId);
  const indicators = await prisma.studentJournalIndicator.findMany({
    where: { id: { in: ids } },
    include: { category: { include: { template: true } } },
  });
  const invalid = indicators.some((i) => i.category.scope !== "HOME" || i.category.template.tenantId !== session.tenantId);
  if (invalid || indicators.length !== ids.length) {
    return NextResponse.json({ error: "Invalid indicators" }, { status: 400 });
  }

  const results = await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.studentJournalEntry.upsert({
        where: {
          studentId_indicatorId_date_scope: {
            studentId: parsed.data.studentId,
            indicatorId: e.indicatorId,
            date: parsed.data.date,
            scope: "HOME",
          },
        },
        update: { checked: e.checked, recordedByUserId: session.userId },
        create: {
          tenantId: session.tenantId,
          studentId: parsed.data.studentId,
          classSectionId: null,
          indicatorId: e.indicatorId,
          date: parsed.data.date,
          scope: "HOME",
          checked: e.checked,
          recordedByUserId: session.userId,
        },
      })
    )
  );
  return NextResponse.json({ data: { saved: results.length } });
}
```

- [ ] **8.2 Rumah tab editable grid**

Replace Rumah `TabsContent` in `app/parent/student-journal/page.tsx`:

```tsx
<TabsContent value="home" className="mt-3">
  <WeekGrid
    categories={data.homeCategories}
    entries={data.homeEntries}
    dates={data.dates}
    editable
    onToggle={async (indicatorId, date, next) => {
      const res = await fetch("/api/student-journal/entries/home", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: childId,
          date,
          entries: [{ indicatorId, checked: next }],
        }),
      });
      if (!res.ok) { toast.error("Gagal menyimpan"); return; }
      // optimistic refresh
      const refreshed = await fetch(`/api/student-journal/children/${childId}/week`);
      if (refreshed.ok) setData((await refreshed.json()).data);
    }}
  />
  <p className="text-xs text-muted-foreground mt-2">Isi kalau sempat. Opsional.</p>
</TabsContent>
```

- [ ] **8.3 Commit**

```bash
git add app/api/student-journal/entries/home app/parent/student-journal/page.tsx
git commit -m "feat(student-journal): parent home-fill editable grid (optional, no-nag)"
```

---

### Task 9 — Admin monitoring + class roll-up (main session)

**Files:**
- Create: `app/api/student-journal/admin/class-roll-up/route.ts`
- Create: `app/admin/student-journal/monitoring/page.tsx`
- Create: `app/admin/student-journal/classes/[id]/page.tsx`

- [ ] **9.1 roll-up API**

```ts
// app/api/student-journal/admin/class-roll-up/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { weekDates, weekStart } from "@/lib/student-journal/week";

export async function GET(req: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const classSectionId = searchParams.get("classSectionId");
  const ws = searchParams.get("weekStart") ?? weekStart(new Date().toISOString().slice(0, 10));
  if (!classSectionId) return NextResponse.json({ error: "classSectionId required" }, { status: 400 });
  const dates = weekDates(ws);

  const [enrollments, entries] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: { classSectionId, status: "ACTIVE" },
      include: { student: { select: { id: true, name: true } } },
    }),
    prisma.studentJournalEntry.findMany({
      where: { tenantId: session.tenantId, classSectionId, date: { in: dates }, scope: "SCHOOL", checked: true },
    }),
  ]);
  const countByStudent = new Map<string, number>();
  for (const e of entries) countByStudent.set(e.studentId, (countByStudent.get(e.studentId) ?? 0) + 1);

  return NextResponse.json({
    data: {
      weekStart: ws, dates,
      students: enrollments.map((en) => ({
        studentId: en.student.id, name: en.student.name, checkedCount: countByStudent.get(en.student.id) ?? 0,
      })),
    },
  });
}
```

- [ ] **9.2 Monitoring page (StatCards + DataTable stub)**

Implement following the existing pattern used in `/admin/students` page — list classes, per-class completion % summary. Keep scoped to this cycle; do not refactor existing DataTable patterns.

```tsx
// app/admin/student-journal/monitoring/page.tsx
// (abbreviated structure — mirror /admin/students list page)
// StatCards: total entries minggu ini, kelas sudah isi, siswa dengan catatan, hari kosong
// DataTable: kelas, jumlah siswa, % kelengkapan, terakhir diisi, action Lihat → /admin/student-journal/classes/[id]
```

- [ ] **9.3 Class week view**

```tsx
// app/admin/student-journal/classes/[id]/page.tsx
// Read-only week grid per student. Drill click → /admin/student-journal/students/[id]
```

(Full code to be written during task execution — reuse `WeekGrid` component from task 6.)

- [ ] **9.4 Commit**

```bash
git add app/api/student-journal/admin/class-roll-up app/admin/student-journal/monitoring app/admin/student-journal/classes
git commit -m "feat(student-journal): admin monitoring + class roll-up"
```

---

### Task 10 — Admin student detail + edit + audit (SUBAGENT C after T9)

**Files:**
- Create: `app/api/student-journal/admin/students/[id]/week/route.ts`
- Create: `app/api/student-journal/admin/entries/[id]/route.ts`
- Create: `app/api/student-journal/admin/notes/[id]/route.ts`
- Create: `app/api/student-journal/admin/audit/route.ts`
- Create: `lib/student-journal/audit.ts`
- Create: `components/student-journal/audit-diff.tsx`
- Create: `app/admin/student-journal/students/[id]/page.tsx`
- Create: `tests/student-journal/audit.test.ts`

- [ ] **10.1 Audit diff builder + test**

```ts
// lib/student-journal/audit.ts
export function diffJson(before: unknown, after: unknown): { before: unknown; after: unknown } {
  return { before, after };
}
```

```ts
// tests/student-journal/audit.test.ts
import { describe, it, expect } from "vitest";
import { diffJson } from "@/lib/student-journal/audit";
describe("diffJson", () => {
  it("captures before/after snapshots", () => {
    const out = diffJson({ checked: false }, { checked: true });
    expect(out).toEqual({ before: { checked: false }, after: { checked: true } });
  });
});
```

- [ ] **10.2 Transactional admin entry PUT**

```ts
// app/api/student-journal/admin/entries/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { adminEntryUpdateSchema } from "@/lib/validations/student-journal";
import { diffJson } from "@/lib/student-journal/audit";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const parsed = adminEntryUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await prisma.studentJournalEntry.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.studentJournalEntry.update({
      where: { id },
      data: { checked: parsed.data.checked, recordedByUserId: session.userId },
    });
    const diff = diffJson({ checked: existing.checked }, { checked: updated.checked });
    await tx.studentJournalAudit.create({
      data: {
        tenantId: session.tenantId,
        entityType: "ENTRY", entityId: id, action: "UPDATE",
        beforeJson: diff.before as any, afterJson: diff.after as any,
        changedByUserId: session.userId,
      },
    });
    return updated;
  });
  return NextResponse.json({ data: result });
}
```

- [ ] **10.3 Admin notes DELETE (soft) + audit**

```ts
// app/api/student-journal/admin/notes/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/student-journal/guards";
import { diffJson } from "@/lib/student-journal/audit";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.studentJournalNote.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.studentJournalNote.update({ where: { id }, data: { status: "INACTIVE" } });
    const diff = diffJson({ status: existing.status }, { status: "INACTIVE" });
    await tx.studentJournalAudit.create({
      data: {
        tenantId: session.tenantId,
        entityType: "NOTE", entityId: id, action: "DELETE",
        beforeJson: diff.before as any, afterJson: diff.after as any,
        changedByUserId: session.userId,
      },
    });
  });
  return NextResponse.json({ data: { ok: true } });
}
```

- [ ] **10.4 Admin audit list + student week + student-detail page**

- `/api/student-journal/admin/audit?entityId=` — returns audit rows for the entity.
- `/api/student-journal/admin/students/[id]/week` — admin version of the teacher endpoint, without the TeachingAssignment gate.
- `/admin/student-journal/students/[id]/page.tsx` — Tabs: Sekolah / Rumah / Catatan / Audit. Edit toggle in `PageHeader` flips `editable` prop on `WeekGrid`. On toggle, PUT to `admin/entries/[entryId]`.

(Full page code mirrors teacher week page plus tabs + audit; reuse `WeekGrid`, `NoteThread`, add `AuditDiff`.)

```tsx
// components/student-journal/audit-diff.tsx
export function AuditDiff({ before, after }: { before: any; after: any }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
      <pre className="bg-destructive/10 p-2 rounded">{JSON.stringify(before, null, 2)}</pre>
      <pre className="bg-status-present-subtle p-2 rounded">{JSON.stringify(after, null, 2)}</pre>
    </div>
  );
}
```

- [ ] **10.5 Commit**

```bash
git add app/api/student-journal/admin app/admin/student-journal/students lib/student-journal/audit.ts components/student-journal/audit-diff.tsx tests/student-journal/audit.test.ts
git commit -m "feat(student-journal): admin student detail + edit + transactional audit"
```

---

### Task 11 — E2E + perf smoke + docs

**Files:**
- Modify: `e2e/admin.spec.ts`
- Modify: `e2e/teacher.spec.ts`
- Modify: `e2e/parent.spec.ts`
- Modify: `README.md` (module table, CRUD status, roadmap)
- Modify: this cycle doc Verification + Ship Notes

- [ ] **11.1 Admin E2E**

```ts
// append to e2e/admin.spec.ts
test("admin can create category + indicator and view audit after edit", async ({ page }) => {
  await page.goto("/admin/student-journal");
  await page.getByRole("button", { name: "Tambah Kategori" }).click();
  // fill dialog, save, assert appears
  // navigate to a student, toggle an entry in edit mode, assert audit tab shows one row
});
```

- [ ] **11.2 Teacher E2E**

```ts
// append to e2e/teacher.spec.ts
test("teacher ticks class-day entries and adds a note", async ({ page }) => {
  await page.goto("/teacher/student-journal");
  // pick class + date → entry page
  // toggle 3 indicators for first student → Simpan → toast "Tersimpan"
  // navigate to student week → Tambah Catatan → fill + save → note appears
});
```

- [ ] **11.3 Parent E2E**

```ts
// append to e2e/parent.spec.ts
test("parent views school grid and fills home grid", async ({ page }) => {
  await page.goto("/parent/student-journal");
  // Sekolah tab: grid renders
  // Rumah tab: tap a cell → POST /entries/home succeeds (intercept) → cell reflects checked
  // Catatan tab: thread renders
});
```

- [ ] **11.4 Perf smoke checklist (manual, record output in Verification section)**

- Teacher fills 5 students × 12 indicators in <60s (measure: click-to-visible per tap).
- Home grid tap targets ≥44px (inspect CSS).
- Admin audit diff renders <1s after edit.

- [ ] **11.5 README update**

In [README.md](../../README.md):
- Module list: add **Student Journal (Buku Penghubung)** with status.
- Roadmap: move from backlog → done.
- ADR (if warranted): single-template-with-scope decision.

- [ ] **11.6 Fill Verification + Ship Notes sections in this cycle doc**

- Verification: paste `npm run build && npx vitest run && npx playwright test` output summary.
- Ship Notes: list the migration name, absence of new env vars, rollback = `prisma migrate resolve --rolled-back` then revert app.

- [ ] **11.7 End-of-cycle gate + commit**

```bash
npm run build && npx vitest run && npx playwright test
git add e2e README.md docs/cycles/2026-04-21-student-journal.md
git commit -m "test(student-journal): E2E specs + perf smoke + docs update"
```

---

## Implementation

_To be filled by `/build` task-by-task._

---

## Verification

_To be filled by `/build`. End-of-cycle gate output + manual smoke notes._

---

## Ship Notes

_To be filled by `/ship`. Migrations, new env vars, rollback plan._
