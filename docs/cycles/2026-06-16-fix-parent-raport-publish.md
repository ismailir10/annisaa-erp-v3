# Fix: Admin Triwulan Raport Not Shown to Parents

## Context

**Launch blocker for the July 2026 raport cutover.** Found via staging E2E QA.

Publishing a raport in `/admin/raport` (Penilaian → Raport — the #319 "Admin Raport
MVP", `ReportCardEntry` model with `sectionLevels`/`sectionNarratives`) does **not**
reach the parent portal.

**Repro (staging):** admin builds + "Simpan & Terbitkan" a Triwulan-1 raport for a
student → parent `/parent/reports` banner says "sudah terbit", but "Buka rapor" opens
a legacy "Laporan Perkembangan Semester 1 (Demo)" (Motorik/Bahasa, BSH/MB/BB). None of
the authored narrative / Capaian shows.

**Root cause (confirmed via systematic-debugging Phase 1–3):** two disconnected raport
systems.

| | Admin writes | Parent reads |
|---|---|---|
| Model | `ReportCardEntry` (3-level skala) | `StudentAssessment` (legacy 4-level) |
| Write/read path | PUT `/api/admin/raport/[studentId]/[termId]` | `getPublishedAssessmentsForStudent` → `studentAssessment` |
| Content | narrative sections + Kehadiran + measurements + hafalan | template categories/indicators, BB/MB/BSH/BSB |

`app/parent/reports/page.tsx:27` calls `getPublishedAssessmentsForStudent`
(`lib/parent-helpers.ts:271`) which reads `studentAssessment` — the seeded
"…(Demo)" row (`prisma/seed.ts:1395`). The published `ReportCardEntry` is never read on
any parent surface. `getPublishedAssessmentsForStudent` is used **only** by the reports
page; the per-row detail API `app/api/guardian/assessments/[id]/route.ts` and the client
`app/parent/assessments-table.tsx` are its only consumers.

The admin PDF route (`/api/admin/raport/[studentId]/[termId]/pdf`) already builds the
correct `ReportCardData` from `ReportCardEntry` using `lib/raport/labels.ts` — that
section/level-building logic is the reusable core for the parent surface.

## Spec

**Acceptance criteria**

1. `/parent/reports` reads **published `ReportCardEntry`** for the selected child
   (`status = PUBLISHED`, non-deleted), not `studentAssessment`.
2. "Buka rapor" drawer renders the authored content: narrative sections (in canonical
   order, with Indonesian section labels), 3-level skala chips (Mampu dan Konsisten /
   Mampu Belum Konsisten / Perlu Penguatan), Kehadiran (Sakit/Izin/Alpa/Hari sekolah),
   Pertumbuhan (tinggi/berat) when present, and Hafalan when present.
3. "Unduh PDF" button in the drawer downloads the same raport PDF via a
   **guardian-scoped** route (ownership-checked, PUBLISHED-only) — admin PDF route is
   `reportCard.read`-gated and not reachable by GUARDIAN.
4. Latest published raport is the headline (celebration banner + "Buka rapor"); older
   published raports list under "Riwayat rapor".
5. The legacy "(Demo)" parent read path is **dropped**: `getPublishedAssessmentsForStudent`,
   `app/parent/assessments-table.tsx`, and `app/api/guardian/assessments/[id]/route.ts`
   are removed (all dead after the switch). The admin-side `StudentAssessment` template
   system (`/admin/assessment-templates`, `/api/assessments/student/[id]`) is **out of
   scope** and untouched.
6. Pre-publish / no published raport → existing "Rapor belum terbit" empty state.
7. Publishing/unpublishing a raport invalidates the parent cache (new published row
   shows within the cache TTL or immediately on revalidation).

**Non-goals**

- No change to admin authoring UI / write path / validations.
- No change to the `StudentAssessment` admin template system.
- No parent comment / e-signature workflow (schema fields exist but stay unwired).
- `parentMeetingAttendance` (parent-event fractions) not surfaced to parent this cycle —
  out of master-design parent scope; defer.

**Assumptions**

- Parent surface renders from server-fetched data passed as props (no new per-row detail
  API) — ownership already enforced by `getParentWithChildren` in the page. Mirrors the
  parent-attendance-scoping security pattern.
- Guardian PDF route mirrors `app/api/guardian/assessments/[id]/route.ts` security
  (getSession + role GUARDIAN + child-ownership), not `requirePermission`.

## Tasks

1. **Shared section-builder** — extract `ReportCardSection[]` building (section order +
   labels + level formatting) from the admin PDF route into `lib/raport/build.ts`
   (`buildReportSections(sectionLevels, sectionNarratives)`). Repoint the admin PDF route
   to it. Unit test. No behaviour change (refactor; green = parity).
2. **Guardian read helper** — add `getPublishedReportCardsForStudent(studentId, tenantId)`
   to `lib/parent-helpers.ts`: PUBLISHED non-deleted `ReportCardEntry` for the student,
   joined to Term (label) + `StudentMeasurement`, mapped to `{ termId, period,
   publishedAt, sections, attendance, hafalan, height, weight }` (sections via Task 1
   builder). Cached + tagged `parent-report-cards`, ordered `publishedAt desc`. Add
   `revalidateTag("parent-report-cards")` to publish/unpublish in
   `app/api/admin/raport/_helpers.ts` (`setPublishState`). Unit test the mapping.
3. **Guardian PDF route** — `app/api/guardian/raport/[studentId]/[termId]/pdf/route.ts`:
   GUARDIAN role + ownership + PUBLISHED-only, reuse `ReportCardData` building +
   `ReportCardPdf`. Extract the `ReportCardData` assembly shared with the admin PDF route
   into `lib/raport/build.ts` to avoid divergence. Route test (403 non-guardian, 404
   non-owned/unpublished, 200 owned-published).
4. **Parent surface** — replace `getPublishedAssessmentsForStudent` in
   `app/parent/reports/page.tsx` with the Task 2 helper; replace `assessments-table.tsx`
   with a new `app/parent/report-cards-list.tsx` rendering banner + "Buka rapor" +
   "Riwayat rapor" + drawer (narrative sections + skala chips + Kehadiran table +
   Pertumbuhan + Hafalan + "Unduh PDF" → guardian route). Cross-check against
   design-system.html (portal drawer/Sheet, celebration card, level chips) — reuse the
   existing reports Sheet shell. Keep "Rapor belum terbit" empty state.
5. **Drop legacy** — delete `app/parent/assessments-table.tsx`,
   `getPublishedAssessmentsForStudent` (and its now-orphan
   `revalidateTag("parent-published-assessments")` in `/api/assessments/student/[id]`),
   and `app/api/guardian/assessments/[id]/route.ts`. Verify no other references via grep.
6. **E2E** — `e2e/parent-raport.spec.ts`: as admin, create a Term + upsert + publish a
   `ReportCardEntry` for the demo guardian's child via API; as guardian, open
   `/parent/reports`, assert authored narrative + a 3-level skala label + Kehadiran +
   "Unduh PDF" are visible and the legacy "(Demo)" text is absent; PDF route returns 200
   for the guardian. `afterEach` deletes the created ReportCardEntry + Term (no staging
   leak — mirrors F-3 teardown).

## Implementation

**Task 1 — Shared section-builder.** New `lib/raport/build.ts`:
`buildReportSections(sectionLevels, sectionNarratives)` (ordered display sections,
Indonesian labels, level formatting, unknown-level → null), `formatTermLabel(...)`,
`buildReportCardData(...)` (full `ReportCardData` for the PDF). Inputs typed `unknown`
to absorb Prisma `JsonValue`; `isObj` guard narrows. Repointed
`app/api/admin/raport/[studentId]/[termId]/pdf/route.ts` to `buildReportCardData` —
deleted its inline section/level loop (parity, no behaviour change). Unit test
`lib/raport/__tests__/build.test.ts` (10 cases): order, level labels, INTRODUCTION/
closing never level-bearing, narrative passthrough, unknown-level null, null-input
tolerance.

**Task 2 — Guardian read helper + cache invalidation.** Added
`getPublishedReportCardsForStudent(studentId, tenantId)` + `ParentReportCard` type to
`lib/parent-helpers.ts`: PUBLISHED non-deleted `ReportCardEntry` joined to Term (label
via `formatTermLabel`) and `StudentMeasurement` (second query joined by `termId` — no
relation exists), sections via `buildReportSections`, Decimal measurements serialised to
string, ordered `publishedAt desc`. Cached/tagged `parent-report-cards`. Added
`revalidateTag("parent-report-cards", { expire: 0 })` to `setPublishState` in
`app/api/admin/raport/_helpers.ts` (the repo idiom — Next 16 requires the 2nd arg).
Unit test `lib/__tests__/parent-helpers.report-cards.test.ts` (4 cases): scoping/order,
empty short-circuit, full mapping, measurement join + Decimal→string.

## Verification

- Task 1 between-task gate: `npm run build` ✓ · `npx vitest run` ✓ (203 files, 2025
  passed, 42 todo, 2 skipped). New build.test.ts 10/10.
**Task 3 — Guardian PDF route.** New
`app/api/guardian/raport/[studentId]/[termId]/pdf/route.ts`: GUARDIAN role +
parent-ownership (mirrors `app/api/guardian/assessments/[id]/route.ts`) + PUBLISHED-only
`reportCardEntry.findFirst`; any miss → flat 404 (no existence disclosure). Reuses
`resolveTerm` + `buildReportCardData` + `ReportCardPdf` (identical render to admin PDF).
Route test `app/api/__tests__/guardian-raport-pdf-route.test.ts` (6 cases): 403
non-guardian/unauth, 404 non-owned, 404 unpublished, PUBLISHED+deletedAt where-clause
assertion, 200 owned-published with 8 sections + Indonesian level.

- Task 2 between-task gate: `npm run build` ✓ · `npx vitest run` ✓ (204 files, 2029
  passed, 42 todo, 2 skipped). New report-cards.test.ts 4/4.
- Task 3 between-task gate: `npm run build` ✓ · `npx vitest run` ✓ (205 files, 2035
  passed, 42 todo, 2 skipped). `verify-api-auth.sh` ✓ (176/176) · `verify-rls-coverage.sh`
  ✓ (37/37). New guardian-raport-pdf-route.test.ts 6/6.

## Ship Notes

<!-- /ship fills: migrations, env vars, rollback -->
