# Runbook: Teacher Assessments RSC Prefetch 503s

**Created:** 2026-05-03  
**Cycle:** `docs/cycles/2026-05-03-teacher-uat-fixes.md` (Task E1)  
**Status:** Inconclusive — root cause not definitively identified; log window expired before triage could be completed.

---

## Symptom

During the 2026-05-03 synthetic UAT run (Bu Sari persona, KB-Aster class, ~25 min session on `annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`), the browser network log captured:

- 8 requests matching the `assessment`-pattern prefix (`/teacher/assessments` and `/teacher/assessments/[classSectionId]/[templateId]/[period]`)
- **4 returned HTTP 503**, 4 returned HTTP 200
- The 503s were all on the **prefetch path** (RSC payload GETs issued by Next.js `<Link>` components before user navigation)
- **First-class navigation requests (direct URL load) succeeded** — the assessment pages themselves rendered correctly for Bu Sari once navigated to
- Autosave ("✓ Tersimpan") confirmed working: POST `/api/student-assessment/scores` returned 200 during active use

The 503 pattern is intermittent and tied to the prefetch path — not to full page loads.

---

## Investigation Performed

### 1. Vercel MCP runtime log pull

Queried `mcp__2037f9b7-455d-46a1-965a-fe464b218823__get_runtime_logs` against project `prj_vNPPadWunlIuqwurTXLx0g7e4Ijp` (team `team_bMVaH5i7Jp9rlft5uexqRNun`) with:
- `statusCode: "503"`, time range `2026-05-03T00:00:00Z → 2026-05-04T00:00:00Z`, environment `preview`
- Same query with `level: ["error", "fatal"]`
- Same query scoped to deployment `dpl_EirHdKV5EDNs3kSZTpe6Jih628S4` (the staging build active at ~07:00 UTC on 2026-05-03, which was the `fix(assessments): persist autosave` merge — the build Bu Sari was using)
- Broad unfiltered query (no status/level filter)

**All queries returned zero logs.** The current unfiltered preview query returns only UptimeRobot `HEAD /` heartbeats from today's date. Vercel retains runtime logs for ~24 hours on standard plans for preview deployments. The UAT run was on 2026-05-03 and the log window has since closed. The 503s were not captured.

### 2. Deployment identification

The staging deployment active during the UAT was `dpl_EirHdKV5EDNs3kSZTpe6Jih628S4` (committed 2026-05-03 07:00 UTC, `fix(assessments): persist autosave + audit teacher/parent/admin write paths` — PR #170). There were no deployments between the UAT run and the log pull that could have replaced logs; the gap is purely retention.

### 3. Route handler code review

Read `app/teacher/assessments/page.tsx` (the list landing) and `app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx` (the detail). Both are server components. Key observations:

**`page.tsx` (list):**
- Calls `getSession()` on every render — calls `supabase.auth.getUser()` in production Supabase mode; reads a `school-erp-session` cookie in demo mode.
- On `getSession()` success, fires 3–4 sequential Prisma queries (`teachingAssignment.findMany` → `assessmentTemplate.findMany` → `studentEnrollment.findMany` → `studentAssessment.findMany` if studentIds/templateIds are non-empty).
- No `export const maxDuration` override — inherits Next.js default (10 s on Hobby tier, 60 s on Pro).
- No `export const dynamic` / `export const runtime` — standard Node.js serverless function.
- No explicit `throw` or error boundary — errors surface as unhandled promise rejections which Vercel translates to 500, not 503.

**`[...]/page.tsx` (detail):**
- Same session pattern. Fires 4–5 queries including `assessmentTemplate.findFirst` with a deeply nested `include` (`categories` → `indicators`). The template query is the heaviest: it loads the full rubric structure and all indicators for the student-accordion page.
- Also no `maxDuration` or `runtime` override.

**Neither route throws `503` in code.** All error branches return `redirect()`, `notFound()`, or an `<EmptyState>` JSX render — never an explicit 503 response. A 503 from these routes must come from the platform, not application logic.

### 4. Middleware (proxy.ts) review

Read `proxy.ts` (Next.js 16 middleware entry). The middleware does not return 503 on any path. For `/teacher/**` page routes:
- In demo mode: checks for `school-erp-session` cookie; if present, calls `enforceIdleTimeout(request, NextResponse.next())`. If cookie is absent, falls through to `NextResponse.redirect("/")`.
- In production Supabase mode: calls `updateSession(request)` then `enforceIdleTimeout`.
- No rate limiting applied to non-`/api/auth/*` paths.
- **RSC prefetch requests sent by Next.js `<Link>` include the `RSC: 1` header but NOT the session cookie** in some Next.js prefetch configurations (Next.js prefetch is cookieless for unauthenticated prefetch of non-dynamic routes). However: this middleware does NOT return 503 for cookieless requests — it returns a `302/307` redirect to `/`. A redirect would show as a 302 in the network log, not a 503.

### 5. next.config.ts review

No `maxDuration`, `memory`, or function size overrides. No `serverExternalPackages` that could cause cold-start module-init failures. Turbopack bundler in use (confirmed in deployment metadata `"bundler": "turbopack"`).

### 6. Recent git history on assessments route

The assessment route was heavily modified in the days before the UAT:
- `fix(assessments): persist autosave + audit teacher/parent/admin write paths` — PR #170, merged 2026-05-03 07:00 UTC. This was the build active during UAT.
- `perf: Phase 6 query optimization` — earlier; eliminated N+1 but is now the baseline.

No recent changes to the server component page files themselves that would introduce a new throw or uncaught exception.

---

## Hypotheses (ranked most-likely → least-likely)

### H1 — Vercel cold-start + Supabase/Prisma connection timeout during concurrent prefetch (HIGH confidence)

**Rationale:** The detail page (`[classSectionId]/[templateId]/[period]/page.tsx`) fires a heavy DB query (`assessmentTemplate.findFirst` with full rubric `include`) plus `getSession()` → `supabase.auth.getUser()` on every render. When Next.js `<Link>` components fire multiple prefetch GETs concurrently (the list page contains links for each class × template combination — could be 2–6 parallel prefetch RPCs for KB-Aster), each prefetch lands on a separate serverless function invocation. If the function was cold at that moment (fresh deploy at 07:00 UTC, UAT started ~morning), concurrent cold-starts can exhaust the Supabase connection pool or saturate a pool slot, causing one or more requests to time out at the DB layer. Vercel wraps a function execution timeout in a 503, not a 504.

**Supporting evidence:** The 4-of-8 split (exactly half the prefetches failed) is consistent with a connection pool half-saturation: some concurrent invocations get a pool slot immediately, others wait and then time out. First-class navigation succeeding immediately after suggests the pool had recovered by then.

**What would confirm:** Vercel runtime logs showing function timeout (`FUNCTION_INVOCATION_TIMEOUT`) or Prisma `Can't reach database server` / Supabase `connection pool exhausted` error in the log body.

### H2 — Vercel Hobby-tier function concurrency limit (MEDIUM confidence)

**Rationale:** Hobby plan limits concurrent function executions. Multiple simultaneous prefetch requests (6 Link elements on the page = potentially 6 concurrent GETs) could hit the concurrency ceiling, causing Vercel to queue and then timeout excess requests, emitting 503.

**Supporting evidence:** The `annisaa-erp-v3` project is on a team account (`ismails-projects-196d40d3`), which may be Hobby or Pro. Plan tier was not determinable via the MCP — `get_project` returns no billing tier. The `lambdaRuntimeStats: {"nodejs":4}` in deployment metadata shows only 4 Node.js invocations per deployment, suggesting low cold-start throughput.

**What would confirm:** Vercel logs showing `FUNCTION_INVOCATION_TIMEOUT` or HTTP log status 503 on concurrent prefetch timing — or plan dashboard showing Hobby tier concurrency limit of 1 concurrent invocation per function per IP.

### H3 — Next.js RSC prefetch sends cookieless request; middleware redirect race producing 503 (LOW confidence)

**Rationale:** Next.js sometimes sends prefetch requests without cookies. The middleware for a non-authenticated prefetch would redirect to `/`. However, middleware returns 302, not 503. The only way to get a 503 from this path is if Vercel itself wraps an execution that timed out waiting for the middleware to respond — unlikely since middleware is edge-function, not serverless.

**What would confirm:** Network log headers showing `RSC: 1` + no `Cookie` header on the 503 requests, combined with middleware edge-function logs showing timeout.

### H4 — Turbopack-specific RSC serialization bug at first prefetch (LOW confidence)

**Rationale:** The deployment uses Turbopack (`"bundler": "turbopack"`). Turbopack's RSC prefetch serialization is less battle-tested than webpack. A serialization error in the RSC payload for a complex nested type (e.g., the large `categories → indicators` tree) could cause the function to throw an unhandled error, which Vercel wraps as 503 on some error types.

**What would confirm:** Application error log showing a serialization exception (`TypeError: Cannot serialize`, `Error: Expected...`) originating from the RSC render path.

---

## Reproduction Notes

To attempt to reproduce this specific issue:

1. **Environment:** Use staging URL `annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`. Do NOT reproduce locally — the 503s are platform-specific (cold-start + connection pool dynamics do not replicate in local `npm run dev` or `npm run start`).
2. **Auth:** Sign in as `ismail10rabbanii@gmail.com` (Bu Sari persona) via Google SSO.
3. **Warm vs. cold:** Immediately after a fresh deploy (within 5 min), navigate to `/teacher` and hover over the "Penilaian" nav link to trigger prefetch. Then monitor the Network tab for `/teacher/assessments*` requests. Repeat 3–5 times to capture the intermittent window.
4. **Capture:** Enable "Preserve log" in Chrome DevTools Network tab before navigating. Look for status 503 on requests with header `RSC: 1`. Note the request timestamp and the response body (may include a Vercel error envelope with `FUNCTION_INVOCATION_TIMEOUT` or `EDGE_FUNCTION_ERROR`).
5. **Supabase pool:** If H1 is the suspect, also open Supabase Studio → Logs → API logs and filter by timestamp window. Look for `connection pool exhausted` or `remaining connection slots are reserved` errors.

---

## Monitoring Suggestions

1. **Vercel Log Drains:** Configure a log drain (`vercel log-drains add` or via dashboard) to forward runtime logs to an external service (Datadog, Better Stack, or even a simple webhook). Log retention on Vercel preview is 24 h — a drain ensures logs survive beyond that window. This is the single highest-value action to unblock root-cause identification.
2. **UptimeRobot escalation:** The project already has an UptimeRobot monitor on `/` (evidenced by the `HEAD /` heartbeats in current logs). Add a second monitor on `/api/health` with a 60-second check interval. A 503 on the health endpoint would surface platform-level issues.
3. **Vercel Function Metrics:** In the Vercel dashboard → `annisaa-erp-v3` → Analytics → Functions, filter on path `/teacher/assessments*` and look at p95/p99 duration and error rate. A spike in error rate correlated with function duration > 8 s would confirm H1/H2.
4. **Supabase Connection Pool Advisor:** Supabase dashboard → Advisors → Performance → "Connection pool" advisor will flag if the pool is regularly saturated. The `annisaa-erp-v3` pages fire up to 4 Prisma queries per RSC render; concurrent prefetches multiply this.
5. **Next.js prefetch budget:** Consider adding `prefetch={false}` to `<Link>` elements on the assessments list page that point to heavy detail routes. This trades prefetch latency improvement for reduced concurrent function pressure. Implement only if logs confirm H1/H2.

---

## Open Questions

1. **What Vercel plan is `ismails-projects-196d40d3` on?** Hobby vs. Pro determines the serverless function timeout (10 s vs. 60 s), memory limit, and concurrent execution ceiling. The MCP `get_project` response does not expose billing tier.
2. **What was the exact prefetch count?** How many `<Link>` elements pointing to `/teacher/assessments/*` existed on the page that Bu Sari was on when the 503s fired? The list page renders one link per `(classSection × template)` pair — for KB-Aster with 2 assessment templates, that is 2 detail-route links + the list link = 3 prefetch candidates, not 8. The UAT reports 8 `assessment`-pattern requests, which suggests the assessment list page itself was also prefetched (from `/teacher` nav), plus multiple detail prefetches from the list page.
3. **Was the session cookie included in the prefetch requests?** If Next.js sent the prefetch without the `Cookie` header, the middleware would redirect (302), not 503. Were the 4 failing requests a redirect race, and the browser's network log logged them as 503? This requires inspecting the raw prefetch response headers.
4. **Does the issue reproduce consistently after a fresh cold deploy?** Intermittent 4/8 suggests either timing-dependent cold start or non-deterministic connection pool behavior. A structured cold-start reproduction attempt (as described in Reproduction Notes) would answer this.
5. **Is the `dpl_EirHdKV5EDNs3kSZTpe6Jih628S4` deployment still accessible on Vercel?** Preview deployments are retained for longer than their logs. Replaying the UAT against the exact same build hash would rule out code changes introduced by later commits (C5 lazy-mount was not yet in `dpl_EirHd`).

---

## Next Steps to Unblock Root Cause

1. **Set up a Vercel log drain** before the next UAT run. Any service that accepts webhooks (even a free Better Stack or Logtail account) will do. This alone would have answered the question definitively.
2. **Run structured cold-start reproduction** (see Reproduction Notes) and capture the raw 503 response body — it will contain either a Vercel error code (`FUNCTION_INVOCATION_TIMEOUT`) or an application stack trace.
3. **If H1 confirmed (connection pool):** Add `export const maxDuration = 30` to both assessment page files and consider adding Prisma connection pooling via PgBouncer (Supabase provides this on the `6543` port). Also add `prefetch={false}` to detail-route Links on the list page.
4. **If H2 confirmed (concurrency limit):** Upgrade to Vercel Pro, or add `prefetch={false}` to reduce concurrent invocations per page-hover.
5. **If H3 confirmed (cookieless prefetch redirect):** Add a `next.config.ts` `experimental.prefetchCacheTime: 0` or use `<Link prefetch={false}>` for auth-required routes — cookieless prefetch of auth-gated RSC routes is inherently noisy.
