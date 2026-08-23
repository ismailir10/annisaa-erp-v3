# Student Dossier — Increment 3 (Overview Aggregate, Pendaftaran, Akademik)

## Context

Increment 1 (#516) rebuilt `/admin/students/[id]` as the Direction A dossier — anchor nav, collapsible sections, sticky rail — deliberately payload-only, adding no route and no query. Increment 2 (#518) added Keuangan, Keringanan and Buku Penghubung over routes that already accepted a `studentId`, still adding no route.

Both stopped at the same wall, and both said so in writing. Increment 2's Spec, item 5:

> The rail gains a **Tunggakan** tile with the real outstanding figure. No tile is added for attendance or raport — those still need increment 3's aggregate route, and a permanently blank tile reads as broken.

and its Ship Notes:

> **Follow-ups (owner-gated, not in this cycle):** increment 3 — `GET /api/students/[id]/overview` for the attendance and raport rail tiles, plus `/enrollment-application` and `/academics`. Those tiles are still deliberately absent rather than shipped blank.

The reason those two tiles were held back is the reason this increment needs new routes rather than new fetches. Filling them the way increments 1 and 2 filled everything else — call an existing list route with a `studentId` — would mean fetching a month of `StudentAttendance` rows and a term of `AssessmentEntry` rows to derive four numbers, on every student-detail view. An admin opens this page dozens of times a day.

Three gaps, then:

| Gap | What an admin has to do today |
|---|---|
| Attendance + raport tiles | Nothing — they do not exist. Open `/admin/student-attendance` and `/admin/raport` and search the child in each |
| The original pendaftaran form | Know the application exists, then click the provenance link in the rail. Nothing on the page says the extra data is there |
| Raport state across terms | `/admin/raport`, pick a term, pick a class, find the child. Once per term |

The pendaftaran gap is the sharpest. `app/api/enrollments/[id]/convert` copies a subset of the paper form onto `Student` and `Parent` rows; the father's and mother's employer blocks, the birth circumstances, the family's prior attendees and the signed consent letter stay in `EnrollmentApplication` and are effectively orphaned the moment the student record is created.

## Spec

1. **`GET /api/students/[id]/overview`** — aggregates only. Invoice `groupBy(status)` with summed due/paid, current-month attendance `groupBy(status)`, current-term assessment-entry count + distinct-indicator count, report-card status per term, and document-presence booleans. Not one row of a student's invoices, attendance or penilaian crosses the wire. Fired in parallel with the main student GET.
2. The **Kehadiran** and **Raport** rail tiles are populated from it. Both distinguish "not loaded" from a real zero, exactly as increment 2's Tunggakan tile does — `Memuat…`, then a dash on failure, never `0`.
3. **Outstanding stays where increment 2 put it.** The overview route returns the per-status *breakdown*, not a second outstanding figure. A `groupBy` sum cannot reproduce `summarizeStudentInvoices`' per-invoice `remaining > 0` post-filter, and the UAT-2026-05-03 INV-01 disagreement is what that shared function exists to prevent. The breakdown renders as a status line inside Keuangan; the Tunggakan tile is untouched.
4. **`GET /api/students/[id]/enrollment-application`** — the original form, read-only, resolved by the `EnrollmentApplication.studentId` FK rather than the editable `metadata.fromEnrollmentApplication` pointer. 404 for a hand-entered student. Closed-set `select`: no `accessToken`, no `tokenExpiresAt`.
5. Surfaced as a **Formulir Pendaftaran** section, lazy, rendered only when the overview says an application exists — so a hand-entered student never sees an empty section or a dead nav entry. Consent signatures use the existing admin-gated `/api/enrollments/[id]/signature?which=` proxy; no new image route.
6. **`GET /api/students/[id]/academics`** — one row per triwulan: raport status (`NONE | DRAFT | PUBLISHED`) plus that term's penilaian entry count and coverage %. Read-only section, each row deep-linking to `/admin/raport`.
7. **Coverage is null, not 0, when unanswerable** — no active enrolment means no age-group cohort means no denominator. `0%` on a child nobody could have assessed reads as a teacher failing; a dash reads as "we cannot say".
8. Both new sections are **lazy** and `keepMounted`, matching Keringanan and Buku Penghubung.
9. **Sections become hash-addressable.** `#akademik`, `#pendaftaran`, `#keuangan` — the page honours `location.hash` on load, expanding the target before scrolling. A deep link into a lazy, collapsed section three quarters down a long page is otherwise a link to nothing.
10. `/admin/raport` honours `?termId=&classSectionId=&studentId=`, seeded not controlled, so the Akademik rows land on the child's own raport — the same treatment `/admin/fees` got for `?tab=` in increment 2.
11. Admin-only on all three routes, tenant-scoped. No schema change, no migration.

## Tasks

- T1 — `lib/student/overview.ts`: pure shaping helpers (status ordering, attendance counting, coverage %, raport-per-term join, tally, label) + the wire type. Unit tests.
- T2 — `lib/student/dossier-aggregates.ts`: the DB half, shared by both aggregate routes so they cannot disagree about which term is current. Unit tests for the pure calendar helpers.
- T3 — `GET /api/students/[id]/overview` + route tests.
- T4 — `GET /api/students/[id]/enrollment-application` + route tests.
- T5 — `GET /api/students/[id]/academics` + route tests.
- T6 — Extract `components/admin/enrollment-application-view.tsx` from `/admin/enrollments/[id]` and reuse it in both places.
- T7 — `StudentAcademicsBlock` and `StudentEnrollmentApplicationBlock` (both lazy, both owning their fetch).
- T8 — Page wiring: eager overview fetch, the two rail tiles, the two sections, the hash deep-link, the consent row in the Berkas checklist.
- T9 — `/admin/raport` deep-link params.

## Implementation

| File | Change |
|---|---|
| `lib/student/overview.ts` *(new)* | Pure: `orderInvoiceGroups` (owed-first, unknown status sorted after rather than dropped, overpaid bucket clamped at zero), `countAttendanceByStatus` (an unrecognised status still counts toward the denominator), `coveragePercent` (null on no denominator, clamped at 100), `joinRaportByTerm` (left join — a term with no entry is `NONE`, not absent), `tallyRaport`, `termLabel`, and the `StudentOverview` wire type. Dependency-free so the client imports it without pulling in Prisma. |
| `lib/student/dossier-aggregates.ts` *(new)* | The DB half: `currentJakartaMonth`, `resolveStudentAgeGroup` (same rule as the raport editor), `loadTerms`, `pickCurrentTerm` (containing term → last started → first upcoming), `pickPenilaianTerms` (the ACTIVE year, else the current term alone), `loadTermPenilaian` (one `groupBy(indicatorId)` yielding both distinct-indicator and entry counts), `loadIndicatorTotals`, `loadRaportEntries`. |
| `app/api/students/[id]/overview/route.ts` *(new)* | Aggregates only. One `findFirst` for the tenant check + document booleans, then six parallel aggregate reads, then the current term's penilaian. |
| `app/api/students/[id]/enrollment-application/route.ts` *(new)* | Resolved by the `studentId` FK with the tenant predicate inside the query. Closed-set select. |
| `app/api/students/[id]/academics/route.ts` *(new)* | Per-term rows; penilaian computed for the ACTIVE year's terms only, older terms return `penilaian: null`. |
| `app/api/students/[id]/route.ts` | `classSection.id` added to the enrollment select — it is what lets an Akademik row deep-link with the roster preselected. |
| `components/admin/enrollment-application-view.tsx` *(new)* | Read-only form body extracted verbatim from `/admin/enrollments/[id]`, plus a `columns` prop. Entity-agnostic: takes four JSON blobs and an application id. |
| `app/admin/enrollments/[id]/page.tsx` | Renders the shared view; ~90 lines of option-label lookups deleted. |
| `components/admin/student-academics-block.tsx` *(new)* | Lazy. Per-term row with raport badge, entry count, coverage, and a deep link. |
| `components/admin/student-enrollment-application-block.tsx` *(new)* | Lazy. One-column form + a link to the Pendaftaran module. |
| `components/admin/student-finance-block.tsx` | Optional `statusGroups` → a per-status breakdown line under the four figures. |
| `app/admin/students/[id]/page.tsx` | Eager overview fetch, Kehadiran + Raport tiles, Akademik + Formulir Pendaftaran sections, hash deep-link, consent row in the Berkas checklist. |
| `app/admin/raport/page.tsx` | Honours `?termId=&classSectionId=&studentId=`. |
| tests *(4 new files)* | 52 new tests — see Verification. |
| `README.md` | students module line notes the two new sections, the aggregate-backed tiles and the hash addressing. |

**Why a new route instead of another `studentId` filter.** Increments 1 and 2 established "call the route that already accepts a studentId", and it was right for invoices, keringanan and the journal, where the section renders the rows anyway. It breaks for attendance and raport: those tiles need four numbers derived from a month and a term of rows, and the section does not render the rows at all. Shipping the tiles over a list route would have meant paying for a row dump on every page view to display `15/18`. That is exactly the cost increment 2 refused, which is why it left the tiles out and named this route as the fix.

**Where the outstanding figure did *not* move.** The obvious-looking win here is to feed the Tunggakan tile from the aggregate and stop fetching 100 invoice rows eagerly. It was not taken. `summarizeStudentInvoices` post-filters each unpaid invoice on `remaining > 0`; a `groupBy` sum nets an overpaid invoice against an underpaid one inside the same status bucket, so the two would disagree on exactly the families most likely to be looked at. Increment 2 made that function the single owner of "what does this family owe" after the UAT-2026-05-03 INV-01 disagreement, and one page showing two different balances is a worse outcome than one extra indexed query. The route returns the per-status breakdown instead, which is information the four totals do not carry: `1 lewat tempo · Rp 400.000` next to `1 lunas` is the shape of the problem.

**The one deliberate cap.** Coverage costs one aggregate query per term, so `/academics` computes it for the ACTIVE academic year's terms only. Older terms still appear as rows — their raport status is the point of the section — but carry `penilaian: null`, and the UI says "tidak dihitung untuk tahun ajaran lampau" rather than printing a `0%` that would read as "nobody assessed this child". Pinned by a test that asserts the archived term is never queried *and* still renders.

**Null over zero, three times.** Coverage with no age-group cohort, a month with no attendance rows, and a tenant with no terms all render as a dash with a reason, not as a number. Same rule increment 2 wrote for the failed invoice fetch, applied to the cases where the fetch succeeds and the answer is genuinely "we cannot say".

## Verification

**Gates** — all run in `.worktrees/dossier-increment-3`, branched from `origin/staging` at `9894a501` (which is #518):

- `npm run build` — ✅ `✓ Compiled successfully in 4.8s`.
- `npx vitest run` — ✅ `Test Files 330 passed | 2 skipped (332)` · `Tests 3229 passed | 42 todo (3271)`, 31s. Full suite, not per-file. Increment 2 recorded 324 files / 3163 tests; this cycle adds 6 files and 66 tests.
- `npx tsc --noEmit` — ✅ exit 0, no output.
- `npm run lint` — ✅ `61 problems (0 errors, 61 warnings)`. Same 61 increment 2 recorded; grep confirms none is on a file this cycle added or touched.
- `bash scripts/verify-api-auth.sh` — ✅ `194 / 194 routes have session helper or @public sentinel` (191 + the three new ones).
- `bash scripts/verify-rls-coverage.sh` — ✅ `41 / 41 tenant-scoped models have ENABLE + policy`. No new model.
- `bash scripts/audit-docs.sh` — ✅ `10 ok, 1 warn, 0 fail`. The warn is the pre-existing 61-day ADR row, unchanged from increment 2.
- **Playwright** — deferred to the required CI `Playwright E2E` check. Not runnable locally: `playwright.config.ts` refuses a non-local `DATABASE_URL` and this worktree's `.env` points at shared staging, where the specs would write real rows.

**New tests (66).**

- `lib/student/__tests__/overview.test.ts` — 18. Ordering, unknown status kept, Decimal-as-string, null sums, overpaid clamp, unrecognised attendance status in the denominator, coverage null-vs-zero and the >100 clamp, `NONE` rows preserved, a report card for a deleted term ignored.
- `lib/student/__tests__/dossier-aggregates.test.ts` — 9. Term-in-window, the December holiday gap, pre-year fallback, the ACTIVE-year cap and its single-term fallback, and that `currentJakartaMonth` rolls to February at 31 Jan 22:00 UTC.
- `app/api/students/[id]/__tests__/overview-route.test.ts` — 15. Four access cases (anon / teacher / guardian / cross-tenant), each aggregate, the no-terms and no-enrolment paths, document booleans, and one that asserts the route **never calls `findMany`** on invoices, attendance or penilaian.
- `app/api/students/[id]/__tests__/enrollment-application-route.test.ts` — 7. Gate, FK resolution, tenant predicate inside the query, 404 for a hand-entered student, and that `accessToken` / `tokenExpiresAt` are absent from the select.
- `app/api/students/[id]/__tests__/academics-route.test.ts` — 9. Gate, row order, labels, distinct-indicator coverage, null cohort, empty calendar, and both halves of the query cap.
- `app/admin/students/[id]/__tests__/dossier-increment-3.test.tsx` — 12. Eager overview, both tiles, the empty-month dash, the failure dash, laziness of both sections, no re-request on re-open, the raport deep-link's three params, the section omitted for a hand-entered student, the hash deep-link, the status breakdown, a malformed 200 body degrading rather than throwing, and the raport-hint defect found in smoke (below).

- [x] Cross-checked `design-system.html`: Shadcn primitives only (`Card`, `Badge`, `Skeleton`, `EmptyState`, `StatusBadge`, `Collapsible`), `px-card` spacing, `font-currency` + `tabular-nums` on every money figure, `-text` colour variants (`text-status-absent-text`, `text-muted-foreground`) rather than raw fills — the contrast rule increments 1 and 2 both recorded for the rail. The new `StatusBreakdown` reuses `getStatusConfig` so a status label is spelled the same in the chip and on the badge beside it.

**Manual smoke** — local `DEMO_MODE=true next start` on port 3210 against the staging DB, demo cookie, student `cms41al32003bi5x72axm73vb` (Abdullah Faris Siregar: 16 invoices — 9 PAID, 6 SENT, 1 OVERDUE — 2 attendance rows this month, 1 term, no raport). Screenshots at 1440 and 390 in `~/Documents/ai-builder/talib-screenshots/2026-08-23-dossier-increment-3/`.

Everything on the page came from real staging data:

- Kehadiran tile `1/2 · 1 sakit`; Raport tile `0/1`; Tunggakan `Rp 10.940.000 · 7 tagihan belum lunas · 10 Apr 2026`, unchanged from increment 2.
- Status breakdown line `1 lewat tempo · Rp 1.700.000 · 6 link dibuat · Rp 9.240.000 · 9 lunas`, matching the four totals above it.
- Akademik: `TW1 · Sem 2 · 2025/2026 [berjalan] · 1 penilaian · 1/13 indikator (8%) · Belum dibuat`. The 13 is the real ACTIVE indicator count for this child's age-group cohort, so coverage is computed end-to-end, not stubbed.
- Mobile: both new tiles join the stat grid, Akademik joins the accordion, and the coverage line wraps to two lines rather than truncating.

**One defect found in that smoke and fixed before this doc was written.** The Raport tile's hint read `terbit` for a student with one term and no raport at all — `published: 0, draft: 0` fell through to the "all published" branch, so the tile said a raport had been issued next to a `0/1` saying none had. Now `Belum ada raport`, with `semua terbit` reserved for the case it was meant for. Pinned by a test.

**Not verified this cycle.**

- **The Formulir Pendaftaran section against real data.** No student on staging was converted from a form — all three `EnrollmentApplication` rows have `studentId: null` — so the section correctly does not render for any staging student, and its absence for a hand-entered student is what the screenshot shows. No rows were written to shared staging to make a screenshot look better. The section's own rendering is covered by unit test, and screenshots 03/04 show the *same extracted component* (`EnrollmentApplicationView`) against the real submitted application `cmt2xqh7l000004l8ixyrryiu` on `/admin/enrollments/[id]` — which is the surface the dossier section wraps.
- **Consent signature images.** They render as broken images locally. Not a code defect: the stored tokens are valid (`supabase:v1:enrollment/…/ayah-signature-….png`), but this machine's `.env` has no `SUPABASE_SERVICE_ROLE_KEY`, so `streamFile` cannot reach the private bucket and the proxy correctly 404s. The signature route is unchanged by this cycle. Confirm on the Vercel preview, where the key is set.
- **Penilaian coverage above 8%.** Staging holds 4 `AssessmentEntry` rows tenant-wide. The populated arithmetic is unit-tested.
- **Preview-verify on Vercel** — runs after the PR opens.

**Environment note, not a code finding.** The worktree's `node_modules` was left truncated by an out-of-disk `npm install` mid-cycle (`@next/swc-darwin-arm64` was 865 KB instead of 88 MB, and several packages were missing outright). `npm install` does not repair that — it considers the tree satisfied. A full `rm -rf node_modules && npm install` plus `npx prisma generate` was needed. Worth knowing next time a worktree build fails with `Module not found` on packages that are plainly in `package.json`.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none.
- **New routes:** three, all `GET`, all admin-gated and tenant-scoped — `/api/students/[id]/overview`, `/api/students/[id]/enrollment-application`, `/api/students/[id]/academics`. Route count 191 → 194.
- **Data:** none written. Every route this cycle adds is a read.
- **Performance:** one extra request per student-detail view (`/overview`), fired in parallel with the student GET. It issues aggregate reads only — `invoice.groupBy` on `@@index([studentId, status])`, `studentAttendance.groupBy` on `@@index([studentId, date])`, `assessmentEntry.groupBy` on `@@index([tenantId, studentId, date])`, `reportCardEntry.findMany` on `@@index([tenantId, studentId])` — and returns no rows. Academics and Pendaftaran add nothing until their section is opened. `/academics` is bounded to one aggregate query per ACTIVE-year term.
- **Rollback:** revert the merge commit. The three routes are additive and nothing calls them but the dossier; `?termId=` on `/admin/raport` and the hash handler both fall back to the previous behaviour when absent; no persisted state changes shape.
- **Follow-up (not in this cycle):** `GET /api/enrollments/[id]` still returns `accessToken` and `tokenExpiresAt` to the admin page via an open `include`. Admin-gated, so not a cross-role leak, but needless exposure — the new route was written with a closed select instead of widening that one. Narrowing it is a separate change with its own blast radius on the enrollment detail page.
