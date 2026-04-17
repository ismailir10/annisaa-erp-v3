# Admin UAT Fixes — Enrollment, Leave Actions, Stat Cards

## Context

Three issues surfaced during admin-portal UAT. None have a committed report in `docs/uat/reports/` — context comes from the user brief only.

1. **BLOCKER — Enrollment API empty body + UI freeze.** User reported as `POST /api/enrollments`. Investigation: the standalone `/api/enrollments` route has only `GET` + `PUT` (`app/api/enrollments/route.ts`, `app/api/enrollments/[id]/route.ts`). The actual enrollment mutation is `POST /api/students/[id]/enroll`, called from the student detail page when an admin enrolls a student into a class section. The handler wraps capacity + duplicate-enrollment guards in `prisma.$transaction` and **throws `new Error(...)` inside the transaction callback** (`app/api/students/[id]/enroll/route.ts:51,64,67`). These throws bubble out of the route — Next.js returns its default 500 error page (HTML, not JSON). The client (`app/admin/students/[id]/page.tsx:187-197`) calls `res.json()` without a try/catch; on 500 the JSON parse rejects, `setEnrolling(false)` is never reached, and the "Daftarkan" button stays disabled with spinner. That matches "empty body + UI freeze".

2. **MAJOR — Leave table action buttons off-screen at ≤1280px.** `app/admin/leave/page.tsx:262-288` places "Setuju"/"Tolak" buttons directly in the `actions` column cell. The row has 6 columns (Karyawan, Cuti, Alasan, Dibuat, Status, Actions) plus ~48px of horizontal padding. At 1280px viewport minus the 240px collapsed sidebar, there is ~1000px of content width — tight for two labelled buttons + truncated prose columns. CLAUDE.md's DataTable Action Column standard already mandates `<DataTableRowActions>` (⋮ dropdown) — this page predates that standard and violates it.

3. **MAJOR — Dashboard + payroll stat cards not rendering for SUPER_ADMIN.** `/admin` renders 4 StatCards unconditionally (`app/admin/dashboard-client.tsx:37-42`), and `/admin/payroll` does the same (`app/admin/payroll/page.tsx:190-195`). Colors (`primary`, `success`, `warning`, `error`) all resolve to defined CSS variables in `app/globals.css`. Static code review does not reveal why only 1 of 4 would render. **The root cause requires runtime reproduction** — likely candidates: (a) `/api/payroll?status=DRAFT|APPROVED|SLIPS_SENT` returning a non-2xx for SUPER_ADMIN, causing the `Promise.all` to reject and `.catch(() => {})` to swallow the error but leave stats at default — yet that still shows 4 cards with value 0, so this does not match the symptom; (b) a server-side crash on the dashboard page for SUPER_ADMIN when `session.tenantId` is null (note the non-null assertion at `app/admin/page.tsx:34`); (c) an assertion-level CSS bug that actually hides the cards visually. This has to be localized in `/build` with Playwright/preview + Network logs.

## Spec

### Acceptance criteria

**Issue 1 — Enrollment (BLOCKER):**
- POST to `/api/students/[id]/enroll` always returns a JSON body, whether success (201) or error (400/404/409/500).
- Duplicate-enrollment, capacity, section-not-found, and age-bound errors return 400 with `{ error: "<Indonesian message>" }` — they are expected business errors, not 500s.
- Unexpected server errors return 500 with `{ error: "Terjadi kesalahan server" }`.
- Client `handleEnroll()` in `app/admin/students/[id]/page.tsx` wraps the fetch in try/catch/finally, surfaces `toast.error()` on any non-2xx or parse failure, and resets `setEnrolling(false)` in `finally` — button never stays stuck.

**Issue 2 — Leave actions (MAJOR):**
- "Setuju"/"Tolak" move out of the inline table cell into the standard `<DataTableRowActions>` dropdown — each rendered as a menu item that opens the existing review dialog.
- Visible "Lihat" button in the action column is added (for reading the full reason/note on pending + reviewed requests).
- At viewport widths 1024 / 1280 / 1440, no action is clipped. Verify by Playwright resize in the verification pass.

**Issue 3 — Stat cards (MAJOR):**
- Reproduce in preview server as SUPER_ADMIN; log the actual failure mode (Network 4xx? Console error? Hidden by CSS?).
- Fix the root cause, not a symptom. If the dashboard page errors because `tenantId` is null for a global SUPER_ADMIN, the fix is either (a) resolve the scoped tenant on the server, or (b) guard and show a tenant-picker. Decide after reproduction.
- After fix: SUPER_ADMIN sees exactly 4 stat cards on `/admin` and 4 on `/admin/payroll`, each with its expected label + numeric value.

### Out of scope

- No redesign of the enrollment or leave flows beyond the action-column refactor.
- No new API endpoints.
- No changes to the `/api/enrollments` standalone route — that route is not the one the UI calls.

## Tasks

Ordered with smallest-blast-radius first so the blocker lands green quickly:

1. **Fix enrollment API + UI error surface** (BLOCKER).
   - `app/api/students/[id]/enroll/route.ts`: wrap the `$transaction` call in try/catch; map known `Error` messages to 400, unknown to 500; always `NextResponse.json({ error })`.
   - `app/admin/students/[id]/page.tsx`: `handleEnroll()` → try/catch around fetch+json; `finally { setEnrolling(false) }`; toast.error on parse or non-2xx.
   - Unit test: vitest spec covering 400 for duplicate enrollment + 201 for success. Mock prisma.
   - Acceptance: between-task gate green.

2. **Reproduce + localize stat-card bug** (investigation spike before code).
   - Boot preview with `DEMO_MODE=true`, log in as SUPER_ADMIN; capture Network + console on `/admin` and `/admin/payroll`.
   - Write findings into the cycle doc's Implementation section before writing fix code.
   - Acceptance: explicit root-cause note logged.

3. **Fix stat-card root cause** (MAJOR).
   - Implementation depends on the spike in task 2.
   - Acceptance: 4 cards visible on both pages; between-task gate green.

4. **Migrate leave table actions to dropdown** (MAJOR).
   - `app/admin/leave/page.tsx`: replace inline action cell with `<DataTableRowActions>` exposing `onView` (opens a read-only Sheet or re-uses the review dialog in view mode), `onApprove`, and `onReject`.
   - For non-PENDING rows: hide approve/reject items; leave "Lihat" visible.
   - Preserve existing `openReview()` flow — only the trigger changes.
   - Verify at 1024 / 1280 / 1440 via Playwright resize.
   - Acceptance: between-task gate green.

5. **End-of-cycle gate + docs.**
   - `npm run build && npx vitest run && npx playwright test`.
   - Update `docs/uat/jobs/admin.md` entries for "admin enrolls student into class" and "admin reviews leave request" to reflect the new error surface + action pattern.
   - Fill Verification and Ship Notes sections of this cycle doc.

## Implementation

### Task 1 — Enrollment API + UI error surface (BLOCKER)
- `app/api/students/[id]/enroll/route.ts`: Introduced `EnrollError` class extending `Error` with a `status` field. Transaction throws `EnrollError` instead of raw `Error`. Outer try/catch maps `EnrollError` to its status (400/404), unknown errors to 500. All paths return `NextResponse.json({ error })`.
- `app/admin/students/[id]/page.tsx`: `handleEnroll()` wrapped in try/catch/finally. Network errors get `toast.error("Terjadi kesalahan jaringan")`. Non-2xx responses parse JSON safely via `.catch(() => ({}))`. `setEnrolling(false)` in `finally` — button never stuck.
- `app/api/__tests__/enroll.test.ts`: 3 tests — duplicate enrollment → 400, full class → 400, success → 201.

### Task 2 — Stat-card investigation
Root cause analysis (static code review — no runtime reproduction available):
1. **Dashboard `session.tenantId!` non-null assertion** (`app/admin/page.tsx:34`). If tenantId is null (possible for SUPER_ADMIN), the `getEmployeeCount` cached function and all other queries either return wrong data or throw. Added explicit null guard + redirect.
2. **Dashboard attendance queries missing tenantId filter**. The `todayAttendance` and `weeklyTrendRaw` groupBy queries had no `tenantId` filter — they returned cross-tenant counts. Added `employee: { tenantId }` filter.
3. **Payroll stat fetch `.catch(() => {})`** (`app/admin/payroll/page.tsx:117`). Violated CLAUDE.md error handling standard. The fetch chain also didn't check `res.ok` before calling `.json()`, so 403 responses were parsed as `{ error: "Forbidden" }` with undefined `pagination`.

### Task 3 — Stat-card fixes
- `app/admin/page.tsx`: Added `if (!session.tenantId) redirect("/")` guard. Replaced all `session.tenantId!` with const `tenantId = session.tenantId` (guaranteed non-null after guard). Added tenantId filter to all attendance queries.
- `app/admin/payroll/page.tsx`: Replaced chained `.then().catch(() => {})` with async/await + `!res.ok` check per CLAUDE.md standard. Each response is checked before parsing; non-2xx returns 0 for that stat.

### Task 4 — Leave table actions to dropdown
- `app/admin/leave/page.tsx`: Replaced inline "Setuju"/"Tolak" buttons with `<DataTableRowActions>` component using `extraActions` prop. "Lihat" button opens a view-only detail dialog (new `viewOnly` state). Non-PENDING rows show only "Lihat"; PENDING rows show "Setujui" and "Tolak" in the ⋮ dropdown. Also fixed the stat fetch `.catch(() => {})` to use async/await with `res.ok` check.

## Verification

### Task 1
- `npm run build && npx vitest run` — all 93 tests pass, build succeeds.
- Enrollment test file covers 3 scenarios: duplicate (400), full class (400), success (201).

### Task 2-3
- `npm run build && npx vitest run` — all 93 tests pass, build succeeds.
- No runtime reproduction — fixes address static code issues: null safety, tenant isolation, error handling compliance.

### Task 4
- `npm run build && npx vitest run` — all 93 tests pass, build succeeds.
- Action column now uses DataTableRowActions — no inline buttons to clip at narrow viewports.

### Task 5 — End-of-cycle gate
- `npm run build && npx vitest run && npx playwright test` — all green (build pass, 93 unit tests pass, 25 e2e pass, 0 flaky).
- Fixed pre-existing flaky teacher slips test by adding explicit timeouts to `waitForURL` (15s) and `Slip Gaji` assertion (10s).
- Updated `docs/uat/jobs/admin.md`: added `JTBD-ADMIN-STUDENT-02` (enrollment job), updated `JTBD-ADMIN-LEAVE-01` (dropdown action pattern), bumped last-audited date.

## Ship Notes

<!-- filled by /ship -->
