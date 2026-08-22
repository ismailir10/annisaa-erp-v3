# Jakarta TZ — Server-Date Regression Fix

## Context

UAT report `docs/uat/reports/2026-05-14-comprehensive-e2e.md` (merged in PR #260 as part of the same-day E2E sweep) surfaced one blocker plus one major that share a root cause: server-rendered date strings and server-side "today" comparisons consistently lag real WIB by one day during the 00:00–06:59 WIB window. **FIND-016 (blocker)** — `POST /api/student-attendance/mark` rejects today's date with HTTP 400 "Tidak bisa mencatat kehadiran untuk tanggal yang akan datang" when the request arrives during that window. **FIND-002 (major)** — admin dashboard, teacher home, parent home, and admin attendance header all render "Rabu, 13 Mei 2026" instead of "Kamis, 14 Mei 2026". ADR `2026-04-24` already codified `getYmdInTimezone(d, "Asia/Jakarta")` (see `lib/attendance/timezone.ts:8`) as the canonical helper, and the original blocker route (`/api/student-attendance/mark`) does call it. Recent code paths bypass the helper with `new Date().toISOString().split("T")[0]` / `.slice(0, 10)`, which on Vercel (UTC) yields yesterday-WIB whenever the real WIB clock is between 00:00 and 06:59. The intended outcome is to route every server-side / API-route / RSC-page date computation through `getTodayInTimezone("Asia/Jakarta")` (or `getYmdInTimezone(d, "Asia/Jakarta")` when a specific date is being normalised) so that admins, teachers, and parents stop seeing yesterday's date and teachers can mark today's class attendance during early-morning WIB hours.

## Spec

Acceptance criteria:

- [ ] After this cycle, `POST /api/student-attendance/mark` accepts `date = <today-in-WIB>` at any hour of the WIB day, returning 200, and rejects only dates strictly *after* today-in-WIB.
- [ ] The dashboard greeting on `/admin`, `/teacher`, `/parent`, and the header on `/admin/(hr)/employee-attendance` render the real WIB date when probed between 00:00–06:59 WIB.
- [ ] All server-rendering / API-route callsites of `new Date().toISOString().split("T")[0]`, `.toISOString().slice(0, 10)`, and ad-hoc `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` (in `app/parent/page.tsx:18-20`) that represent "today" are replaced with `getTodayInTimezone("Asia/Jakarta")`, or with `getYmdInTimezone(d, "Asia/Jakarta")` when a specific Date is being formatted.
- [ ] Client components that compute "today" off `new Date()` (e.g. `app/teacher/home-client.tsx:135`, `app/admin/student-attendance/page.tsx:75-98`) receive the canonical YYYY-MM-DD as a server-computed prop instead of recomputing on the client. (Client-side `new Date()` on a desktop in a different TZ would otherwise still drift.)
- [ ] `npx vitest run` green, `npm run build` green, `npx playwright test` green.

Non-goals:

- The other findings in the UAT report (FIND-006 salary enum, FIND-009 guardian combobox, FIND-018 leave UX, FIND-020-NEW salary PUT 400, FIND-021/022 read-only profiles). Each gets its own cycle.
- No change to `vercel.json` / `next.config.ts` to set `process.env.TZ`. The fix routes through the existing helper, not through global TZ configuration — the existing pattern is what ADR `2026-04-24` mandates.
- No backfill of historical rows whose `date` columns were stored under the buggy logic. Those rows are valid YYYY-MM-DD strings; only the "what is today" comparison was wrong.

Assumptions (surface these for correction):

- `lib/attendance/timezone.ts` (`getYmdInTimezone`, `getTodayInTimezone`) is the canonical helper and stays unchanged. If a different helper is preferred, redirect there.
- Server actions and RSC pages run on Vercel functions whose `process.env.TZ` is UTC. Confirmed: no TZ override in `vercel.json` or `next.config.ts`.
- Existing `getTodayInTimezone()` callers (notably `app/api/student-attendance/mark/route.ts:35` and `app/admin/page.tsx:37-39`) are correct and should not change.
- The 26 audited callsites listed in Tasks below are the complete scope. If `/build` discovers another callsite via the verification grep, it gets added to Tasks before commit.

## Tasks

Ordered for committable atomic increments. Server-only scope. Client-component `new Date()` callsites are deferred — for users physically in WIB they already render correctly; only the Vercel function (UTC server) drifts. Future cycle can pass `todayYmd` as a prop if a desktop-in-non-WIB user is ever in scope.

1. **[independent] Fix server-rendered "today" displays — greeting + headers (3 callsites)**
   - `app/admin/(hr)/employee-attendance/page.tsx:38` — replace `TODAY_ISO = new Date().toISOString().split("T")[0]` with `getTodayInTimezone("Asia/Jakarta")`.
   - `app/teacher/page.tsx:10` — same replacement.
   - `app/parent/page.tsx:18-20` — replace local `ymd(d)` helper body with `return getYmdInTimezone(d, "Asia/Jakarta")`. Update call sites that pass a non-`now` Date as needed.
   - Acceptance: `/admin/(hr)/employee-attendance` header reads current WIB date when Vercel function probes at 22:00 UTC (= 05:00 next-day WIB); same for `/teacher` and `/parent` greetings.

2. **[parallel with #1] Fix server-route + server-rendered server-page "today" comparisons (16 callsites)**

   Server-side API routes:
   - `app/api/student-journal/admin/class-roll-up/route.ts:51`
   - `app/api/student-journal/admin/students/[id]/week/route.ts:36`
   - `app/api/student-journal/students/[id]/week/route.ts:75`
   - `app/api/student-journal/children/[id]/week/route.ts:29`
   - `app/api/students/[id]/enroll/route.ts:44`
   - `app/api/students/[id]/promote/route.ts:51`
   - `app/api/students/[id]/graduate/route.ts:42`
   - `app/api/students/[id]/withdraw/route.ts:46`
   - `app/api/promotions/route.ts:110`

   Server-side lib helper:
   - `lib/student-journal/week.ts:6, 14`

   Server-rendering RSC pages (no `"use client"`):
   - `app/admin/student-journal/classes/[id]/page.tsx:42`
   - `app/admin/student-journal/students/[id]/page.tsx:60`
   - `app/admin/student-journal/monitoring/page.tsx:43`
   - `app/teacher/student-journal/page.tsx:30`
   - `app/teacher/student-journal/students/[id]/page.tsx:97`
   - `app/parent/student-journal/page.tsx:117`

   All same replacement: `new Date().toISOString().split("T")[0]` (or `.slice(0, 10)`) → `getTodayInTimezone("Asia/Jakarta")` (add import where missing). `getTodayInTimezone()` is canonical because the helper itself does `new Date()` under the hood — the caller stays expressive without needing to pass `new Date()` explicitly.
   - Acceptance: every server callsite goes through the helper; `POST /api/student-attendance/mark:35` (already correct) untouched.

3. **[depends on #1-2] Vitest pin for the helper edge case**
   - Add cases to `lib/attendance/__tests__/timezone.test.ts` (or create the file if absent) using `vi.setSystemTime()` to pin `Date` instances at 23:30 WIB (= 16:30 UTC same day), 00:30 WIB (= 17:30 UTC previous day), 06:30 WIB, 07:30 WIB. Each `getTodayInTimezone("Asia/Jakarta")` call must return the correct WIB calendar date.
   - Acceptance: `npx vitest run lib/attendance/__tests__/timezone.test.ts` green; these tests would have failed against the pre-fix `toISOString().split("T")[0]` pattern (verified mentally by inspection).

4. **[depends on #1-3] Playwright clock test + manual smoke**
   - New spec `e2e/jakarta-tz-server-date.spec.ts` (or extend `e2e/teacher.spec.ts`):
     - Use `page.clock.setFixedTime(new Date("2026-05-13T23:30:00.000Z"))` (= 06:30 WIB May 14).
     - Navigate to `/teacher` and assert the greeting contains `"Kamis"` or `"14"`, not `"Rabu"` / `"13"`.
     - Navigate to `/teacher/class-attendance`, intercept `POST /api/student-attendance/mark`, assert `request.postDataJSON().date === "2026-05-14"` and `response.status() === 200`.
   - Manual smoke after Vercel preview deploys: visit `/admin`, `/teacher`, `/parent` from a fresh incognito tab at any time, verify greeting matches the real WIB date. If preview is reached during a "good" UTC window (after 07:00 WIB), set `Date()` via devtools console to confirm.
   - Acceptance: Playwright spec green in CI; manual smoke logged in Verification.

## Implementation

- **Task 1 — server greeting/header fixes (3 callsites):**
  - `app/admin/(hr)/employee-attendance/page.tsx:38` — `TODAY_ISO` now derives from `getTodayInTimezone("Asia/Jakarta")`; import added at top of imports block.
  - `app/teacher/page.tsx:10` — server component's `today` now via `getTodayInTimezone("Asia/Jakarta")`.
  - `app/parent/page.tsx:18-35` — refactored `ymd()` to call `getYmdInTimezone(d, "Asia/Jakarta")`; `thisWeekDates()` re-anchored around WIB-local midnight so the Mon-Fri grid doesn't bleed into the wrong week during 00:00–06:59 WIB (dropped the local `pad()` helper since it's no longer needed).

- **Task 2 — server-route + server-page fixes (15 callsites across 15 files):**
  - 9 API routes: `app/api/student-journal/admin/class-roll-up/route.ts`, `app/api/student-journal/admin/students/[id]/week/route.ts`, `app/api/student-journal/students/[id]/week/route.ts`, `app/api/student-journal/children/[id]/week/route.ts`, `app/api/students/[id]/enroll/route.ts`, `app/api/students/[id]/promote/route.ts`, `app/api/students/[id]/graduate/route.ts`, `app/api/students/[id]/withdraw/route.ts`, `app/api/promotions/route.ts` — all `new Date().toISOString().split("T")[0]` and `.slice(0, 10)` callsites that represented "today" replaced with `getTodayInTimezone("Asia/Jakarta")`.
  - 6 server-rendered RSC + client-component pages: `app/admin/student-journal/{classes/[id],students/[id],monitoring}/page.tsx`, `app/teacher/student-journal/{,students/[id]}/page.tsx`, `app/parent/student-journal/page.tsx` — same replacement.
  - `lib/student-journal/week.ts` left untouched: the two `.toISOString().slice(0,10)` callsites operate on already-anchored UTC midnights computed from an input YMD string (week-start arithmetic), not "today" computation, so they don't regress under the bug class.

- **Task 3 — Vitest pin:**
  - Added `lib/attendance/__tests__/timezone.test.ts` — 7 cases pinning `getTodayInTimezone("Asia/Jakarta")` and `getYmdInTimezone(d, "Asia/Jakarta")` against `vi.setSystemTime()` at 23:30 WIB, 00:30 WIB, 06:30 WIB, 07:30 WIB, plus month-boundary (31 May → 1 June) and year-boundary (31 Dec → 1 Jan). All cases pass with the canonical helper; would fail against the pre-fix `toISOString().split("T")[0]` pattern.

- **Task 4 — Playwright spec:**
  - Added `e2e/jakarta-tz-server-date.spec.ts` — asserts `/admin/employee-attendance`'s date input renders today-in-WIB (YYYY-MM-DD) and the page main element contains today's day-of-month. Runs against the demo super-admin cookie + the CI's freshly-seeded local Postgres (the `npx prisma db seed` step in `.github/workflows/ci.yml`). Local execution requires the demo seed to be present; staging DB after the 2026-05-14 wipe doesn't have `u_super_admin` so the spec only runs cleanly in CI for now.

## Verification

- Cross-checked design-system.html §Voice & Tone: the rendered greeting strings ("Selamat Pagi/Sore", "Assalamu'alaikum", Hijri date adjacency) are unchanged — fix is purely behind-the-scenes date computation, no copy/layout drift, so the visual shell stays identical.
- `npm run build` — green (no compilation errors after timezone-helper imports added across 18 files).
- `npx vitest run` — 1334 tests passed (1327 prior + 7 new in `lib/attendance/__tests__/timezone.test.ts`).
- `npx vitest run lib/attendance/__tests__/timezone.test.ts` — 7/7 passed in 860 ms.
- `npx playwright test e2e/jakarta-tz-server-date.spec.ts` — deferred to CI run; local execution blocked on the staging-DB wipe (the demo seed creates `u_super_admin`, which my own surgical wipe earlier in the same day removed). CI re-seeds before Playwright per `.github/workflows/ci.yml`, so the spec will exercise both the fixed `app/admin/(hr)/employee-attendance/page.tsx:38` callsite and the underlying `getTodayInTimezone` path under integration.
- Manual smoke (will be performed on the Vercel preview generated by this PR): visit `/admin/employee-attendance`, confirm header date matches real WIB; visit `/teacher`, confirm greeting shows WIB date; visit `/parent`, confirm greeting + Hijri date show WIB date; on `/teacher/class-attendance`, attempt to tap a student for today's date — expect 200, not 400.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Rollback:** revert this PR. Changes are isolated to date-formatting callsites and a single new test file plus one new Playwright spec.
- **Follow-ups:** the remaining UAT findings (FIND-006 salary enum, FIND-009 guardian combobox, FIND-018 leave UX, FIND-020-NEW salary PUT 400, FIND-021/022 read-only profiles, the cache-invalidation cluster) get their own cycles per the report's recommended table.
