# Finance Bulk Throttle — Sandbox Rate-Limit Hardening + Staging Drain

## Context

Staging admin/invoices currently shows **3647 total tagihan, 1341 stuck in `PENDING_PAYMENT_LINK`** with the breakdown popover surfacing 875 × 401, 305 × 429, 159 unknown, 2 network. Investigation (2026-04-28):

**Sandbox quota too tight for current burst pattern.** The bulk-generate endpoint runs `limit(5)` Xendit fan-out × 25-invoice chunks with no inter-chunk pacing. Worst-case sustained throughput ≈ 200 req/min, well above sandbox quota (~30-60 req/min) → 305 × 429. The Vercel runtime log line `[XENDIT ERROR] Create sessi... 429: You have exceeded your rate limit quota as too many incoming requests within the current time window. Retry gracefully with exponential backoff schedule to reduce request volume.` confirms the pattern. The 875 × 401 + 159 unknown are legacy noise on rows from earlier deploys before PR #151 shipped the proper classifier; they will drain on the next backfill run with the current sandbox key.

PR #151 (`docs/cycles/2026-04-27-invoice-create-auto-retry.md`, merged Apr 27) shipped the typed `XenditApiError` classifier, `withXenditRetry` (3 attempts, 250+1000ms backoff, honors `Retry-After` cap 3s), prefix-tagged `paymentLinkError`, breakdown popover, and one-shot `scripts/backfill-pending-payment-links.ts`. The classifier and per-call retry are correct; the gap is the **call-rate envelope**: 5 concurrent × no inter-chunk pause overwhelms sandbox quota faster than per-call retries can absorb. The fix is throttle, not more retries.

CTO decided (2026-04-28) to use **a single concurrency cap of 2** for the bulk fan-out, sized for sandbox quota. Production tier setup is **out of scope this cycle** — when prod is configured later, the cap stays at 2 (or a follow-up cycle revisits if the live merchant quota warrants raising it). Target: sustain ≤ 60 req/min from a single bulk run on staging, drain the existing 1341 stuck rows on staging via the existing backfill script, and surface a deploy-time health probe so a missing/wrong sandbox key fails loud instead of silently accumulating `PENDING_PAYMENT_LINK` rows.

Out-of-scope: cron-based server-side retry (over-engineered at current scale), webhook hardening (already shipped in 2026-04-26 §C), production-tier env config / live-key setup (separate operational cycle later), splitting sandbox vs live concurrency (current decision: same cap; revisit when prod tier exists), `xenditSessionId` lost-response idempotency (real but rare TOCTOU window, separate cycle), auto-promote `SENT → OVERDUE` cron handler (registered in `vercel.json` but missing — separate cycle).

## Spec

### Acceptance criteria

- [ ] **Concurrency lowered 5 → 2** at both Xendit fan-out sites:
  - `app/api/invoices/generate/batch/route.ts:217` — `const runLimit = limit(2);`
  - `lib/finance/xendit-retry.ts:79` — `const runLimit = limit(2);`
  - Both call sites carry an updated comment referencing this cycle (sandbox-quota rationale + per-cycle-doc reference) so future readers know the cap is intentional, not legacy.
- [ ] **Inter-chunk pacing** in `lib/finance/run-bulk-generate.ts`:
  - After every chunk (success OR failure) and before the next chunk dispatches, sleep `INTER_CHUNK_DELAY_MS = 1000`. **Pacing applies to both paths.** Reviewer flagged the original "skip on failure" design as leaky — chunk failures (notably 5xx + 429-driven Vercel timeouts) are exactly when the next chunk is most likely to hit the same quota wall, so the pause must fire there too. The existing `RETRY_BACKOFFS_MS` handles intra-chunk retry but does not cover the cross-chunk gap.
  - Skip the sleep only when (a) it's the last chunk in the loop, OR (b) the orchestrator's `signal.aborted`. No skip on failure.
  - Constant exported alongside `BATCH_SIZE` / `RETRY_BACKOFFS_MS` so tests can assert on it.
  - Wired through the existing `sleepImpl` test seam — no new injection point.
- [ ] **429-specific retry budget** in `lib/xendit/with-retry.ts`:
  - 429 path uses **2 attempts total (1 initial + 1 retry)**, not the existing 3 attempts. Other codes (`5xx`, `408`, `network`) keep the existing 3-attempt budget.
  - When the 429 retry fires, backoff = `err.retryAfterMs` if present (already capped 3s in PR #151 Task 1), otherwise fall back to a single constant `BACKOFF_429_MS = 1500`.
  - Rationale: 429 is the dominant retriable failure (305 of 1341 stuck rows). A single retry inside the per-call budget keeps the worst-case per-invoice wall-clock at ~4.5s (vs ~8.5s if we kept 3 attempts with [1000, 3000] schedule), which lets us stay under the 60s function ceiling without dropping chunk size. Residual 429s after the single retry persist `PENDING_PAYMENT_LINK` and get drained by the orchestrator's auto-sweep + the manual button — same fallback chain as today.
  - Implementation note: extend `withXenditRetry` to accept (or read internally) a per-code attempt cap. The simplest implementation is an early-throw branch: `if (err.code === "429" && attempt >= 2) throw err;`. No new schedule array needed → eliminates the off-by-one risk on a 3rd attempt index.
- [ ] **Deploy-time Xendit health probe** at `GET /api/health/xendit`:
  - New route handler at `app/api/health/xendit/route.ts`. Calls Xendit `GET /balance` (the canonical "is the key valid" endpoint per Xendit docs) with a 5-second `AbortController` timeout.
  - Response shape: `{ ok: true, source: "xendit", tier: "live"|"sandbox"|"unknown", checkedAt: <iso> }` on 200; `{ ok: false, source: "xendit", error: <message>, code: <prefix>, tier: ..., checkedAt: <iso> }` on failure (HTTP 503).
  - Error path uses the existing `prefixForError` from `lib/xendit/error-prefix.ts` so the error code matches the breakdown taxonomy (`401`, `network`, `5xx`, etc.).
  - **`tier` detection (corrected)**: Xendit serves both sandbox and live from the **same host** `https://api.xendit.co` (`lib/xendit/client.ts:7` confirms hardcoded URL). Tier is determined by **the secret-key prefix only**: `process.env.XENDIT_SECRET_KEY?.startsWith("xnd_production_")` → `"live"`; `…?.startsWith("xnd_development_")` → `"sandbox"`; anything else (including missing/empty) → `"unknown"`. The route MUST NOT echo the key, the prefix, or any character of the key in the response — only the derived `"live"|"sandbox"|"unknown"` label.
  - **Mandatory rate limit + result cache** (no "if present" branch): wrap the route with the existing `lib/rate-limit.ts` helper at **30 req/min per IP**. Additionally, add a 30-second in-memory **single-slot** result cache (`globalThis.__xenditHealthCache = { result, expiresAt }`) so consecutive hits within 30s return the last result without re-pinging Xendit. Ordering: rate-limit FIRST, then cache check, then cache-miss path pings Xendit. Cached responses still count against the per-IP cap. Both are required — IP rate-limit alone is cheap to rotate; the cache caps total Xendit traffic regardless of caller.
  - **Security checklist (`.claude/standards/security.md`)** — every new public API route in this codebase must pass the route checklist. T4 acceptance includes: (1) auth posture documented (this route is intentionally public — justified for deploy probes/monitors), (2) input validation (no inputs — `GET` with no params), (3) rate-limit applied (above), (4) no secret echo (asserted in tests), (5) error responses don't leak stack traces or env values, (6) entry added to the route inventory if one exists.
  - Route is **public** (no auth) — pingable from Vercel deployment-protection bypass + uptime monitors. Does NOT echo any portion of the secret.
- [ ] **Backfill drain documented in Ship Notes** with the exact one-shot command and pre-flight checks. Operator action, not code.
- [ ] **Vitest coverage:**
  - `run-bulk-generate.test.ts` — assert `INTER_CHUNK_DELAY_MS` sleep fires N-1 times for N chunks (success path), sleep also fires on chunk failure (M2 fix), sleep skipped on abort, sleep skipped after the final chunk. Use the existing `sleepImpl` mock.
  - `xendit-retry.test.ts` (existing file) — no new behavior assertions needed; concurrency-cap is internal. Existing tests stay green.
  - `with-retry.test.ts` (existing file) — covered in T3 acceptance: 4 new cases (429 no-`Retry-After` → 1500ms then re-throw on attempt 2; 429 with `Retry-After: 2`; 429 then 200 success on retry; 5xx storm regression guard at 3 attempts). Existing 9 cases stay green.
  - `app/api/health/xendit/__tests__/route.test.ts` — covered in T4 acceptance: success-live, success-sandbox, 401, network-throw, abort-timeout, tier-unknown, secret-not-echoed assertion, rate-limit hit, cache hit. Mocks `lib/xendit/client.ts` directly + sets `process.env.XENDIT_SECRET_KEY` per test (cleanup in `afterEach`).
  - `lib/finance/__tests__/run-bulk-generate.timing.test.ts` (T5) — synthetic chunk-budget timing test asserting <55s simulated wall-clock for the realistic worst-case mix.
- [ ] **Playwright `e2e/admin.spec.ts`** — bulk-create flow still passes 21/21. Add no new e2e test (the new health route has no UI surface; covered by unit).
- [ ] **No regression** in `lib/finance/__tests__/run-bulk-generate.test.ts` existing snapshots. Build clean. Full vitest green. RLS + API-auth coverage guards stay green.

### Non-goals

- **Server-side cron retry** for residual `PENDING_PAYMENT_LINK` rows — manual button + auto-sweep is sufficient at current scale (rejected in 2026-04-25 cycle §6-9).
- **Production-tier setup** — adding live `XENDIT_SECRET_KEY` / `XENDIT_WEBHOOK_TOKEN` to Vercel Production scope, env-aware concurrency, prod backfill, prod probe checks. **All deferred to a separate operational cycle when production launch is being planned.** This cycle is staging-only.
- **Any seeding / reseeding / data-generation work — HARD INVARIANT.** This PR MUST NOT modify any of: `prisma/seed.ts`, `scripts/reseed/`, `scripts/reseed-staging.ts`, `scripts/seed-demo-users.ts`, `app/api/admin/seed/route.ts`. Tagihan row count on staging at the moment of merge MUST equal the tagihan row count immediately after merge — no new bulk tagihan should appear because of this PR landing. The drain procedure (Ship Notes) only flips status `PENDING_PAYMENT_LINK → SENT` on existing rows; it never inserts. /build verifies this in T6 by `git diff --name-only origin/staging...HEAD` and asserting zero overlap with the seed-path glob; the assertion appears in the cycle doc's Verification section before the PR opens.
- **Webhook hardening** — already shipped 2026-04-26 §C.
- **Adding new rate-limit primitive** for the health endpoint — reuse `lib/rate-limit.ts`.
- **UI surface for the health probe** — backend-only this cycle.
- **Lost-response `xenditSessionId` TOCTOU idempotency** — real but rare; separate cycle.
- **Auto-promote `SENT → OVERDUE` cron handler** — missing despite `vercel.json` registration; separate cycle.

### Assumptions

1. **Sandbox quota envelope ≈ 30-60 req/min** based on observed 305 × 429 pattern on the staging URL. Concurrency=2 + 1s inter-chunk + per-call ~1.5s = sustained ≈ 24 req/min worst case during a chunk, drops to ~0 during the inter-chunk sleep → **average ≈ 12-20 req/min**. Well under any reasonable sandbox cap.
2. **Production tier setup is a separate later cycle.** This cycle ships throttle + probe sized for sandbox/staging only. When prod is configured later, the same cap=2 carries over by default; raising it requires a follow-up cycle with live-quota measurement.
3. **Xendit `GET /balance` is the canonical key-validity probe** and returns 401 on bad credentials, 200 on good. Verified during /build by sanity-pinging the endpoint with the staging key.
4. **Xendit serves both tiers from the same host** `https://api.xendit.co` (`lib/xendit/client.ts:7` confirmed). Tier is determined exclusively by the secret-key prefix (`xnd_production_` vs `xnd_development_`). No URL-based detection is possible; no env var for base URL is needed.
5. **`lib/rate-limit.ts` is confirmed present** in the codebase (verified during reviewer pass). T4 uses it as a hard requirement, not a conditional. If the API surface differs from what T4 expects, /build adapts to the existing helper signature — does NOT add a new primitive.
6. **`scripts/backfill-pending-payment-links.ts` (shipped in #151) still works** without modification against the new concurrency=2 retry orchestrator — it imports `retryPaymentLinks` directly, which now uses the lower cap. /build smoke-runs `--dry-run` to confirm before /ship.
7. **No DB migration needed.** All changes are runtime constants + new route.

### Per-request budget math (post-throttle, recomputed after reviewer feedback)

Bulk batch endpoint, 25 invoices, fan-out concurrency = **2** (was 5) → 13 sequential waves (was 5).

**Per-invoice worst case, by error code:**

| Code | Attempts | Backoff schedule | Total Xendit time | Per-invoice worst |
|---|---|---|---|---|
| Happy path (200) | 1 | — | ~1.5s | ~1.5s |
| `5xx` / `408` / `network` | 3 | [250, 1000] | 3 × 1.5 = 4.5s + 1.25s backoff | **~5.75s** |
| `429` (this cycle) | **2** | [1500] (or `Retry-After` ≤3s) | 2 × 1.5 = 3.0s + 1.5s backoff | **~4.5s** |
| Hard fail (`401`, `422`, etc.) | 1 (no retry) | — | ~1.5s | ~1.5s |

Worst-case wave (2 invoices, longest = 5.75s for a 5xx-storming wave; the 429 case is bounded at 4.5s after the T3 trim): **5.75s per wave**.

Total worst case for 13 waves where every single invoice hits the 5xx/network 3-attempt path: **13 × 5.75s ≈ 75s**.

Total worst case for 13 waves where every single invoice hits the 429 path (this cycle's primary target — currently 305 of 1341 stuck rows): **13 × 4.5s ≈ 58.5s**.

**Decision:**
- The 429-storm worst case (~58.5s) fits inside the 60s Hobby ceiling with 1.5s margin. This is the realistic worst case post-cycle since 429 is the dominant retriable failure on the affected env (sandbox).
- The 5xx-storm worst case (~75s) exceeds the ceiling but is implausible — observed 5xx is 0 in the breakdown popover (159 unknown, but those are hard-fail per the classifier, not retriable). Vercel-side timeouts on the upstream fetch would surface as `network` (also 3-attempt budget) but we've seen 2 in 1341 = 0.15% rate.
- /build adds `export const maxDuration = 60` to `app/api/invoices/generate/batch/route.ts` as a defensive ceiling. If a chunk does hit 60s, the function aborts mid-fan-out, the orchestrator catches the resulting 504/network at the chunk level, the existing 3-strike chunk retry kicks in (with the new 1s inter-chunk pause), and the residual lands in the auto-sweep / manual button path.
- **Vercel plan must be confirmed in /build Task 1** before committing — if the project is on Pro (`maxDuration: 300` available), the 75s 5xx-storm theoretical case is moot and we can also raise the ceiling defensively. If Hobby, the 60s cap above stands.
- Chunk size 25 stays. Retry budget changes are encapsulated in T3 (429 trimmed to 2 attempts; everything else unchanged).
- Mitigation kept in reserve (NOT in scope this cycle): if post-merge data shows chunk timeouts > 1% rate, a follow-up cycle drops chunk size 25 → 15.

Realistic-mix math (≤5% transient errors): 13 waves × 1.6s avg ≈ **~21s/chunk** — well inside any plan.

Wall-clock for 500 invoices (sequential client orchestrator, 20 chunks):
- Best case (no retries): ~21s/chunk × 20 + 19 × 1s pacing = **~440s (~7.3 min)**.
- Realistic mix: **~7-9 min**.
- Pathological 429 storm: 20 × 58.5s + 19s pacing = **~1190s (~20 min)** — would only occur if sandbox is fully saturated; the orchestrator's chunk-level abort + manual retry surface caps user pain.

CTO accepts the wall-clock regression (7-9min vs prior 3-5min) as the price of staying inside sandbox quota. The alternative — auth-fail spam and retry-button-hammering — is worse UX than waiting an extra 4 minutes for a once-a-month payroll cycle.

## Tasks

> Each task is committable on its own. Between-task gate: `npm run build && npx vitest run`. Reviewer agent on each commit's diff. Order is dependency-driven; do not reorder.

### T1 — Lower batch + retry concurrency 5 → 2 ✓

**Files:** `app/api/invoices/generate/batch/route.ts:217`, `lib/finance/xendit-retry.ts:79`.
**Acceptance:** Both `limit(5)` call sites become `limit(2)` with an updated comment block citing this cycle doc and the sandbox-quota rationale. No behavior change in tests (concurrency cap is internal). Build clean. Vitest green.

### T2 — Add `INTER_CHUNK_DELAY_MS` orchestrator pacing ✓

**Files:** `lib/finance/run-bulk-generate.ts`, `lib/finance/__tests__/run-bulk-generate.test.ts`.
**Acceptance:** New exported constant `export const INTER_CHUNK_DELAY_MS = 1000`. After every chunk (success OR three-strike failure that does NOT abort the loop) and before the next chunk dispatches, `await input.sleep(INTER_CHUNK_DELAY_MS)`. Skip the sleep ONLY when (a) it is the last chunk in the loop, OR (b) `signal.aborted` is true at the gate check. Note that today a three-strike chunk failure terminates the loop (`phase: "aborted"`) so in practice the failure-path sleep only fires if a future change keeps the loop running past a chunk failure — implement the call site to fire on both paths regardless, so the spec contract holds even if the loop semantics evolve. Three new test cases: (a) sleep fires N-1 times for N chunks happy-path, (b) sleep skipped after the final chunk, (c) **sleep fires after a chunk-failure path before the loop terminates** (regression guard for the M2 leak). Existing test snapshots untouched. Build clean. Vitest green.

### T3 — 429 retry budget trimmed to 2 attempts (1 retry)

**Files:** `lib/xendit/with-retry.ts`, `lib/xendit/__tests__/with-retry.test.ts`.
**Acceptance:** Add `BACKOFF_429_MS = 1500` constant. `withXenditRetry` adds an early-throw branch: when `err.code === "429"` AND `attempt >= 2`, re-throw immediately without scheduling a third attempt. The first retry (attempt=2) still fires; backoff is `err.retryAfterMs` if present (≤3s cap from PR #151), otherwise `BACKOFF_429_MS = 1500`. All other retriable codes (`5xx`, `408`, `network`) keep the existing 3-attempt budget with `BACKOFFS_MS = [250, 1000]`. New tests: (a) 429-no-`Retry-After` waits 1500ms once then re-throws on 2nd failure, (b) 429-with-`Retry-After: 2` honors header, (c) 429 then 200 → success on 2nd attempt, (d) 5xx storm still uses 3 attempts (regression guard). Existing 9 cases stay green. Build clean. Vitest green.

### T4 — `GET /api/health/xendit` deploy-time probe

**Files:** new `app/api/health/xendit/route.ts`, new `app/api/health/xendit/__tests__/route.test.ts`.
**Acceptance:**
- Public GET endpoint pings Xendit `GET /balance` with a 5-second `AbortController` timeout.
- Returns 200 on success with `{ ok: true, source: "xendit", tier: "live"|"sandbox"|"unknown", checkedAt }`; returns 503 on failure with `{ ok: false, source: "xendit", error, code, tier, checkedAt }`. `code` derives from `prefixForError`.
- `tier` derives from `process.env.XENDIT_SECRET_KEY` prefix (`xnd_production_` → `"live"`; `xnd_development_` → `"sandbox"`; missing/other → `"unknown"`). Same Xendit host for both tiers — no URL-based detection. **Response MUST NOT echo any character of the secret** — only the derived label.
- **Mandatory** `lib/rate-limit.ts` integration — 30 req/min per IP. Hard requirement, no "if present" branch.
- **Mandatory** in-memory result cache — 30s TTL, **single-slot singleton** (`globalThis.__xenditHealthCache = { result, expiresAt }`). NOT a `Map<tier, ...>` — `tier` is constant within a function instance, and a tier-keyed Map invites cache-poisoning if a future change lets `tier` come from a header or query param. Single-slot is the deliberately narrow surface.
- **Ordering pin (not negotiable):** request enters → (1) rate-limit check via `lib/rate-limit.ts`; over budget → return 429 immediately. (2) cache check; if `expiresAt > now`, return cached result. (3) cache miss → ping Xendit `GET /balance` → write `{ result, expiresAt: now + 30_000 }` → return. This order ensures cached responses still count against the per-IP rate limit (avoids the soft-DoS amplifier where a hot cache lets a single IP burn function invocations at unlimited QPS).
- Six test cases: (a) success → 200 + `tier: "live"` (mock key prefix `xnd_production_`), (b) success + `tier: "sandbox"` (mock key prefix `xnd_development_`), (c) 401 → 503 + `code: "401"`, (d) network throw → 503 + `code: "network"`, (e) AbortController timeout → 503 with appropriate code (`network` or `408` per the Xendit error class — verify during /build), (f) `tier: "unknown"` when key missing/empty. Plus security assertions: response body never contains the secret string and never contains the prefix beyond the derived label. Plus rate-limit hit returns 429 from the project helper. Plus cache hit short-circuits the second call within 30s.
- Security checklist (`.claude/standards/security.md`) cited in the route's header docblock with each item ticked: auth posture (intentionally public — deploy probe), input validation (no inputs), rate limit applied (30/min/IP), no secret echo (asserted in tests), error responses sanitized (no stack/env in body), entry added to route inventory if one exists.
- Build clean. Vitest green.

### T5 — Synthetic timing test for chunk budget (realistic mix + 429-storm)

**Files:** new `lib/finance/__tests__/xendit-retry.timing.test.ts` (targets the server-side fan-out path — `retryPaymentLinks` shares the same `limit(2)` + `withXenditRetry` shape as the batch endpoint, so timing assertions transfer). NOT `run-bulk-generate.ts` — the orchestrator only calls fetch to the batch endpoint and doesn't talk to Xendit directly.
**Acceptance:** Two vitest cases against a mocked `createXenditSession`. Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` to fast-forward backoffs.
- **Case A — realistic mix:** 25 invoices, dispatch = 5 × 200 immediate + 15 × 429-then-200 + 5 × 5xx-then-200. Assert (a) total simulated wall-clock < 30s, (b) no individual fetch invoked > 2 attempts on the 429 path, (c) 5xx path uses up to 3 attempts.
- **Case B — 429-storm worst case (regression guard for the budget math claim):** 25 invoices, dispatch = all 25 × 429-then-200 (every invoice hits a single 429 retry). Assert simulated wall-clock < **59s** (pinned 1s under the 60s Hobby ceiling claimed in the budget math), and no fetch invoked > 2 attempts. This is the actual contract being shipped — without it, future regressions (someone bumping `BACKOFF_429_MS`, re-adding a 429 attempt, raising concurrency) silently break the budget.

Build clean. Vitest green.

### T6 — End-of-cycle gate + seed-path invariant check

**Files:** none (gate only).
**Acceptance:** Before final commit:
1. **Seed-path invariant check** — run `git diff --name-only origin/staging...HEAD` and assert zero matches against the glob set: `prisma/seed.ts`, `scripts/reseed/**`, `scripts/reseed-staging.ts`, `scripts/seed-demo-users.ts`, `app/api/admin/seed/**`. The output of the diff command goes into the Verification section verbatim. If any seed file is touched, /build STOPS and surfaces the violation — the user did not authorize seed changes in this cycle.
2. `npm run build && npx vitest run && npx playwright test` all green.
3. Verification section gets gate output + Playwright pin + the seed-invariant diff output.
4. design-system token cross-checked (no frontend changes this cycle — note the absence in Verification).

### T7 — Update README.md

**Files:** `README.md`.
**Acceptance:** Cycle adds `/api/health/xendit` (a new route), so README route inventory needs an entry. Plus a one-line entry in "Recent cycles" or equivalent footer per the 2026-04-20 narrow doc-sync rule (cycle doc alone insufficient for `feat:` scoped commits that touch `app/**` or `lib/**`). Build clean.

### Dependencies

- T1, T2, T3, T4 are **independent** of each other — can be parallelized via subagent dispatch.
- T5 depends on T2 + T3 (timing test exercises the orchestrator pacing + 429 trim together).
- T6 depends on T1–T5 (full gate + smoke).
- T7 depends on T6 (README only updated after gate passes).

## Implementation

- Subagent plan: tasks executed inline sequentially in this worktree. Parallel subagents rejected — small per-task diffs across shared git tree would risk staging conflicts. Per-task commit cadence preserved.
- T1 — Concurrency 5 → 2 — `app/api/invoices/generate/batch/route.ts:217`, `lib/finance/xendit-retry.ts:79` — both `limit(5)` → `limit(2)`, comments cite cycle doc + sandbox-quota rationale.
- T2 — Inter-chunk pacing — `lib/finance/run-bulk-generate.ts` exports `INTER_CHUNK_DELAY_MS = 1000`, fires `await sleep(...)` at end of both success + failure paths inside the chunk loop, gated by `!isLastChunk && !signal.aborted`. Test file `lib/finance/__tests__/run-bulk-generate.test.ts` adds 4 cases (N-1 happy-path, last-chunk skip, M2 failure-path regression guard, signal-abort skip) plus patches the existing 60-student test to inject a no-op `sleepImpl` (saves 2s real-time).

## Verification

- T1 — gates passed (`npm run build` clean; `npx vitest run --no-file-parallelism` 786 passed / 42 todo / 0 fail). Concurrency cap is internal — no test assertions changed. Reviewer agent clean (no blockers/majors).
- T2 — gates passed (`npm run build` clean; `npx vitest run --no-file-parallelism` 790 passed / 42 todo / 0 fail). Reviewer agent flagged 2 issues; both fixed: (a) M2-guard test now also asserts `toHaveBeenCalledTimes(4)` so removing the failure-path sleep is falsifiable, (b) existing 60-student multi-chunk test now mocks `sleepImpl` to skip the 2s of real-time sleeps the new pacing introduces.

## Ship Notes

<filled by /ship — see structure below>

### Post-merge staging smoke

1. **Tagihan row count invariant — capture BEFORE merge:** record `Total Tagihan` from `/admin/invoices` page header (currently 3647). Save this number in the PR body comment.
2. After CI green + merge to staging, redeploy lands automatically.
3. **Tagihan row count invariant — verify AFTER merge:** reload `/admin/invoices`. The `Total Tagihan` count MUST equal the pre-merge number exactly. If it changed, this PR somehow added or removed rows — STOP, do not run the drain procedure, investigate immediately.
4. Hit `GET https://annisaa-erp-v3-git-staging-...vercel.app/api/health/xendit`. Expected: `{ ok: true, tier: "sandbox" }`. If `tier: "unknown"` → sandbox key missing/malformed; fix before draining. If 503 → key invalid; fix before draining.
5. Trigger one small bulk-create on staging (≥10 students) and observe the breakdown popover. Expected: 429 rate drops sharply vs pre-merge baseline; new failures (if any) drain via auto-sweep. Note: this step DOES create new tagihan (it's a bulk-create test) — record the new count for follow-up smoke comparisons. The invariant in step 3 is strictly about "did merging the PR alone add rows" — answer must be no.

### Drain procedure (staging — post-merge)

```bash
# From operator's local machine, against the staging tenant:
npx tsx scripts/backfill-pending-payment-links.ts --tenant <staging-tenant-id> --dry-run
# Review breakdown. If <5% are 422 (data validation), proceed:
npx tsx scripts/backfill-pending-payment-links.ts --tenant <staging-tenant-id> --confirm
# Iterates until pending count = 0 OR no progress between iterations.
```

Expected: with concurrency=2 + 1s inter-chunk pacing, the 1341 stuck rows on staging drain to ≤50 hard-fail residual within 1-2 backfill iterations. Hard residual = genuine 422 (bad invoice data) — separate data-cleanup cycle if residual > 50.

### Production tier (deferred)

Adding live `XENDIT_SECRET_KEY` + `XENDIT_WEBHOOK_TOKEN` to Vercel Production scope, the prod backfill run, and any prod-specific concurrency tuning are all **out of scope this cycle**. They will be handled by a future operational cycle when production launch is being planned. The throttle + probe shipped here apply to whatever env is deployed; no further code change is required to support prod tier later.

### Rollback plan

- Revert this PR. Lower concurrency is not a breaking change; reverting restores `limit(5)` and removes the `INTER_CHUNK_DELAY_MS` pause.
- Health probe route is additive — leaving it in place after a partial revert is safe.
- No DB migration. No schema change. No env var added.
- If post-merge sandbox 429s still occur, follow-up cycle drops chunk size 25 → 15 (mitigation (a) from the budget math).
