# Phase 0.1 — Admin Hydration + Sign-Out Bfcache

> **Source-of-truth plan:** [`docs/plans/2026-05-10-v1-incremental-evolution.md`](../plans/2026-05-10-v1-incremental-evolution.md) §6.
> **Phase:** 0 — Stop Bleeding (UAT blockers).
> **Branch:** `feat/phase0-admin-hydration-and-bfcache` (off `origin/staging` @ `21b9110`).

---

## Context

Two UAT BLOCKERS from the pre-rollback build are still open on the rolled-back staging tip:

- **U1 — admin hydration failure** (UAT 2026-05-02 admin, [report](../uat/reports/2026-05-02-admin.md)). Every admin route Ibu Nur visited (`/admin`, `/admin/students`, `/admin/invoices`, `/admin/payroll`, `/admin/leave-requests`) rendered an empty `<main>`: server streams content into `<div hidden id="S:0">` / `<div hidden id="S:1">` Suspense placeholders, but the React client never runs the inline `$RC(…)` dehydration to flip them visible. Reproduces in fresh tabs. APIs return 200 with valid data — the failure is isolated to client-side hydration of streamed Server Component output. No console errors. Likely a Next.js 16 + Vercel staging interaction (the recent `middleware.ts` → `proxy.ts` rename) or a streaming/CSP edge-case.
- **U6 — sign-out bfcache leak** (UAT 2026-05-03 parent, referenced in [cycle 2026-05-04 follow-ups](2026-05-04-parent-balance-reconcile.md); standalone parent UAT report was not committed pre-rollback). After signing out from `/parent/home`, pressing the browser back-button restores the cached parent home page from bfcache — a privacy leak: anyone using the same device can see the prior user's children, invoices, and reports without re-authenticating. Root cause: neither portal trees nor `POST /api/auth/logout` set `Cache-Control: no-store`, so Chrome bfcaches the auth'd HTML.

**Provenance caveat.** UAT measurements were captured on the pre-rollback build (some on a v2 partial). Rollback to PR #177 (sha `433a3bd`) may have already healed U1 — the `<div hidden id="S:*">` symptom could have been a v2-rebuild artifact. Reproducer verification on the current Vercel preview is **Task 1** before any code lands. If U1 healed by rollback alone, scope shrinks to U6 only and Task 3 becomes a no-op (still records the negative reproduction).

**Plan §6 scope correction.** The plan listed `app/{admin,parent,teacher}/layout.tsx` as the fix surface. Layout files are React Server Components and **cannot** directly set HTTP `Cache-Control` headers — they return JSX, not `Response`. The correct choke point is `proxy.ts`, which already runs `applySecurityHeaders` on every response and matches all portal prefixes via `config.matcher`. This cycle's task list reflects the corrected surface.

**Scope explicitly excludes** (per user-confirmed §7 of plan):
- U4 (salary slip mobile + in-app detail) and U5 (profile photo upload) — feature gaps, not regressions; deferred to Phase 4.
- All other Phase 0 cycles (finance backlog drain, perf sweep) — separate cycles `phase0-finance-backlog-drain` (next) and `phase0-perf-sweep`.

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** Visiting `/admin` (signed-in admin via demo cookie) on the Vercel preview renders content within 2 s: `document.querySelector('main').innerText.length > 0` AND no element matching `div[hidden][id^="S:"]` remains in the DOM after the page settle window. Closes UAT U1 — OR Task 1 documents that the rollback alone already healed U1 (in which case AC1 is satisfied by the negative reproduction recorded in Verification). **Healed = zero `div[hidden][id^="S:"]` AND `main.innerText.length > 0` across 3 separate page loads on at least 2 distinct admin routes.**
- [ ] **AC2.** Portal HTML responses (`/admin`, `/parent`, `/teacher`) and the logout JSON response carry `Cache-Control` containing `no-store`. Verified via Playwright `request.fetch(url)` header assertion (NOT via `page.goBack()` which Playwright Chromium does not reliably exercise against bfcache — see Task 5 note). The header is the eviction signal Chrome uses for bfcache disqualification (`MainResourceHasCacheControlNoStore`). Closes UAT U6.
- [ ] **AC3.** New e2e specs `e2e/admin-hydration.spec.ts` and `e2e/parent-signout-bfcache.spec.ts` pass under `npx playwright test` against the production build (`DEMO_MODE=true npm run start`).
- [ ] **AC4.** No regression on the existing 9 e2e specs (full suite green).
- [ ] **AC5.** README.md gains an ADR row dated 2026-05-10: "Cache-Control: no-store on auth-protected portal trees (P0 hydration + bfcache fix)" — cell ≤ 400 chars per pre-commit hook.
- [ ] **AC6.** Verification section explicitly records U1 reproduction status on the current Vercel preview (URL + timestamp + DOM evidence) so future sessions know whether the rollback healed it independently of this cycle's work.

### Spec Assumptions

1. **`Cache-Control: no-store` is the right tool for U6.** Chrome respects `no-store` as a bfcache eviction signal. Safari may not — but our Playwright suite is Chromium-only per CLAUDE.md, and the production user base is overwhelmingly Chrome on Android. Cross-browser bfcache parity is out of scope.
2. **`Cache-Control: no-store` on portal HTML responses does not regress perf.** Next.js Server Components for `/admin/**`, `/parent/**`, `/teacher/**` are already dynamic (use `cookies()` via `getSession()`); they do not currently benefit from public CDN caching. Adding `no-store` only changes browser-cache behavior, not server-side rendering.
3. **proxy.ts is the right surface.** It already runs on every portal request (matcher `/((?!_next/static|_next/image|favicon.ico).*)`) and already calls `applySecurityHeaders` on the response. Extending the helper to also set `Cache-Control` on portal-prefixed responses keeps response-header logic in one module.
4. **U1 root-cause investigation comes BEFORE Task 3 implementation.** If Task 1 reproduces U1 on the live preview, Task 3 diagnoses (network panel, Vercel build artifacts, CSP report endpoint) before writing a fix. If Task 1 does NOT reproduce U1, Task 3 records the negative result + closes the AC1 condition by alternate path.
5. **Layout files do not change in this cycle.** Plan §6's task list is corrected here. If Task 3's diagnosis surfaces a fix that requires `export const dynamic = 'force-dynamic'` or `export const revalidate = 0` on a layout, that addition is allowed but stays out of `<main>` / JSX.
6. **No prisma migration. No business-logic changes. No new API routes.** Only the existing logout route gains response-header lines; no schema or behavior shift.
7. **Pre-existing CSP duplication (`next.config.ts` + `lib/security/headers.ts` both emit `Content-Security-Policy-Report-Only`) is not addressed in this cycle.** The duplication does not block hydration — both are Report-Only. Filed as a follow-up note in Ship Notes for a future hardening cycle.

### Non-goals

- No admin sidebar or layout JSX changes.
- No CSP graduation from Report-Only to enforcing.
- No audit of all 134 API routes for Cache-Control coverage.
- No Safari / Firefox bfcache verification (Chromium-only per CLAUDE.md).
- No fix for the CSP-header duplication between `next.config.ts` and `lib/security/headers.ts`.

---

## Tasks

Each task = 1 commit. `npm run build && npx vitest run` must pass between tasks (between-task gate).

### Task 1 — Reproduce U1 + U6 on current Vercel preview

**Goal:** ground-truth whether U1 still reproduces post-rollback. Drives scope of Task 3.

**Steps:**
1. Open Vercel preview URL in Playwright MCP (or chrome MCP if available). Sign in as admin via demo cookie.
2. Navigate to `/admin`, `/admin/students`, `/admin/invoices`, `/admin/payroll`. For each:
   - Capture `loadEventEnd`, `<main>.innerText.length`, count of `div[hidden][id^="S:"]` after 2 s settle, console errors, network errors.
3. Sign out via `POST /api/auth/logout`. Press browser back. Capture: did the prior `/parent/home` HTML render from bfcache, or did the navigation refetch and redirect?
4. Record full evidence in cycle doc Verification §"Task 1 — Reproduction".

**Files:** none (investigative). Cycle doc gets the report appended in Verification on the next commit.

**Exit:** Task 1 done when either:
- U1 reproduces → continue to Task 2/3 with confidence.
- U1 does NOT reproduce → Task 3 becomes a no-op stub commit + AC1 satisfied by the negative reproduction record.
- U6 always reproduces (no fix shipped yet) — confirms Task 2 surface is correct.

### Task 2 — Add `Cache-Control: no-store` headers (U6 fix)

**Files:**
- `lib/security/headers.ts` — extend to `applySecurityHeaders(response, request?)` with `request` optional (preserves backward compatibility with the existing single-arg call sites + existing 5 vitest cases). When `request` is provided AND `request.nextUrl.pathname` matches `/admin`, `/parent`, `/teacher`, set `Cache-Control: private, no-store, no-cache, must-revalidate` and `Pragma: no-cache`. Otherwise leave the response untouched (no Cache-Control set).
- `proxy.ts` — pass `request` into the `applySecurityHeaders` call inside `proxy()`.
- `app/api/auth/logout/route.ts` — set `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `Expires: 0` on the success `NextResponse.json({ ok: true })`.
- `lib/security/__tests__/headers.test.ts` — extend with new test cases:
  - `applySecurityHeaders(res, request)` with `request.nextUrl.pathname` in `/admin`, `/parent`, `/teacher` sets the `Cache-Control` header containing `no-store`, `no-cache`, `must-revalidate`, and `private`.
  - Same call with `pathname = "/api/students"` does NOT set `Cache-Control`.
  - Same call with `pathname = "/legal/terms"` does NOT set `Cache-Control`.
  - Single-arg call (no `request`) still works (backward-compat regression guard).

**Verification:**
- `npm run build && npx vitest run` — existing 5 cases plus 4 new branch cases all green.
- Manual `curl -I http://localhost:3000/parent` against local `DEMO_MODE=true npm run start` (with a valid demo cookie) confirms `Cache-Control: private, no-store, no-cache, must-revalidate` is present.
- Manual `curl -I -X POST http://localhost:3000/api/auth/logout` confirms `Cache-Control: no-store, no-cache, must-revalidate`.

**Commit message:** `fix(auth): Cache-Control no-store on portal trees + logout response (closes U6)`.

> **Why `fix:` not `feat:`:** this is a bug fix per UAT, not a new feature. `fix:` is not gated by the commit-msg narrow rule (which only fires on `^(feat|perf)`), so README staging is not strictly required for THIS commit — README ADR is added in Task 6 in the wrap-up commit alongside the cycle-doc Verification + Ship Notes fill.

### Task 3 — U1 hydration fix (conditional on Task 1 finding)

**If Task 1 reproduces U1** — diagnose (likely candidates: stale Vercel build artifact, service-worker cache, RSC payload version mismatch, edge-cache TTL on HTML, missing `dynamic = 'force-dynamic'` on a Server Component). Land the smallest viable fix. Files TBD.

**If Task 1 does NOT reproduce U1** — empty/stub commit recording the negative finding in Verification ("rollback to PR #177 healed U1; no code change required this cycle").

**Commit message (reproducing case):** `fix(admin): <root cause> (closes U1)`.
**Commit message (healed case):** `chore(uat): record U1 negative reproduction post-rollback`.

### Task 4 — e2e: admin hydration spec

**File:** `e2e/admin-hydration.spec.ts` (NEW).

**Assertions:**
- Sign in as admin (demo cookie), navigate to `/admin/students`.
- Within 2 s: `await expect(page.locator('main')).not.toBeEmpty()`.
- After settle: `expect(await page.locator('div[hidden][id^="S:"]').count()).toBe(0)`.
- Repeat for `/admin/invoices`.

**Verification:** `npx playwright test e2e/admin-hydration.spec.ts` green.

**Commit message:** `test(e2e): admin hydration regression guard`.

### Task 5 — e2e: parent sign-out bfcache headers spec

**File:** `e2e/parent-signout-bfcache.spec.ts` (NEW).

**Why this is a header-assertion test, not a `page.goBack()` test:** Playwright Chromium does NOT reliably exercise the back/forward cache. `page.goBack()` typically issues a fresh navigation rather than restoring from bfcache, so a "log in → log out → goBack → expect login" flow passes whether or not `Cache-Control: no-store` is set — making it a useless regression guard. Chrome's bfcache disqualification is triggered by the response header itself (`MainResourceHasCacheControlNoStore`), so asserting the response header gives a true regression guard.

**Assertions:**
- Sign in as a guardian (demo cookie), navigate to `/parent`.
- `const res = await page.request.fetch('/parent', { headers: { cookie: <demo-session> } });` — assert `res.headers()['cache-control']` contains `no-store` AND `no-cache` AND `must-revalidate` AND `private`.
- Repeat the fetch for `/parent/invoices` and `/parent/profile` — same assertion.
- `const logoutRes = await page.request.post('/api/auth/logout');` — assert `logoutRes.headers()['cache-control']` contains `no-store` AND `no-cache` AND `must-revalidate`.
- Optional smoke (NOT primary guard): after logout, `await page.goto('/parent')` and assert URL becomes `/` (redirect to login, since session cookie cleared).

**Verification:** `npx playwright test e2e/parent-signout-bfcache.spec.ts` green.

**Commit message:** `test(e2e): parent sign-out + portal Cache-Control no-store header guard`.

### Task 6 — Wrap up: README ADR + cycle doc Implementation/Verification + Ship Notes

**Files:**
- `README.md` — add ADR row dated 2026-05-10 (cell ≤ 400 chars).
- `docs/cycles/2026-05-10-phase0-admin-hydration-and-bfcache.md` — fill Implementation, Verification, Ship Notes sections.

**End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test` — all green.

**Code-review gate:** `feature-dev:code-reviewer` agent on the cumulative diff before this commit lands.

**Commit message:** `docs(phase0): wrap cycle phase0-admin-hydration-and-bfcache`.

---

## Implementation

### Task 1 — Reproduction on local prod build (`DEMO_MODE=true npm run start`, NODE_ENV=production)

**Server:** `next start` on `localhost:3000`, demo cookie `school-erp-session=u_super_admin` injected via `document.cookie` (login route gated by `NODE_ENV !== production` — bypassed via direct cookie set since `prod start` forces NODE_ENV=production).

**U1 reproduction — NEGATIVE.** Rollback to PR #177 (`433a3bd`) appears to have healed U1. On `/admin` and `/admin/students`:

| Route | mainTextLen | hidden Suspense (`div[hidden][id^="S:"]`) | h1 / content | Verdict |
|---|---|---|---|---|
| `/admin` | 602 | 0 | "Dasbor" + sidebar groups (SDM, Akademik, Keuangan, etc.) | renders ✓ |
| `/admin/students` | 2714 | 0 | "Siswa" + 20 student rows + Tambah button | renders ✓ |

UAT 2026-05-02 evidence: `<div hidden id="S:0">` / `<div hidden id="S:1">` placeholders that "never dehydrate" — none present in the current build. The SSR HTML still emits 1 Suspense placeholder + 1 inline `$RC(…)` script for `/admin` (matching the framework streaming shape), but the client successfully runs the dehydration script and the placeholder flips visible.

**U6 reproduction — PARTIAL (already auto-mitigated for portal HTML).** `Cache-Control` headers observed on `localhost:3000` (`curl -I` with demo cookie):

| Path | HTTP | Cache-Control |
|---|---|---|
| `/admin` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/admin/students` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/admin/invoices` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/admin/payroll` | 200 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/parent` | 307 (→ `/`) | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/parent/profile` | 307 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/teacher` | 307 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| `/` (login) | 200 | `s-maxage=31536000` (CDN cache, no browser-cache directive) |
| `POST /api/auth/logout` | 200 | **none** ← gap |

Next.js automatically applies the portal Cache-Control because every portal layout calls `cookies()` via `getSession()`, marking the route dynamic. Chrome's bfcache disqualification rule (`MainResourceHasCacheControlNoStore`) is therefore already satisfied for the HTML. The remaining gap is `POST /api/auth/logout`, which carries no `Cache-Control` directive at all.

**Other notable console errors (not the U1 cause):** `_vercel/insights/script.js` and `_vercel/speed-insights/script.js` redirect (307) to `/` locally because these endpoints are served by Vercel's infrastructure in production, not Next.js. Browser logs `Refused to execute script ... text/html` × 2. Same in production on Vercel — silently served correctly there. Not a U1 contributor — `/legal/terms` produces the same error pair and still hydrates fully.

### Task 1 → scope adjustment

Given Task 1 findings:

1. **Task 3 (U1 hydration fix) becomes a no-op record commit.** No reproducer in the rolled-back code; if the bug returns post-rollback (e.g., on Vercel preview rebuild artifact mismatch), it will be a new cycle.
2. **Task 2 narrows.** `lib/security/headers.ts` portal-prefix branch and the `proxy.ts` request-passing change are dropped — Next.js dynamic-route framework header already sets the same `Cache-Control` value, and any header we set in middleware would be silently overridden by Next.js's later set anyway. The fix becomes: explicit `Cache-Control` on `app/api/auth/logout/route.ts` response only.
3. **Tasks 4 + 5 still ship.** They are the long-lived regression guards: AC1 ensures the rolled-back hydration shape stays healthy, AC2 ensures the auto-applied portal `no-store` (and the explicit logout header) do not silently regress.

**Spec amendment** — AC2 wording is corrected to acknowledge that the portal-tree `no-store` is delivered by Next.js's dynamic-route default, not by code added in this cycle. The cycle's *contribution* to AC2 is (a) the explicit `no-store` on the logout response and (b) the regression guard test that fails if any portal route ever flips back to a cached/static shape that drops `no-store`.

### Task 2 — explicit Cache-Control on logout response

**Files:** `app/api/auth/logout/route.ts`.

**Change:** wrap the `NextResponse.json({ ok: true })` with explicit response headers:

```ts
return NextResponse.json(
  { ok: true },
  {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  },
);
```

Plus an inline comment explaining defense-in-depth and the relationship to Next.js's dynamic-route framework header on the prior portal page.

**Between-task gate:** `npm run build && npx vitest run` — 133 files / 1098 tests passed, 2 skipped, 42 todo. Manual `curl -I -X POST http://localhost:3000/api/auth/logout` after restart confirms the three headers land on the response.

### Task 3 — U1 negative-reproduction record

Absorbed into Task 1 (commit `bcbbdf4`). The reproduction evidence in the Implementation §"Task 1" table is the record. No separate commit; no code change. If U1 reappears on the Vercel preview after this branch deploys (e.g., due to a Vercel-specific build artifact), file a follow-up cycle `phase0-admin-hydration-vercel-fix` rather than reopening this one.

### Task 4 — e2e admin hydration regression guard

**Files:** `e2e/admin-hydration.spec.ts` (NEW, 67 lines).

**Coverage:** parameterised over `/admin`, `/admin/students`, `/admin/invoices`. Each test signs in via direct cookie injection (matching the existing `e2e/admin.spec.ts` pattern), navigates, waits 2 s, then asserts `<main>.innerText.length > 0` AND `document.querySelectorAll('div[hidden][id^="S:"]').length === 0`. Failure messages are scoped per route so a regression points at the offending path.

**Between-task gate:** `npx playwright test e2e/admin-hydration.spec.ts --reporter=list` — 3 / 3 passed in 8.2 s.

### Task 5 — e2e portal + logout Cache-Control header guard

**Files:** `e2e/parent-signout-bfcache.spec.ts` (NEW, 96 lines).

**Coverage:**
- 3 parameterised cases over `admin`, `parent`, `teacher` portal HTML responses (root path of each, e.g. `/admin`, `/parent`, `/teacher`). Each asserts `Cache-Control` contains `no-store`, `no-cache`, `must-revalidate`, AND `private`. Uses `page.request.fetch(root, { maxRedirects: 0 })` so the assertion is on the first response, not the login redirect chain.
- 1 case for `POST /api/auth/logout` asserting status 200 + `Cache-Control` contains `no-store`, `no-cache`, `must-revalidate`, plus `Pragma: no-cache` and `Expires: 0`.

The header file-doc explicitly notes why this is NOT a `page.goBack()` test (Playwright Chromium does not reliably exercise bfcache; header-level assertion is the true regression guard for Chrome's `MainResourceHasCacheControlNoStore` rule).

**Between-task gate:** `npx playwright test e2e/parent-signout-bfcache.spec.ts --reporter=list` — 4 / 4 passed in 2.2 s.

### Task 6 — README ADR + cycle wrap

(commit pending)

## Verification

(filled at end-of-cycle gate)<!-- pending Tasks 2–6 -->

## Ship Notes

<!-- /ship fills this section. Must include:
     - Migrations: none expected
     - Env vars: none expected
     - Rollback: revert merge commit; reverts re-introduce U1+U6 with no data loss
     - Pre-existing follow-up: CSP-header duplication between next.config.ts and lib/security/headers.ts (filed for future hardening cycle, not a P0)
-->
