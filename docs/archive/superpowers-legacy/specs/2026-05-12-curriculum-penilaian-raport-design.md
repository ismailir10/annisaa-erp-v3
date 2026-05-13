# Curriculum + Penilaian + Raport — Design

**Date:** 2026-05-12
**Owner:** ismailir10 (CTO)
**Status:** Approved (brainstorm phase complete; awaiting implementation plan)
**Source artifacts:** An Nisaa' Drive folder `1-fAUpreoeJzQAtkNDYepfeCcUTKqqZAX` (Semester 2 TA 25/26 curriculum + assessment + raport documents)

---

## 1. Context

An Nisaa' Sekolahku currently runs a paper + spreadsheet pedagogy stack alongside Talib. Drive artifacts reveal three load-bearing workflows the ERP does not yet model:

1. **Curriculum spine** — `PROMES` (Program Semester) spreadsheets per kelompok usia (A/B) map national-PAUD `Capaian Perkembangan Diri` → `Tujuan Pembelajaran (TP)` → `Indikator Ketercapaian Tujuan Pembelajaran (IKTP)` across 5 curriculum elements (Nilai Agama dan Budi Pekerti, Jati Diri, STEAM, Motorik, Seni) and a weekly theme/sub-theme timeline (Saya Anak Sehat, Aku Berakhlak, Senang Berkarya, Senang Berpetualang, AN NISAA FEST, Pengayaan, PAC, Raport).
2. **Penilaian** — two parallel assessment tracks: (a) **Penilaian Pekanan** filled per-student per-week by the homeroom walas; (b) **Penilaian Harian** filled per-student per-day per-sentra by the sentra teacher (8 sentra: Ibadah, Bahan Alam, Seni, Memasak, Main Peran, Balok, Persiapan, AREA). Both feed the triwulanan raport.
3. **Raport Triwulan** — per-student narrative report card aggregating Penilaian into 5 narrative sections + closing material. Authored via shared kisi-kisi (rubric template): walas team co-writes 3 narrative buckets per section per triwulan, then assigns each student to one bucket per section. Final docx/PDF compiled per student.

### Pain signals from artifacts

- **60+ duplicated weekly xlsx** per semester per kelompok. Indicator phrasing drifts across walas (typos, reordering). TK B all 4 walas this pekan copy-pasted the same 20-item list; TK A 4 walas each chose different 5-7 item lists for the same theme.
- **No source of truth for indicators.** Per-walas custom lists per pekan defeat cross-class comparison and raport aggregation.
- **No audit trail.** Per-student paper forms with dot marks; no link from a raport bucket to the evidence that supports it.
- **Manual raport compile.** Walas hand-assembles per-student docx from shared kisi-kisi + paper Penilaian. 8 walas × ~20 students × 4 triwulan/year = ~640 docx/year.
- **Two different scoring scales co-exist.** Sentra uses 2-level SM/BM; Pekanan walas uses dots; Raport uses 3-level (Mampu Konsisten / Mampu Belum Konsisten / Perlu Penguatan).

### Goals + non-goals

**In scope (this initiative):**
- Curriculum Spine (admin-managed PROMES; seed via xlsx import)
- Penilaian (unified Pekanan + Harian with `source` discriminator; mobile-first teacher portal)
- Raport (template-driven narrative; per-student bucket assignment; PDF + docx generation; parent comment workflow)

**Out of scope (deferred post-launch):**
- Modul Ajar Pekanan/Harian generation (lesson plans)
- Hafalan structured tracking (Quran surah/hadis/doa progression) — free-text in raport narrative for now
- Sentra rotation scheduling (which student in which sentra on which day)
- Lomba/Events module (AKSERA, MABIT, An Nisaa Fest scoring + RAB)
- LKA (Lembar Kerja Anak) worksheet storage

---

## 2. Spec

### 2.1 Scoring scale (locked)

Single 3-level enum, used uniformly across Pekanan, Harian-Sentra, and Raport buckets:

```
AchievementLevel ::= CONSISTENT | EMERGING | NEEDS_REINFORCEMENT
```

User-facing display copy (Indonesian, per voice.md):
- `CONSISTENT` → "Mampu dan Konsisten"
- `EMERGING` → "Mampu Belum Konsisten"
- `NEEDS_REINFORCEMENT` → "Perlu Penguatan"

**Open item:** user to discuss the scale change with sentra teachers (currently SM/BM 2-level). If teachers reject 3-level for sentra entry, fallback is to record SM/BM at sentra and derive 3-level for raport aggregation (out of current scope).

### 2.2 Indikator source (locked)

PROMES-canonical. When walas fills Penilaian Pekanan, the indicator picker shows only `AchievementIndicator` rows whose parent `LearningObjective` matches the walas's `ageGroup` AND whose `IndicatorThemeLink` includes the active week's theme. No free-text indicators. Forces curriculum discipline; eliminates drift.

### 2.3 Raport narrative ownership (locked)

Per term, per age group, walas team co-authors 15 bucketed narratives (5 sections × 3 levels) + 3 closing templates (Penutup, Rencana Tindak Lanjut, Kegiatan Disarankan di Rumah). Stored in `ReportNarrativeTemplate` + `ReportClosingTemplate`. Reusable next academic year via clone.

### 2.4 Parent visibility (locked)

Penilaian Pekanan: live per-pekan after walas submits week. Parent sees per-element progress (count of `CONSISTENT` / `EMERGING` / `NEEDS_REINFORCEMENT` for the term in each curriculum element) on `/parent/perkembangan/[studentId]`.

Raport Triwulan: hidden until `publishedAt` set by `SUPER_ADMIN`. Then parent downloads PDF, optionally types comment + e-signs.

### 2.5 Cadence (locked)

- 2 semesters per academic year (existing)
- **2 triwulan per semester** = 4 triwulan/year
- ~17 pekan per semester (existing curriculum convention)

### 2.6 Output formats (locked)

- **PDF** via `@react-pdf/renderer` (existing dependency) — parent download
- **docx** via `docxtemplater` (new dependency) — walas pre-publish edit
- Both rendered from same `ReportCardEntry` + templates; no manual format divergence

### 2.7 Hafalan (deferred — free-text for July)

For July launch, walas types Quran surah / hadis / doa list in `memorizationNotes` free-text field on `ReportCardEntry`. Structured tracking (progression model, per-surah completion timestamps) deferred to a post-launch cycle.

### 2.8 Attendance ingestion (locked)

Auto-pull from existing `learning.Attendance` table on raport draft creation:
- `sickDays` = count of `SICK` status entries within term window
- `permittedAbsenceDays` = count of `PERMITTED` (izin) status
- `unexcusedAbsenceDays` = count of `UNEXCUSED` (alpa) status
- `totalSchoolDays` = count of school days in term window

Walas may override any value (e.g. correct a misclassified day).

### 2.9 Parent meeting attendance (new tracking)

Per ZHIAN.docx, raport tracks parent's attendance at Parenting Club + Pengajian. Stored as JSON on `ReportCardEntry`:

```json
{
  "parenting": "1/2",
  "pengajian": null
}
```

Walas types fraction string per known event series. Structured tracking deferred.

---

## 3. Architecture

### 3.1 Module touchpoints

```
NEW: curriculum
  Owns: Semester → Theme → SubTheme → Week
         LearningObjective → AchievementIndicator → IndicatorThemeLink
         CurriculumElement enum, AgeGroup enum
  Admin-only CRUD. PROMES xlsx import as primary seed path.

EXTEND: learning
  Adds: AssessmentEntry (replaces ad-hoc usage of existing AssessmentTemplate scoring)
        AssessmentSource enum, LearningCenter enum
  Existing: Attendance, AssessmentTemplate (deprecated for new entries, schema kept)

NEW: reportCard
  Owns: Term, ReportNarrativeTemplate, ReportClosingTemplate,
         ReportCardEntry, StudentMeasurement
         ReportSection enum
  Generates: PDF + docx per student.
  References: curriculum.AchievementIndicator (for aggregation hints),
              learning.AssessmentEntry (display only),
              learning.Attendance (auto-fill days),
              students.Student (header metadata)
```

### 3.2 Permissions

| Permission | Roles |
|---|---|
| `curriculum.read` | TEACHER, SUPER_ADMIN, SCHOOL_ADMIN |
| `curriculum.write` | SUPER_ADMIN |
| `learning.penilaian.read` | TEACHER (own students), GUARDIAN (own children) |
| `learning.penilaian.write` | TEACHER (limited to assigned `ClassSection` for walas; any TEACHER for sentra entry) |
| `reportCard.template.write` | TEACHER (walas only, gated by `ClassSection.isHomeroom`) |
| `reportCard.entry.write` | TEACHER (walas of student's `ClassSection`) |
| `reportCard.publish` | SUPER_ADMIN, SCHOOL_ADMIN |
| `reportCard.parent.read` | GUARDIAN (own children, post-`publishedAt`) |
| `reportCard.parent.sign` | GUARDIAN |

### 3.3 No new portal

All work fits in existing admin + teacher + parent portals. Mobile-first teacher portal pattern (max-w-md) preserved.

---

## 4. Data Model

All new tables are tenant-scoped (`tenantId` field, indexed). All include `createdAt` + `updatedAt`. Soft-delete via `deletedAt` per `.claude/standards/crud.md`. Field names are English; user-facing display copy is Indonesian.

### 4.1 Curriculum

```prisma
model Semester {
  id              String   @id @default(cuid())
  tenantId        String
  academicYearId  String
  number          Int      // 1 or 2
  startDate       DateTime
  endDate         DateTime
  themes          Theme[]
  objectives      LearningObjective[]
  terms           Term[]
  @@unique([tenantId, academicYearId, number])
}

model Theme {
  id          String   @id @default(cuid())
  tenantId    String
  semesterId  String
  name        String   // Indonesian, e.g. "Saya Anak Sehat"
  order       Int
  subThemes   SubTheme[]
  links       IndicatorThemeLink[]
}

model SubTheme {
  id        String @id @default(cuid())
  tenantId  String
  themeId   String
  name      String  // Indonesian
  order     Int
  weeks     Week[]
}

model Week {
  id          String   @id @default(cuid())
  tenantId    String
  subThemeId  String
  number      Int      // 1..N within semester
  startDate   DateTime // Monday (Jakarta tz)
  endDate     DateTime // Friday
  @@unique([tenantId, subThemeId, number])
}

enum CurriculumElement {
  RELIGIOUS_MORAL   // Nilai Agama dan Budi Pekerti
  IDENTITY          // Jati Diri
  STEAM             // STEAM / Literasi
  MOTOR_SKILLS      // Motorik
  ART               // Seni
}

enum AgeGroup {
  A   // 4-5 years (TK A)
  B   // 5-6 years (TK B)
}

model LearningObjective {
  id              String   @id @default(cuid())
  tenantId        String
  semesterId      String
  ageGroup        AgeGroup
  element         CurriculumElement
  number          Int      // 1..N within element+ageGroup
  competencyText  String   // CAPAIAN PERKEMBANGAN DIRI
  content         String   // Tujuan Pembelajaran narrative
  indicators      AchievementIndicator[]
  @@unique([tenantId, semesterId, ageGroup, element, number])
}

model AchievementIndicator {
  id          String   @id @default(cuid())
  tenantId    String
  objectiveId String
  content     String   // IKTP text, Indonesian
  order       Int
  themeLinks  IndicatorThemeLink[]
}

model IndicatorThemeLink {
  indicatorId String
  themeId     String
  @@id([indicatorId, themeId])
}
```

### 4.2 Learning (extensions)

```prisma
enum AssessmentSource { HOMEROOM, CENTER }

enum LearningCenter {
  WORSHIP            // Sentra Ibadah
  NATURAL_MATERIALS  // Sentra Bahan Alam
  ART                // Sentra Seni
  COOKING            // Sentra Memasak
  ROLE_PLAY          // Sentra Main Peran
  BLOCKS             // Sentra Balok
  PREPARATION        // Sentra Persiapan
  AREA               // AREA
}

enum AchievementLevel {
  CONSISTENT
  EMERGING
  NEEDS_REINFORCEMENT
}

model AssessmentEntry {
  id           String          @id @default(cuid())
  tenantId     String
  studentId    String
  indicatorId  String
  date         DateTime        @db.Date  // Jakarta-tz date
  weekId       String                    // denormalized for fast roll-up
  source       AssessmentSource
  center       LearningCenter?           // required iff source = CENTER
  activity     String?                   // free-text kegiatan, sentra context
  level        AchievementLevel
  note         String?
  recordedById String
  recordedAt   DateTime        @default(now())
  @@unique([tenantId, studentId, indicatorId, date, source])
  @@index([tenantId, weekId, studentId])
  @@index([tenantId, studentId, date])
}
```

Existing `AssessmentTemplate` model + its BB/MB/BSH/BSB enum stays in schema (do not break historical data). New UI writes only to `AssessmentEntry`. Old surface deprecated in code comments + sidebar nav update.

### 4.3 Report Card

```prisma
enum ReportSection {
  // bucketed (3-level narratives via ReportNarrativeTemplate):
  INTRODUCTION
  RELIGIOUS_MORAL
  IDENTITY
  STEAM
  PERFORMANCE_SHOWCASE   // Unjuk Kerja

  // single-content (via ReportClosingTemplate):
  CLOSING                // Penutup
  FOLLOW_UP_PLAN         // Rencana Tindak Lanjut
  HOME_ACTIVITIES        // Kegiatan Disarankan di Rumah
}

model Term {
  id          String    @id @default(cuid())
  tenantId    String
  semesterId  String
  number      Int       // 1 or 2 per semester
  startDate   DateTime
  endDate     DateTime
  publishedAt DateTime?
  @@unique([tenantId, semesterId, number])
}

model ReportNarrativeTemplate {
  id            String           @id @default(cuid())
  tenantId      String
  termId        String
  ageGroup      AgeGroup
  section       ReportSection    // must be one of the bucketed sections
  level         AchievementLevel
  content       String           // markdown narrative paragraphs, Indonesian
  authoredById  String
  updatedAt     DateTime         @updatedAt
  @@unique([tenantId, termId, ageGroup, section, level])
}

model ReportClosingTemplate {
  id        String        @id @default(cuid())
  tenantId  String
  termId    String
  ageGroup  AgeGroup
  section   ReportSection // CLOSING | FOLLOW_UP_PLAN | HOME_ACTIVITIES
  content   String        // Indonesian
  updatedAt DateTime      @updatedAt
  @@unique([tenantId, termId, ageGroup, section])
}

model ReportCardEntry {
  id                       String    @id @default(cuid())
  tenantId                 String
  studentId                String
  termId                   String
  homeroomTeacherId        String

  // 5 bucketed sections, one level each. JSON shape:
  //   { INTRODUCTION: "CONSISTENT", RELIGIOUS_MORAL: "EMERGING", ... }
  sectionLevels            Json

  // Attendance (auto-pulled from learning.Attendance, walas may override)
  permittedAbsenceDays     Int
  sickDays                 Int
  unexcusedAbsenceDays     Int
  totalSchoolDays          Int

  // Parent attendance to school events
  // e.g. { parenting: "1/2", pengajian: null }
  parentMeetingAttendance  Json?

  // Hafalan free-text (Quran surah / hadis / doa list) for July scope
  memorizationNotes        String?

  // Parent post-publish workflow
  parentComment            String?
  parentSignedAt           DateTime?

  // Internal signatures (audit trail; not legal e-signature)
  walasSignedAt            DateTime?
  kepalaSignedAt           DateTime?

  status                   String    @default("DRAFT")  // DRAFT | REVIEWED | PUBLISHED
  publishedAt              DateTime?

  @@unique([tenantId, studentId, termId])
}

model StudentMeasurement {
  id          String   @id @default(cuid())
  tenantId    String
  studentId   String
  termId      String
  heightCm    Decimal? @db.Decimal(5, 1)
  weightKg    Decimal? @db.Decimal(4, 1)
  recordedAt  DateTime @default(now())
  @@unique([tenantId, studentId, termId])
}
```

**Why `sectionLevels` is JSON, not a child table:** 5 fixed sections per entry; atomic per-entry write; no need to query a single section across students. If analytics later require it, migrate to `ReportSectionLevel(reportCardEntryId, section, level)`.

### 4.4 ClassSection extension

Add `isHomeroom` on the existing `ClassSectionTeacher` (or equivalent) link, or `homeroomTeacherId` directly on `ClassSection`. Required so `/teacher/raport` and `/teacher/penilaian/pekanan` route only to walas of their assigned section. Schema patch deferred to C1 — verify codebase first.

---

## 5. UI + Routes

### 5.1 Admin (desktop sidebar, `/admin`)

```
/admin/curriculum
  /semesters                                  list, create per academic year
  /semesters/[id]/themes                      Theme/SubTheme/Week CRUD
  /semesters/[id]/objectives                  TP + IKTP + IndicatorThemeLink matrix
  /semesters/[id]/import                      PROMES xlsx upload + preview + commit

/admin/terms                                  Term CRUD, publish per term

/admin/report-cards
  /                                           list students × term × status
  /[studentId]/[termId]                       view/edit/publish single ReportCardEntry
  /templates/[termId]/[ageGroup]              co-author narrative + closing templates
```

Sidebar adds two entries (Indonesian labels): "Kurikulum", "Raport".

### 5.2 Teacher (mobile-first `max-w-md`, `/teacher`)

```
/teacher/penilaian
  /                                           landing: current pekan card + sentra picker
  /pekanan                                    walas-only week grid
                                              UI: theme-filtered IKTP dropdown,
                                                  vertical student roster,
                                                  3-tap level setter per (student × date),
                                                  optimistic write
  /sentra/[center]                            any teacher; pick date + activity + ≤4 IKTP,
                                              roster × indicator grid, 3-level tap,
                                              per-cell note field

/teacher/raport
  /                                           list students in own ClassSection for active Term
  /[studentId]                                5-section bucket picker, attendance display,
                                              measurement entry, parent-event fraction inputs,
                                              memorizationNotes textarea
                                              Status DRAFT → REVIEWED (Kepala approves)
  /templates                                  walas-only; section-tabbed editor
                                              5 bucketed sections (3 buckets each)
                                              + 3 single-content sections
                                              Co-author: last-write-wins + toast warning
                                                       on stale `updatedAt`
```

### 5.3 Parent (mobile-first `max-w-md`, `/parent`)

```
/parent/perkembangan
  /                                           per-kid list (multi-kid households)
  /[studentId]                                per-element progress bars (count per level
                                                this term), latest pekan preview
  /[studentId]/raport                         published Term list with download buttons
  /[studentId]/raport/[id]/sign               opens after PDF download;
                                              comment textarea + sign-now confirm modal
```

Parent home greeting card gains a "Perkembangan minggu ini" preview (top 3 indicators with level).

### 5.4 API routes

```
POST   /api/admin/curriculum/import-promes
GET    /api/admin/curriculum/semesters/[id]/objectives
POST   /api/admin/curriculum/semesters
POST   /api/admin/curriculum/themes
PATCH  /api/admin/curriculum/themes/[id]
DELETE /api/admin/curriculum/themes/[id]
POST   /api/admin/curriculum/objectives
PATCH  /api/admin/curriculum/objectives/[id]
POST   /api/admin/curriculum/indicators
PATCH  /api/admin/curriculum/indicators/[id]
POST   /api/admin/curriculum/indicator-theme-links

POST   /api/teacher/penilaian                bulk upsert AssessmentEntry rows
GET    /api/teacher/penilaian/week/[weekId]  walas week roll-up for current ClassSection
POST   /api/teacher/sentra/penilaian         sentra teacher bulk upsert

GET    /api/teacher/raport/term/[termId]/students
GET    /api/teacher/raport/[studentId]/[termId]
POST   /api/teacher/raport/[studentId]/[termId]
POST   /api/teacher/raport/templates/[termId]/[ageGroup]/[section]/[level]
POST   /api/teacher/raport/closing/[termId]/[ageGroup]/[section]

GET    /api/parent/perkembangan/[studentId]
GET    /api/parent/raport/[studentId]/[termId]/pdf
POST   /api/parent/raport/[studentId]/[termId]/sign

POST   /api/admin/raport/[studentId]/[termId]/publish
GET    /api/admin/raport/[studentId]/[termId]/pdf
GET    /api/admin/raport/[studentId]/[termId]/docx
```

All `/api/*` follow conventions in `.claude/standards/api.md`. Auth + tenant-filter via existing middleware. RLS coverage check (`scripts/verify-rls-coverage.sh`) gates new tables.

---

## 6. Migration + Seed Strategy

### 6.1 PROMES import pipeline

```
Admin uploads PROMES TK A SMT 1.xlsx + PROMES TK B SMT 1.xlsx (one per ageGroup)
  ↓
Parser (lib/curriculum/promes-parser.ts):
  1. Detect element headers: "NAM PROGRAM SEMESTER ...", "JATI DIRI ...",
     "STEAM ...", "MOTORIK ...", "SENI ..."
  2. Extract themes from header row (cols D onwards):
     Saya Anak Sehat | Aku Anak Berakhlak | Senang Berkarya | Senang Berpetualang | AN NISAA FEST | Pengayaan | PAC | Raport
  3. Extract sub-themes from row 2 (nested under each theme)
  4. For each TP block: extract competencyText + content + child IKTPs
  5. Scan "TRUE" markers per (IKTP × theme) → IndicatorThemeLink rows
  ↓
Preview screen: tree view by Element → TP → IKTP, plus theme-link matrix.
  Edit-in-place text correction for typo fixes (e.g. "sedrhana" → "sederhana").
  ↓
Commit → bulk insert LearningObjective + AchievementIndicator + IndicatorThemeLink
  Tag with semesterId + ageGroup.
```

Parser handles: trailing whitespace, ALL-CAPS variants, sentence-case typos, merged-cell artifacts (multiple commas), missing rows. Vitest test corpus = the two existing PROMES files plus 1 synthetically corrupted variant.

### 6.2 Theme/SubTheme/Week timeline

Separate seed step (not in PROMES xlsx import). Admin defines per semester:

- **Themes**: 6 fixed (per current An Nisaa' practice):
  1. Saya Anak Sehat
  2. Aku Anak Berakhlak Mulia
  3. Saya Senang Berkarya
  4. Saya Senang Berpetualang
  5. AN NISAA FEST
  6. Pengayaan / PAC / Raport
- **SubThemes** per Theme (3-5 each, e.g. "Makananku Sehat dan Bergizi" under "Saya Anak Sehat")
- **Weeks** per SubTheme with explicit Senin-Jumat date ranges in Asia/Jakarta tz

Provide "Template tahunan" button that pre-fills the standard 17-week semester structure. Admin edits dates only.

### 6.3 Student roster + walas mapping (pre-cutover audit)

```
For each TK A and TK B ClassSection (A1..A4, B1..B4):
  - Verify walas user exists (TEACHER role)
  - Verify student → ClassSection assignment (use existing academic module)
  - Mark walas with isHomeroom = true on ClassSection link
```

Walas needs `isHomeroom` so the teacher portal can route `/teacher/raport` and `/teacher/penilaian/pekanan` only to homeroom walas. Sentra entry stays open to any TEACHER.

### 6.4 8-week migration sequence

```
Weeks 1-3 (May 12 - May 30):
  C1: Curriculum schema + Theme/Semester CRUD            (5d) → ship May 19
  C2: PROMES xlsx parser + import                        (5d) → ship May 26
  C3: TP + IKTP + ThemeLink CRUD                         (4d) → ship May 30
  ─ in parallel: school authors TA 26/27 SMT 1 PROMES (lock-in by June 10)

Weeks 4-6 (June 1 - June 20):
  C4: AssessmentEntry + walas Pekanan UI                 (7d) → ship June 8
  C5: Sentra Harian UI                                   (4d) → ship June 14
  C6: Parent /perkembangan                               (3d) → ship June 18

Weeks 7-8 (June 20 - July 1):
  C7: TA 26/27 SMT 1 PROMES seed + ClassSection audit
      + UAT walkthrough + walas training                 (8d) → ship June 30
  Cutover July 1: walas drop xlsx, sentra teachers drop docx
```

September pack:

```
Weeks 14-18 (Aug 20 - Sep 15):
  C8:  Raport schema + admin                             (5d) → ship Aug 29
  C9:  Walas template co-author editor                   (5d) → ship Sep 5
  C10: Per-student raport entry                          (4d) → ship Sep 11
  C11: PDF + docx + parent sign workflow                 (4d) → ship Sep 15
```

First triwulan TA 26/27 SMT 1 ends ~late October. C11 ships ~6 weeks earlier, giving walas runway to author templates from real data.

---

## 7. Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| School's TA 26/27 SMT 1 PROMES not authored by June 10 | Medium | High (blocks cutover) | Lock author deadline with Kepala Divisi Pendidikan in week 1. Fallback: clone SMT 2 25/26 PROMES with date shift. |
| Walas resist 3-level scale (sentra teachers comfortable with SM/BM) | Medium | Medium | User (CTO) discusses with teacher team before May 25. Fallback: record SM/BM at sentra, derive 3-level for raport. |
| Sentra teachers also resist 3-level (training overhead) | Low | Low | Same as above; fallback acceptable. |
| Concurrent walas template edits cause merge conflicts | Medium | Low | Last-write-wins + `updatedAt` toast warning. Defer real-time collab. |
| 160 walas/sentra teachers + parents online on cutover day overload Vercel free tier | Low | Medium | Pre-cutover load test with k6 / artillery; warm Prisma pool; staged rollout (TK A first day, TK B day +1). |
| PROMES parser misreads merged-cell artifacts | High | Low | Hybrid: parser fills 80%, admin edits inline before commit. Tests cover the 2 existing files. |
| docx output doesn't match current paper raport fidelity | Medium | Low | Visual diff against ZHIAN.docx, RAYYAN.docx samples in C11. Acceptance bar: indistinguishable to a parent. |
| Parent e-signature has unclear legal weight | Low | Low | Document as audit trail (timestamp + IP), not as legally binding e-signature. Existing paper signatures continue in parallel for parents who want them. |
| Existing `AssessmentTemplate` users break after `AssessmentEntry` ships | Low | Medium | Keep `AssessmentTemplate` schema intact; deprecate UI surface only. Migration script later. |

---

## 8. Open Items (require external input)

1. **Teacher scale discussion** — user to talk with sentra + walas team about 3-level adoption before May 25. Output: confirm scale lock or trigger fallback design.
2. **TA 26/27 SMT 1 PROMES authoring** — user to lock deadline with Kepala Divisi Pendidikan (Dra. Era Zamona Chattar) in week 1. Authored PROMES must be ready for import by June 10.
3. **NISN field on Student** — verify `students` Prisma model has `nisn` column (national student ID). Add if missing in C8.
4. **Existing `homeroomTeacher` flag** — verify `ClassSection` / `ClassSectionTeacher` has `isHomeroom` or equivalent. Add in C1 if missing.
5. **Sentra → ClassSection mapping** — sentra rotation deferred, but C5 needs to know which students are eligible for which sentra session. Assume any student in ageGroup A is eligible for any TK A sentra session; sentra teacher picks the relevant roster on the entry screen.

---

## 9. Personas + Glossary (for context)

**Personas:** see `.claude/personas/` for Pak Budi (admin), Bu Sari (teacher), Ibu Nur (parent). Walas team for An Nisaa' as of artifact date:
- TK A: Hana Hanifah (A1), Meilani Mulya Puteri (A2), Ayu Rahma Yuniska (A3), Lutfi Femiliana (A4)
- TK B: Diana Lestari, Eneng Rina, Elviarini Haziza, Yulia Purbaningsih (+ Femi separate folder)
- Kepala Divisi Pendidikan: Dra. Era Zamona Chattar
- Kepala RA An Nisaa: Eneng Rina S.Pd.I
- Kepala TKIT An Nisaa: Elviarini Haziza S.Pd

**Glossary (Indonesian → English code identifier):**
- Tema → Theme
- Sub-tema → SubTheme
- Pekan → Week
- Tujuan Pembelajaran (TP) → LearningObjective
- IKTP (Indikator Ketercapaian TP) → AchievementIndicator
- Triwulan → Term
- Penilaian → Assessment
- Walas (wali kelas) → homeroomTeacher
- Raport → ReportCard
- Hafalan → memorizationNotes
- Kelompok Usia → AgeGroup
- Sentra → LearningCenter (enum: WORSHIP, NATURAL_MATERIALS, ART, COOKING, ROLE_PLAY, BLOCKS, PREPARATION, AREA)
- Fase Fondasi → display label "Fondasi" (national PAUD framework stage, hardcoded for both A and B)

---

## 10. Acceptance criteria summary

**Pack 1 (July 1):**
- [ ] Admin can seed PROMES TA 26/27 SMT 1 via xlsx import (TK A + TK B)
- [ ] Walas can fill Pekanan from mobile, indicator dropdown is theme-filtered IKTP only
- [ ] Sentra teacher can fill Harian-Sentra from mobile with activity descriptor + ≤4 IKTP
- [ ] All assessment entries persist with `source` discriminator; same student × indicator × date unique per source
- [ ] Parent sees `/parent/perkembangan/[studentId]` with per-element progress live within pekan
- [ ] All TEACHER-role users with walas or sentra assignment trained and using ERP day-one (target July 1). Some teachers hold dual walas + sentra roles (e.g. Diana Lestari = walas B AND Guru Sentra Ibadah).
- [ ] No xlsx weekly penilaian filed for TA 26/27 SMT 1 (cutover hard)

**Pack 2 (Sep 15):**
- [ ] Walas team co-authors 15 bucketed + 3 closing templates per term per ageGroup
- [ ] Per-student raport draft: bucket picker + measurement + attendance auto-pull + memorization notes
- [ ] Kepala publish gate; PDF + docx output match ZHIAN.docx fidelity bar
- [ ] Parent downloads PDF; opens comment + sign flow; signature timestamp recorded
- [ ] First triwulan TA 26/27 SMT 1 raport publishable by mid-October (~6 weeks runway)
