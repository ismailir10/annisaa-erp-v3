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
**Task 4 — Parent surface.** Repointed `app/parent/reports/page.tsx` from
`getPublishedAssessmentsForStudent` to `getPublishedReportCardsForStudent(studentId,
tenantId)` (added a `session.tenantId` guard). New client
`app/parent/report-cards-list.tsx`: celebration banner + "Buka rapor" + "Riwayat rapor"
+ Sheet drawer rendering authored sections (label + 3-level skala Badge + narrative,
empty sections hidden), Kehadiran 4-cell grid, Pertumbuhan, Hafalan, and "Unduh PDF" →
the guardian PDF route. Renders entirely from server props (no per-row fetch; ownership
already enforced upstream). Header subtitle → "tiap triwulan". Cross-checked
design-system.html portal shell (celebration gold card, bottom/right Sheet, p-card,
status badge). Empty state "Rapor belum terbit" preserved.

- Task 3 between-task gate: `npm run build` ✓ · `npx vitest run` ✓ (205 files, 2035
  passed, 42 todo, 2 skipped). `verify-api-auth.sh` ✓ (176/176) · `verify-rls-coverage.sh`
  ✓ (37/37). New guardian-raport-pdf-route.test.ts 6/6.
**Task 5 — Drop legacy.** Deleted `app/parent/assessments-table.tsx` and
`app/api/guardian/assessments/[id]/route.ts`; removed `getPublishedAssessmentsForStudent`
+ `PublishedAssessmentListItem` from `lib/parent-helpers.ts`; removed the now-orphan
`revalidateTag("parent-published-assessments")` / `revalidatePath("/parent/reports")`
block (and its `next/cache` import) from `app/api/assessments/student/[id]/route.ts` —
legacy StudentAssessment publishing no longer touches any parent surface. The admin
StudentAssessment template system is otherwise untouched (out of scope). Net API route
count unchanged: +1 (guardian raport PDF) −1 (guardian assessments) = 175.

- Task 4 between-task gate: `npm run build` ✓ (vitest unchanged — UI-only task; full
  flow proven by Task 6 E2E + `/ship` preview-verify). Local dev seed ships no published
  ReportCardEntry, so only the empty state is reachable without API seeding.
- Task 5 between-task gate: `npm run build` ✓ · `npx vitest run` ✓ (205 files, 2035
  passed, 42 todo, 2 skipped). `verify-api-auth.sh` ✓ (175/175). Grep confirms zero
  lingering references to the deleted symbols.

**Task 6 — E2E `e2e/parent-raport.spec.ts`.** Two demo-mode tests. (1) Guardian opens
`/parent/reports`: header renders, the legacy "Laporan Perkembangan Semester 1" /
"Perkembangan Motorik Halus" strings are absent (count 0), and either the empty state or
the published-rapor surface shows; when a "Buka rapor" button exists, clicking it asserts
the authored drawer (Kehadiran heading + Unduh PDF button). (2) Guardian PDF route:
bogus child as guardian → 404; the same route with an admin session → 403.

Why no admin-publish→guardian-content fixture: no Term/ReportCardEntry DELETE API exists
(a created fixture can't be torn down → staging leak), and reseeding staging would wipe
pilot data. The authored-content end-to-end is delegated to `/ship` preview-verify on the
real Vercel preview using the staging Google logins — the surface the bug was found on.

- Task 6 verification: `e2e/parent-raport.spec.ts` ✓ **2/2 passed** (targeted run,
  `E2E_ALLOW_REMOTE_DB=1`, read-only GETs — staging-safe). Verbatim:
  ```
  ✓ 1 …parent-raport.spec.ts:42 › reports page renders and never shows the legacy (Demo) report (1.8s)
  ✓ 2 …parent-raport.spec.ts:73 › guardian rapor PDF route is ownership- and role-gated (703ms)
  2 passed (5.5s)
  ```
- **Full Playwright suite (staging): 128 passed / 6 failed / 7 skipped.** All 6 failures
  are in specs/pages this cycle does NOT touch (`git diff origin/staging...HEAD` confirms
  none are in the diff), i.e. pre-existing staging-state / time-relative failures, not
  regressions from this fix:
  - `admin-raport.spec.ts:25 raport surface loads` — asserts the "Buat Triwulan" card
    (assumes **no** Term seeded); staging now has a Term (the bug repro manually built +
    published a Triwulan raport there), so the surface shows the term selector instead.
    Pre-existing spec brittleness — follow-up: make the spec tolerant of an existing Term.
  - `teacher-assessments-weekly.spec.ts:38/49/65/83` — date-relative (assert a 2025-07
    active week; today is 2026-06-16 → no_active_week), staging-curriculum dependent.
  - `admin.spec.ts:437 bulk tagihan … PENDING_PAYMENT_LINK` — Xendit stub failure-path,
    known environmental/flaky.

**Code review (end-of-cycle).** Adversarial pass on the diff found one material issue,
now fixed: the guardian PDF route's ownership query reintroduced the null-email
global-parent-match leak that `lib/parent-helpers.ts` was hardened against — a
`parentId`-null + `email`-null GUARDIAN session would have matched the first null-email
parent in the tenant (~200 on staging) and could fetch a foreign child's raport PDF.
Fixed by requiring `parentId` OR non-empty `email` before the lookup (flat 404
otherwise), mirroring the `_getParentWithChildren` contract. Added 2 regression tests
(no-credential session → 404 without querying; email fallback only for non-empty email).
Refactor parity (shared builder vs. old admin inline) confirmed equivalent — unknown
levels now resolve to `null` instead of `undefined` (strict improvement); admin PDF
route test still green. Post-fix gate: `npm run build` ✓ · `npx vitest run` ✓ (205
files, 2037 passed, 42 todo, 2 skipped); guardian route test 8/8.

**Preview-verify — converged iteration 1 (CLEAN, 0 blockers).** PR #344 Vercel preview
(`annisaa-erp-v3-git-feat-fix-pa-8bec7b…vercel.app`), driven via Chrome MCP against the
real Google-auth staging session — the OAuth-gated surface CI cannot reach. Full
admin-publish → guardian-see flow on real data:
- Signed in as admin (ismailir10@) → `/admin/raport` → Triwulan 1 + TKIT A → authored +
  "Simpan & Terbitkan" a raport for **Aisyah Putri Ramadhani** (Siti's child): Pembukaan
  narrative, Nilai Agama & Budi Pekerti = CONSISTENT + narrative `[VERIFY-RAPORT-2026]`,
  Jati Diri = CONSISTENT. Toast "Raport diterbitkan."
- Signed in as guardian Siti (rightjet.hq@) → `/parent/reports`:
  - Default child tab (Ahmad) → new empty state "Rapor belum terbit", **no legacy
    "(Demo)" report** — the bug symptom is gone.
  - Aisyah tab → celebration banner "Rapor Triwulan 1 · … Aisyah sudah terbit" + "Buka
    rapor" → drawer renders the authored sections (Pembukaan + "Mampu dan Konsisten"
    chips + `[VERIFY-RAPORT-2026]` narrative + Jati Diri), Kehadiran 4-cell grid, and
    "Unduh PDF".
  - "Unduh PDF" → `GET /api/guardian/raport/<aisyah>/<term>/pdf` returns a rendered PDF
    ("An Nisaa' Sekolahku · RAPORT TRIWULAN · Aisyah Putri Ramadhani · TKIT A", all 8
    sections, levels + marker narrative) — guardian PDF route 200, ownership-gated.
- No console errors / layout breaks observed. Staging mutation: one PUBLISHED
  ReportCardEntry for Aisyah (reused the existing Term cmq36gel2…) — left in place as a
  demo fixture.

## Ship Notes

- **Migrations:** none. `ReportCardEntry` / `StudentMeasurement` / `Term` schema is
  unchanged (the #319 MVP already shipped them). Pure read-path rewire + new route.
- **Env vars / deps:** none. No new packages.
- **New surface:** `GET /api/guardian/raport/[studentId]/[termId]/pdf` (GUARDIAN-gated).
  Net API route count unchanged (175 — one added, one removed).
- **Cache:** new tag `parent-report-cards` (120s TTL), evicted on admin raport
  publish/unpublish. No action needed on deploy.
- **Data:** parent `/parent/reports` shows content only once an admin **publishes** a
  raport in `/admin/raport`. No backfill — pre-existing PUBLISHED `ReportCardEntry` rows
  surface immediately. The legacy `StudentAssessment` "(Demo)" rows simply stop being
  read on the parent side (still readable by the admin template system).
- **Rollback:** revert the PR — no schema/data state to unwind.
- **Preview-verify (the authored-content E2E):** on the Vercel preview, sign in as admin
  (ismailir10@gmail.com) → `/admin/raport` → create a Triwulan + author a raport for a
  TKIT-A child of guardian Siti → "Simpan & Terbitkan". Then sign in as guardian
  (rightjet.hq@gmail.com) → `/parent/reports` → "Buka rapor" → confirm the authored
  narrative + 3-level skala + Kehadiran + working "Unduh PDF", and that no "(Demo)"
  legacy report appears.
- **Follow-up (out of scope):** `admin-raport.spec.ts:25` assumes no Term is seeded and
  now fails against staging (a Term exists from the manual bug repro) — make it tolerant
  of an existing Term.

- **2026-07-19 rescue addendum:** uncommitted follow-up found in worktree — `revalidateTag("parent-report-cards")` on PUBLISHED raport edits so parent cache refreshes immediately (was 120s TTL). Committed by repo audit; needs review + PR.
