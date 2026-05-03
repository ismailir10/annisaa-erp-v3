# Invoice Creation Auto-Retry — Kill PENDING_PAYMENT_LINK Accumulation

## Context

Staging carries **584 invoices stuck in `PENDING_PAYMENT_LINK`** with the admin "Coba Lagi Link (584)" button surfaced as the only way to clear them. Operators must click retry up to 24 times (25 per chunk × `runBulkRetry`) and the same accumulation re-occurs on every bulk-generate run because Xendit transient failures (5xx, 429, 408, network blips) are not retried inline.

Current behavior: `app/api/invoices/route.ts` POST (manual single create) and `app/api/invoices/generate/batch/route.ts` (bulk, fan-out concurrency 5) both call `createXenditSessionForInvoice()` exactly once. Any thrown error — whether a transient 503 worth retrying or a hard 401 (env mis-config) that retries cannot fix — is stringified verbatim into `paymentLinkError` and the invoice persists with status `PENDING_PAYMENT_LINK`. The `lib/finance/xendit-retry.ts` retry orchestrator is the **manual** retry surface (called by `/api/invoices/retry-payment-links`); it has no classifier and no exponential backoff either.

Intended outcome: admin clicks "Generate" once for ≥500 invoices and walks away. ≥95% land in `SENT` directly out of bulk-generate. The rare transient residual is swept automatically by the orchestrator before declaring "done." `PENDING_PAYMENT_LINK` becomes a residual surface for genuine ops issues (bad env keys, validation), not a routine bucket the admin clears every payroll cycle. Admins also gain a diagnostic breakdown alongside the rare "Coba Lagi Link (N)" button so they can distinguish "Xendit was flaky for 30 seconds" from "your XENDIT_SECRET_KEY is wrong." Wall-clock target for 500 invoices: 3–5 minutes (sequential client-driven orchestrator, by design — the browser tab drives progress).

This spec adds (1) inline transient-error retry on the create path with strict budget, (2) failure classification persisted as prefix-tagged `paymentLinkError`, (3) **orchestrator-level auto-sweep** that re-runs `retryPaymentLinks` once at the end of `runBulkGenerate` so admin doesn't click anything in the normal case, (4) admin diagnostic breakdown reading the prefix tags, (5) structured Vercel logs per Xendit attempt, and (6) a one-shot backfill (server-side, direct fn call) to clear the 584 existing rows post-merge. Out-of-scope: server-side cron retry, replacing client-driven bulk orchestrator with server background job (see [2026-04-25-tagihan-fixes-async-bulk-manual-create.md](./2026-04-25-tagihan-fixes-async-bulk-manual-create.md) §6-9 for prior decision rationale), webhook hardening (already shipped in [2026-04-26-finance-robustness-a-b-c.md](./2026-04-26-finance-robustness-a-b-c.md) §C), `XENDIT_SECRET_KEY` env hardening (separate ops task — verify staging Vercel project uses real sandbox key, not e2e `test-secret` stub from `playwright.config.ts`), `xenditSessionId` idempotency on lost-response retry (real but rare TOCTOU window, follow-up cycle), and auto-promote `SENT → OVERDUE` cron (registered in `vercel.json` but handler missing, separate cycle).

## Spec

### Acceptance criteria

- [ ] Inline retry on transient Xendit failures wired into:
  - `app/api/invoices/route.ts` POST (manual single create)
  - `app/api/invoices/generate/batch/route.ts` (per-item, inside the 5-way fan-out)
  - `lib/finance/xendit-retry.ts` `retryPaymentLinks` (so manual retry endpoint also benefits)
- [ ] **Retry budget: 2 inline attempts after the initial call (3 attempts total per invoice).** Backoff: `250ms`, `1000ms`. Final transient failure persists `PENDING_PAYMENT_LINK` so the manual retry surface still works as last resort.
- [ ] Transient classification (retry-eligible) — exactly these:
  - Network errors (fetch threw, no HTTP response)
  - HTTP 5xx
  - HTTP 408 (request timeout)
  - HTTP 429 (rate limit) — respect `Retry-After` header if present, capped at 3000ms
- [ ] Hard classification (skip retry) — exactly these:
  - HTTP 401 / 403 (auth — env mis-config)
  - HTTP 422 (validation — invoice data bad)
  - HTTP 400, 404, 409, other 4xx
- [ ] `lib/xendit/client.ts` `createXenditSession()` throws typed `XenditApiError` with `{ status, code, retriable, retryAfterMs?, message }` so callers branch on `retriable` instead of regex-matching error strings.
- [ ] `paymentLinkError` write format becomes prefix-tagged: `5xx:`, `429:`, `408:`, `network:`, `401:`, `403:`, `422:`, `4xx:`, `unknown:`. Example: `"5xx: Xendit returned 503 after 3 attempts"`.
- [ ] Per-attempt structured Vercel log line: `[XENDIT ATTEMPT] tenantId=<id> invoiceId=<id> attempt=<1..3> result=<success|transient|hard> status=<http?> durationMs=<n>`.
- [ ] **Auto-sweep in `runBulkGenerate`**: after all chunks complete (or hit the 3-strike abort), client orchestrator queries `/api/invoices/pending-payment-link` for the count. If `> 0` AND the run was not user-aborted, automatically fire one `runBulkRetry()` call before declaring "done." Manual button only surfaces if count > 0 AFTER the auto-sweep. UX: progress UI shows a brief "Memeriksa link gagal..." phase between chunks-done and final summary.
- [ ] Admin diagnostic surface: alongside `Coba Lagi Link (N)` button, render a Shadcn `<Tooltip>` or `<Popover>` with category breakdown (`5xx: M, 429: K, 401: J, 422: L, 408: P, network: Q, 4xx: R, untagged: S`), computed from a new `GET /api/invoices/pending-payment-link/breakdown` endpoint that aggregates by prefix in SQL (no Node memory load).
- [ ] 401/403-heavy diagnostic copy: when `(401 + 403) / total > 0.5`, popover shows extra warning line: *"Banyak gagal autentikasi. Periksa XENDIT_SECRET_KEY di Vercel."* — guides ops to env, not retry.
- [ ] Backfill script `scripts/backfill-pending-payment-links.ts` callable via `npx tsx`. Calls `retryPaymentLinks()` **directly server-side** (not over HTTP — no session cookie needed). Iterates until pending count = 0 OR no progress between iterations (all remaining are hard-fail). One-shot, gated by `--tenant <id> --confirm` flag. Dry-run mode `--dry-run` prints what would be retried.
- [ ] Pre-existing bug fix bundled into Task 4 (same file): `app/api/invoices/generate/batch/route.ts:301` calls `revalidateTag("parent-invoice-list", { expire: 0 })` — the second argument is not a valid Next.js `revalidateTag` signature. Replace with `revalidateTag("parent-invoice-list")`.
- [ ] Vitest coverage:
  - Mock 5xx then 200 → assert single retry succeeds, status `SENT`, no `paymentLinkError`
  - Mock 401 → assert no retry (1 attempt only), status `PENDING_PAYMENT_LINK`, `paymentLinkError` starts with `401:`
  - Mock persistent 5xx (3×) → assert `PENDING_PAYMENT_LINK`, `paymentLinkError` starts with `5xx:`, exactly 3 attempts logged
  - Mock 429 with `Retry-After: 2` → assert retry waits ~2s (or capped 3s), success on second attempt
  - Mock 422 → assert no retry, `paymentLinkError` starts with `422:`
  - Mock `Retry-After: garbage` → assert defensive parse falls back to default backoff (no NaN crash)
  - Auto-sweep: mock chunk run with 3 transient failures → assert auto-sweep fires, all clear → status `SENT`, no button
  - Auto-sweep: mock chunk run with 3 hard 401 failures → assert auto-sweep fires, all stay `PENDING` → button surfaces with breakdown
  - Auto-sweep: mock user-aborted run → assert auto-sweep does NOT fire
- [ ] Playwright `e2e/admin.spec.ts` bulk-create flow still passes 21/21. Add 1 new test asserting popover renders breakdown when `pendingPaymentLink > 0`.
- [ ] Manual smoke post-merge on staging: trigger bulk create with ≥10 students, observe ≥95% land in `SENT` after auto-sweep, no manual button click. Capture `[XENDIT ATTEMPT]` log sample in `## Verification`.

### Non-goals

- Server-side cron retry (over-engineered for current scale; manual retry surface remains the safety net).
- Replacing client-driven bulk orchestrator with server background job — see prior decision in 2026-04-25 cycle §6-9.
- Webhook hardening — already shipped in 2026-04-26 §C.
- `XENDIT_SECRET_KEY` env hardening — separate ops task, not code.
- Auto-promote `SENT → OVERDUE` cron — registered in `vercel.json` but handler missing; tracked separately.
- `xenditSessionId` idempotency on lost-response TOCTOU — real but rare; flagged as known gap, follow-up cycle.
- Parallel chunk dispatch from client (saturates Hobby concurrent-function limit, no real win at this scale; sequential stays).
- Increasing chunk size beyond 25 (worst-case ~57s with retries on chunk=50, dangerously close to Hobby 60s ceiling).
- Per-invoice streaming progress (chunk-level counter is enough; SSE/WebSocket overkill).

### Assumptions

1. **Vercel plan unknown.** Spec sizes against Hobby 60s ceiling (safest). If staging is on Pro (300s), no spec change needed — math fits both. **Confirm plan in /build before first commit** so we know whether to use `export const maxDuration` for headroom (defensive, not required).
2. **Concurrency cap of 5 stays.** Both `batch/route.ts:216` and `xendit-retry.ts:78` use `limit(5)`. Sized for that.
3. **Xendit 429 `Retry-After` is in seconds (RFC 7231).** Multiply by 1000, cap at 3000ms. Verify against Xendit API docs before coding (architect-flagged); defensive `parseInt()` with fallback to default backoff if value is non-numeric or missing.
4. **Test fixtures for transient errors use `vi.mock` on `lib/xendit/client.ts`** — same pattern as existing `lib/finance/__tests__/xendit-retry.test.ts`.
5. **Backfill script runs from operator's local machine via `npx tsx`** with direct `retryPaymentLinks()` server-side call (Prisma + Xendit SDK; no HTTP, no session cookie). Same auth model as existing seed scripts.
6. **The 584 stuck invoices on staging are recoverable** — they have valid invoice data (no 422 root cause), just hit transient Xendit issues during prior bulk runs. If post-merge backfill prefix breakdown shows >5% are 422, escalate to a separate data-cleanup cycle.
7. **`runBulkGenerate` user-abort signal is observable to the auto-sweep gate.** The orchestrator already accepts an `AbortSignal`; auto-sweep checks `signal.aborted` and skips if true.

### Per-request budget math (worst case)

Bulk batch endpoint, 25 invoices, fan-out concurrency = 5 → 5 sequential waves.

Per-invoice worst case (3 attempts, 250ms + 1000ms backoff between, ~1.5s per Xendit call):
```
1.5s + 250ms + 1.5s + 1000ms + 1.5s = 5.75s
```

Worst-case wave (5 invoices in parallel, longest = 5.75s): **5.75s per wave**.

Total worst case for 5 waves: **5 × 5.75s ≈ 29s**. Plus DB transaction overhead (~1-2s) and response serialization → **~32s end-to-end per chunk request**. Comfortable margin under 60s Hobby ceiling.

Wall-clock for 500 invoices (sequential client orchestrator, 20 chunks):
- Best case (no retries): ~7.5s/chunk × 20 = **~150s (~2.5min)**
- Worst case (every item hits 2 retries): ~32s/chunk × 20 + ~10s auto-sweep = **~650s (~11min)**
- Realistic mix (mostly happy path, ~5% retries): **~3-4min**

Target wall-clock: **3-5min** is acceptable. Single click, clear chunk-level progress, auto-sweep at end, no manual retry click in normal case.

If 429 Retry-After kicks in at the 3000ms cap: per-invoice = 1.5s + 3s + 1.5s = 6s; 5 waves = 30s. Still fits.

Conclusion: 2 inline retries (3 attempts total) is the maximum that fits comfortably. A 3rd retry (4 attempts, +3s backoff) blows the budget on the 25-invoice path. Spec freezes at 2 retries.

## Tasks

> Each task is committable on its own. Between-task gate: `npm run build && npx vitest run`. Reviewer agent on each commit's diff. Order is dependency-driven; do not reorder.

### Task 1 — `XenditApiError` class + classifier in `lib/xendit/client.ts`

- Define `XenditApiError extends Error` with `{ status: number | null, code: "5xx" | "429" | "408" | "network" | "401" | "403" | "422" | "4xx" | "unknown", retriable: boolean, retryAfterMs?: number, message: string }`.
- Replace `throw new Error(...)` at `lib/xendit/client.ts:109` with typed throw that classifies by HTTP status (5xx/408/429 → retriable; 401/403/422/4xx other → hard; fetch threw → `{ status: null, code: "network", retriable: true }`).
- Parse `Retry-After` defensively: `parseInt(header, 10) * 1000` then `Math.min(parsed, 3000)`. If `NaN` or absent, return `undefined` (caller falls back to default backoff).
- Acceptance: unit test `lib/__tests__/xendit-client-classifier.test.ts` covers each code branch + Retry-After parse (numeric, missing, garbage). All asserts on `error.code` + `error.retriable`.

### Task 2 — Inline retry helper `lib/xendit/with-retry.ts`

- `withXenditRetry<T>(fn: () => Promise<T>, ctx: { invoiceId: string; tenantId: string }): Promise<T>` — calls `fn`, catches `XenditApiError`, retries on `retriable === true` up to 3 attempts total, honors `retryAfterMs` (already capped at 3000ms in Task 1), otherwise uses backoff schedule `[250, 1000]`.
- Logs `[XENDIT ATTEMPT] tenantId=<id> invoiceId=<id> attempt=<n> result=<success|transient|hard> status=<n?> durationMs=<n>` on every attempt outcome.
- On final failure, re-throws the last `XenditApiError` so callers can read `error.code` for prefix tagging.
- Constants exported for tests: `MAX_ATTEMPTS = 3`, `BACKOFFS_MS = [250, 1000]`.
- Acceptance: unit test covers (a) success-on-attempt-1, (b) success-after-1-retry on 5xx, (c) terminal failure after 3 attempts on persistent 5xx, (d) immediate fail on hard 401 (1 attempt only), (e) 429 with `Retry-After: 2` waits ~2s, (f) 429 with `Retry-After: 99` capped at 3s, (g) 429 with no Retry-After uses default backoff.

### Task 3 — Wire inline retry into `lib/xendit/helpers.ts`

- Wrap `createXenditSession()` call at `helpers.ts:66` with `withXenditRetry`.
- Surface the typed error so callers can prefix-tag `paymentLinkError`.
- Acceptance: existing `lib/__tests__/xendit-helpers.test.ts` still passes; add 1 new case asserting `XenditApiError` with `code: "5xx"` propagates after 3 attempts.

### Task 4 — Prefix-tag `paymentLinkError` writes (5 sites) + bundled `revalidateTag` bug fix

Helper: `lib/xendit/error-prefix.ts` — `prefixForError(e: unknown): { prefix: string; message: string }`. Returns `prefix` from `XenditApiError.code`, falls back to `"unknown"` for non-typed errors. Caller formats `"<prefix>: <message>"`.

Update 5 writing sites (per explorer report):
- `app/api/invoices/route.ts:229` and `:240`
- `app/api/invoices/generate/batch/route.ts:283`
- `lib/finance/xendit-retry.ts:131`
- `app/api/xendit/create-session/route.ts:110` (legacy endpoint — tag for parity)

**Same task: fix `revalidateTag` bug** in `app/api/invoices/generate/batch/route.ts:301`. Change `revalidateTag("parent-invoice-list", { expire: 0 })` → `revalidateTag("parent-invoice-list")`. Existing pre-cycle bug; touched in same file so bundled here.

Acceptance: vitest asserts each write site uses the helper; existing tests for these routes still pass; build gate passes (the `revalidateTag` signature was likely silently ignored at runtime but flagged by tsc).

### Task 5 — `GET /api/invoices/pending-payment-link/breakdown`

- New route at `app/api/invoices/pending-payment-link/breakdown/route.ts`.
- Returns `{ total: N, byPrefix: { "5xx": M, "429": K, "401": J, "403": JJ, "422": L, "408": P, "network": Q, "4xx": R, "untagged": S, "unknown": U } }`.
- SQL aggregation via `$queryRaw` so we don't pull rows into Node:
  ```sql
  SELECT
    CASE
      WHEN paymentLinkError IS NULL OR position(':' in paymentLinkError) = 0
        THEN 'untagged'
      ELSE substring(paymentLinkError from 1 for position(':' in paymentLinkError) - 1)
    END AS prefix,
    count(*) AS n
  FROM "Invoice"
  WHERE "tenantId" = $1 AND status = 'PENDING_PAYMENT_LINK'
  GROUP BY 1;
  ```
  Explicit "untagged" bucket guards the no-colon case (architect-flagged: `LEFT(str, -1)` returns empty string in Postgres).
- Acceptance: vitest with 9 fixture rows (one per category) asserts breakdown counts + handles untagged.

### Task 6 — Admin UI diagnostic breakdown alongside "Coba Lagi Link (N)"

- File: `app/admin/invoices/page.tsx` (button at line ~680).
- Wrap button in Shadcn `<Tooltip>` (hover) AND `<Popover>` (click for mobile/tap accessibility). Trigger: hover on desktop, tap on mobile.
- Content: bullet list of `byPrefix` counts from new endpoint. Show only non-zero buckets.
- Lazy fetch: only fetch on hover/click open, not initial page load.
- 401/403-heavy ops hint: if `(byPrefix["401"] + byPrefix["403"]) / total > 0.5`, append warning line `"Banyak gagal autentikasi. Periksa XENDIT_SECRET_KEY di Vercel."`
- Empty state: `"Belum ada rincian — coba lagi setelah retry pertama."`
- Acceptance: Playwright `e2e/admin.spec.ts` adds 1 test asserting popover renders breakdown when count > 0 (mock the endpoint).

### Task 7 — Auto-sweep in `runBulkGenerate`

- File: `lib/finance/run-bulk-generate.ts`.
- After the chunk loop completes (success or 3-strike chunk abort, but NOT user abort), check `signal.aborted` — if true, skip sweep.
- Otherwise: fetch `/api/invoices/pending-payment-link?count-only=true` (modify endpoint to accept query param for count-only response — saves payload). If `total > 0`, call `runBulkRetry({ signal, onProgress })` once. Pass through the same progress UI callbacks so admin sees a "Memeriksa link gagal..." phase.
- After auto-sweep: re-query count. The final summary in the UI reports `succeeded`, `pendingAfterSweep`, `categoryBreakdown` (lazy-fetched from breakdown endpoint).
- Auto-sweep is single-shot. If it itself fails (3-strike abort), surface the manual button. Do not loop the sweep.
- Acceptance: 3 vitest cases per the criteria above (transient → cleared; hard → button surfaces; user-aborted → no sweep).

### Task 8 — Backfill script `scripts/backfill-pending-payment-links.ts`

- Imports `retryPaymentLinks` from `lib/finance/xendit-retry.ts` **directly** (server-side fn, not HTTP).
- CLI: `npx tsx scripts/backfill-pending-payment-links.ts --tenant <id> [--confirm] [--dry-run]`.
- `--confirm` required to actually fire Xendit. Without it, prints a summary of what would be retried (count + breakdown) and exits.
- `--dry-run` is alias for "no `--confirm`" — same behavior, more explicit.
- Iterates: fetch pending count, call `retryPaymentLinks(tenantId, null)` (which already chunks at 25), log summary, repeat until count = 0 OR no progress between iterations (all remaining are hard-fail).
- Logs `[XENDIT ATTEMPT]` per item (via `withXenditRetry`) plus per-iteration summary `[XENDIT BACKFILL] tenantId=<id> iteration=<n> retried=<n> succeeded=<n> stillFailed=<n> categoryBreakdown=<json>`.
- Loads env from `.env.local` via `dotenv` config (same pattern as existing seed scripts).
- Acceptance: dry-run mode tested via vitest stub; `--confirm` gate asserted via unit test (no actual Xendit call). Manual smoke via CLI documented in `## Ship Notes`.

### Task 9 — End-of-cycle gate + verification + docs

- Run `npm run build && npx vitest run && npx playwright test` and capture output in `## Verification`.
- Update [README.md](../../README.md) — remove any "PENDING_PAYMENT_LINK accumulation" entries from known-issues table if present; mention the new auto-sweep + diagnostic surface in the Finance module row.
- Update [CLAUDE.md](../../CLAUDE.md) — add to API Standards: *"All Xendit calls go through `withXenditRetry`. Do not call `createXenditSession()` directly except inside the helper."*
- Document known gap (idempotency on lost-response TOCTOU) in the cycle doc Ship Notes for follow-up tracking.
- Fill `## Ship Notes`: migrations (none — `paymentLinkError` already exists), env vars (none new), manual steps (run backfill script post-merge against staging, then prod after staging green), rollback plan (revert PR — no schema change to undo).

## Implementation

### Task 2 — Inline retry helper `lib/xendit/with-retry.ts`

- Added `lib/xendit/with-retry.ts` with `withXenditRetry<T>(fn, ctx)`, exported `MAX_ATTEMPTS = 3` and `BACKOFFS_MS = [250, 1000]`. Honors `XenditApiError.retryAfterMs` when present, otherwise indexes into `BACKOFFS_MS` by attempt. Hard errors (retriable=false or non-typed throws) re-throw after one attempt; retriable errors retry up to 3 attempts then re-throw the last `XenditApiError` so callers can read `error.code` for prefix tagging.
- Structured log per attempt: `[XENDIT ATTEMPT] tenantId=... invoiceId=... attempt=<n> result=<success|transient|hard> status=<httpStatus|null> durationMs=<n>` via `console.log` so success rows are visible too. Convention: final-attempt-failure on retriable error logs `transient` (still the same failure mode in ops grep); `hard` only means non-retriable.
- Test file `lib/__tests__/with-retry.test.ts` — 9 cases: constants, success-on-1, retry-then-success, persistent-5xx 3-attempt terminal, hard 401 (1 attempt), non-typed-error hard, 429 with Retry-After 2000ms, 429 with capped 3000ms, 429 with no Retry-After falling back to BACKOFFS_MS[0].
- Uses fake timers + `vi.advanceTimersByTimeAsync` to validate exact backoff durations without consuming wall clock.

### Task 3 — Wire inline retry into `lib/xendit/helpers.ts`

- Wrapped the single `createXenditSession()` call inside `createXenditSessionForInvoice` with `withXenditRetry(() => createXenditSession(params), { invoiceId, tenantId })`. TOCTOU guard (steps 1-2) and DB persist (step 4) remain outside the retry — only the network call is retried, matching the spec.
- Imported `withXenditRetry` from `@/lib/xendit/with-retry`. Existing `XenditApiError` from Task 1 propagates out of the wrap on retry exhaustion so route-handler callers in Task 4 can prefix-tag `paymentLinkError` on `error.code`.
- Updated `lib/__tests__/xendit-helpers.test.ts`: extended the `vi.mock("@/lib/db", ...)` to include `invoice.findUnique`/`update` and switched `vi.mock("@/lib/xendit/client", ...)` to `importActual` so `XenditApiError` is the real class (needed for `instanceof` assertions while still mocking `createXenditSession`).
- Added 1 new test case "propagates XenditApiError with code:'5xx' after 3 retry attempts" — uses fake timers + `vi.advanceTimersByTimeAsync(1250)` to fast-forward the 250ms + 1000ms backoffs. Asserts: thrown error is `instanceof XenditApiError`, `code === "5xx"`, `status === 503`, exactly 3 mock calls, and `prisma.invoice.update` was NOT invoked (short-circuit before persist).
- Vitest: 741 passed (was 740, +1 new). `npm run build` clean. design-system token: not applicable — no frontend changes in this task; the cycle doc carries the token for the cycle as a whole.

### Task 4 — Prefix-tag `paymentLinkError` writes (5 sites) + bundled `revalidateTag` "bug"

- Added `lib/xendit/error-prefix.ts` with `prefixForError(e)` and `formatPaymentLinkError(e)`. Branches on `instanceof XenditApiError` → uses `error.code`; falls back to `"unknown"` for plain `Error`, raw strings, `null`, `undefined`. The colon separator is load-bearing: Task 5's breakdown endpoint splits `paymentLinkError` on the first colon to aggregate by category.
- Wired `formatPaymentLinkError` into all 5 spec'd write sites:
  - `app/api/invoices/route.ts` (POST manual create) — both the catch-block (Xendit threw, prefix from `XenditApiError.code`) and the helper-returns-null branch (TOCTOU). The null branch wraps the constant message in `new Error(...)` so it lands as `"unknown: Gagal membuat sesi pembayaran"` rather than dropping into the SQL `"untagged"` bucket.
  - `app/api/invoices/generate/batch/route.ts` — the per-invoice fan-out catch (both rejected and fulfilled-with-null branches use the helper).
  - `lib/finance/xendit-retry.ts` — same shape as the batch route.
  - `app/api/xendit/create-session/route.ts` (legacy single endpoint) — persisted `paymentLinkError` is prefix-tagged; the user-facing `errors[]` line keeps the plain message for readability (preserves the existing `"<student>: <msg>"` contract that the admin UI displays).
- **`revalidateTag` bug investigation — spec was wrong, no fix needed.** The spec claimed `revalidateTag("parent-invoice-list", { expire: 0 })` was an invalid signature. Verified against `node_modules/next/dist/server/web/spec-extension/revalidate.d.ts`: in Next.js 16 the signature is `revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined` — the second argument is **required**. Removing it broke the build with `TS2554: Expected 2 arguments, but got 1`. The codebase already uses `{ expire: 0 }` consistently in 6 other `revalidateTag` call sites (webhook, retry-payment-links, employees). Reverted both changes; left the original calls intact. The spec author appears to have been thinking of the Next.js 14 single-arg signature.
- Updated 6 existing test fixtures to the new prefix-tagged write format:
  - `lib/finance/__tests__/xendit-retry.test.ts` — 3 sites (mixed-success, 25-of-25 with-3-failures, single-failure update assertion).
  - `app/api/__tests__/invoices-manual-create.test.ts` — 2 sites (helper-throws, helper-returns-null).
  - `app/api/__tests__/invoices-generate-batch.test.ts` — 2 sites (mixed-outcomes failure update, 25-student-with-3-failures error string).
  - `app/api/__tests__/xendit-create-session.test.ts` — 2 sites (single Xendit-failure update, mixed-batch C-update). The user-facing `errors[]` assertion in this file unchanged because that field still carries the plain message.
- Added `lib/__tests__/error-prefix.test.ts` (11 cases): every `XenditErrorCode` value maps to its own prefix; plain `Error` → `"unknown:"`; non-Error throws (`"oops"`, `null`, `undefined`) → stringified under `"unknown:"`; `formatPaymentLinkError` shape verified for `XenditApiError`, `Error`, and non-Error throws.
- `npm run build` clean. Vitest: **749 passed** (was 741 after Task 3, +8 new from `error-prefix.test.ts`). design-system token: N/A — no frontend changes.

### Task 5 — `GET /api/invoices/pending-payment-link/breakdown`

- New route `app/api/invoices/pending-payment-link/breakdown/route.ts`. Admin-only (403 on missing session or non-admin role via `isAdminRole`). Returns `{ total, byPrefix }` with all 10 buckets (`5xx`, `429`, `408`, `network`, `401`, `403`, `422`, `4xx`, `untagged`, `unknown`) zero-filled so consumers don't have to handle absent keys.
- SQL aggregation via tagged-template `prisma.$queryRaw` (matches existing codebase style, e.g. `lib/finance/invoice-numbers.ts:64`, `app/api/promotions/route.ts:118`). The `CASE` expression splits `paymentLinkError` on the first colon via Postgres `position()` + `substring()`; the `IS NULL OR position(':' in ...) = 0` guard puts pre-cycle unprefixed rows into the explicit `'untagged'` bucket (avoids the `LEFT(str, -1) = ''` edge case the spec flagged).
- Tenant-scoped: `WHERE "tenantId" = ${session.tenantId} AND status = 'PENDING_PAYMENT_LINK'`. Status is a literal (no need to interpolate), tenantId is the only parameterised value. `count(*)::bigint` cast and JS `Number(row.n)` coercion handle the BigInt return shape.
- Defensive: any unexpected `prefix` value (e.g. older data with a different tag scheme like `weirdold:`) folds into `byPrefix.unknown` rather than leaking surprise keys to the consumer.
- Test file `app/api/__tests__/invoices-pending-payment-link-breakdown.test.ts` (7 cases): 3 auth gates (no session, TEACHER, GUARDIAN — all 403, no SQL fired), empty state (zero rows, all 10 buckets present and zero), 9-row fixture asserting `total=25` + each bucket value, unknown-prefix fold-in (`weirdold` lands in `unknown`), and tenant scoping (captures the tagged-template values, asserts `["tnt-1"]` is the sole interpolation, sanity-checks SQL contains `PENDING_PAYMENT_LINK` + `paymentLinkError` + `GROUP BY`).
- `npm run build` clean (route registered as `/api/invoices/pending-payment-link/breakdown`). Vitest: **756 passed** (was 749 after Task 4, +7 new). design-system token: N/A — no frontend changes (Task 6 wires the UI).

### Task 6 — Admin UI diagnostic breakdown alongside "Coba Lagi Link (N)"

- New component `components/admin/invoices/pending-link-breakdown-popover.tsx` (~150 LOC) that wraps the header retry button in a Shadcn `<Popover>`. **Single Popover** (not Tooltip+Popover dual trigger): the cycle spec mentioned both for hover-on-desktop / tap-on-mobile but the underlying intent — "render breakdown alongside the button" — is satisfied by one Popover that opens on click on every device, is accessible by default (Shadcn handles keyboard + screen-reader semantics), and avoids the dual-trigger state dance. Documented the choice inline in the component header.
- Lazy fetch on first open only. The handler short-circuits when `data` is already present so closing + re-opening the popover doesn't re-hit the endpoint during a single retry session — verified by a dedicated test case (`only fetches once even after closing and re-opening`).
- Renders only non-zero buckets, ordered transient-first (`5xx, 429, 408, network, 401, 403, 422, 4xx, untagged, unknown`) so admins recognize the "be patient" categories before the hard ones. Empty state copy matches spec verbatim: `"Belum ada rincian — coba lagi setelah retry pertama."`.
- 401/403-heavy hint: `(byPrefix["401"] + byPrefix["403"]) / total > 0.5` triggers the inline warning `"Banyak gagal autentikasi. Periksa XENDIT_SECRET_KEY di Vercel."` with `XENDIT_SECRET_KEY` rendered as `<code>`. Strict greater-than (not `>=`) per spec; tested at 0.66 (warning shows) and 0.25 (warning suppressed).
- Wired into `app/admin/invoices/page.tsx`: replaced the inline 11-line `<Button>Coba Lagi Link (N)</Button>` with `<PendingLinkBreakdownPopover count={...} retrying={...} onClickRetry={...} />`. The retry CTA inside the popover (`"Coba Lagi Sekarang"`) calls the same `setRetryConfirmOpen(true)` handler that the inline button used, preserving the existing confirm-dialog flow.
- Component test `components/admin/invoices/__tests__/pending-link-breakdown-popover.test.tsx` (9 cases): trigger renders count, no fetch on mount, fetch fires on first open + renders non-zero buckets only, empty-state hint when `total=0`, auth-heavy warning at 0.66 share, no warning at 0.25 share, retry CTA fires `onClickRetry`, "Mencoba..." label when `retrying=true`, single fetch across open/close/re-open. Uses RTL + `userEvent` (already in `package.json`); `vi.stubGlobal("fetch", ...)` to mock the endpoint.
- Playwright e2e in `e2e/admin.spec.ts`: new test `pending-payment-link breakdown popover renders bucket counts when count > 0` mocks the breakdown endpoint via `page.route()` (browser-side GET, interceptable — server-side Xendit call from the suite header §2 is not, but this endpoint lives on the same Next.js host and the GET is fired by the client component). The test creates a real failing-Xendit invoice first to ensure `stats.pendingPaymentLink > 0` so the trigger renders. Asserts non-zero buckets visible, zero buckets absent, auth warning suppressed at sub-threshold share, and the inner "Coba Lagi Sekarang" button is present.
- `npm run build` clean. Vitest: **765 passed** (was 756 after Task 5, +9 new from the component test). End-of-cycle Playwright deferred to Task 9 per cycle workflow. design-system token: single Popover only — used native Shadcn primitive, no custom styling beyond `border-warning/40 text-warning` already used on the prior inline button (CSS variables, no hex).
- **Follow-up (code review I1+I2):** extracted the 10-bucket prefix list into `PAYMENT_LINK_ERROR_PREFIXES` + `PaymentLinkErrorPrefix` type in `lib/xendit/error-prefix.ts` — the breakdown route, popover component, and test fixture builder all import it now (was duplicated in 3 places, miss-on-add risk = silent invisible bucket). Also extracted `AUTH_HEAVY_THRESHOLD = 0.5` as a named module constant in the popover and added a boundary test at exactly `total=4, 401+403=2` (ratio = 0.5) asserting the warning is NOT shown — locks in strict `>` over `>=`. Vitest: **766 passed** (765 + 1 boundary test). No behavior change; pure refactor.

### Task 7 — Auto-sweep in `runBulkGenerate`

- Added `"sweeping"` value to `BatchProgressPhase`, plus optional `sweepRan?: boolean` and `pendingAfterSweep?: number` fields on `BatchProgressSnapshot`. Both are `undefined` until chunks complete; populated by the new auto-sweep block. The UI already renders any phase string transparently, so no consumer change required (BatchProgressCard component picks up `"sweeping"` for free).
- Inserted post-chunk auto-sweep in `lib/finance/run-bulk-generate.ts` between the `while` loop and the final `phase = "done"` return, gated on `!input.signal?.aborted`. Extracted into a private `runAutoSweep(snapshot, fetchImpl, signal, onProgress)` helper (~70 LOC including jsdoc) — the sweep logic was just over the inline-tolerance threshold and reads cleaner as a named step.
- Sweep flow: (1) cheap `?count-only=true` pre-check via the modified pending endpoint; if 0 → `sweepRan = false`, return. (2) Otherwise: `phase = "sweeping"`, fire `runProgress` so the UI flips, call `runBulkRetry` exactly once with `signal` + `fetchImpl` passed through; `onOverflow` returns false (auto-sweep cannot prompt the user; if there are >1000 pending, the manual button is the explicit-consent path), `onProgress` is no-op (per `BatchProgressPhase` doc — chunk counters intentionally frozen during sweep, `pendingAfterSweep` is the post-sweep source of truth). (3) Re-query count post-sweep → `pendingAfterSweep`. On any sweep-internal abort or count-fetch failure, fall through to the re-count which surfaces the manual button via `pendingAfterSweep > 0`.
- Modified `app/api/invoices/pending-payment-link/route.ts` to accept `?count-only=true`. When set, skips `findMany` and returns just `{ total: N }`. Used `new URL(req.url).searchParams.get(...)` (not `req.nextUrl.searchParams`) so the existing vitest fixture's plain `Request` objects keep working — `nextUrl` only exists on the Next-augmented `NextRequest`.
- Updated 2 pre-existing tests (`single chunk (5 students)`, `multi chunk (60 students)`) to mock the new `?count-only=true` GET returning `{ total: 0 }` and bumped the asserted call counts (2 → 3 and 4 → 5 respectively). The remaining tests either don't assert call counts or land 0 PENDING_PAYMENT_LINK invoices, so the sweep gracefully short-circuits when the count fetch is unmocked (returns `undefined`, caught by the orchestrator's defensive try/catch).
- Added 3 new test cases per the cycle spec acceptance criteria: (a) **transient cleared** — 25 students, 22 SENT + 3 PENDING; pre-sweep count=3, retry succeeds all 3, post-sweep count=0; asserts `sweepRan=true`, `pendingAfterSweep=0`, phase progression `running → sweeping → done`, exactly 2 count-only fetches. (b) **hard surfaces** — 25 students, 23 SENT + 2 PENDING (401); retry HTTP 200 but Xendit re-fails for both; asserts `sweepRan=true`, `pendingAfterSweep=2` (manual button surfaces). (c) **user-aborted skips** — 60 students, abort after first chunk; asserts `sweepRan` and `pendingAfterSweep` stay `undefined`, no `pending-payment-link` or `retry-payment-links` URLs in the fetch log.
- Added 3 new test cases to `app/api/__tests__/invoices-pending-payment-link.test.ts`: (a) `?count-only=true` returns `{ total }` only, skips `findMany`, calls `count` exactly once with the same tenant + status filter; (b) `count-only=false` and `count-only=1` (any value other than the literal string `"true"`) fall through to the full path; (c) auth gate still 403s for non-admin even on count-only.
- `npm run build` clean. Vitest: **772 passed** (was 766, +6 new: 3 sweep + 3 endpoint). No `any` types introduced. design-system token: N/A — no frontend changes; the existing BatchProgressCard renders the new `"sweeping"` phase value as-is.
- **Follow-up (code review I1+I2):** DRY'd the duplicated count-only fetch in `runAutoSweep` into a private `fetchPendingCount(fetchImpl, signal, fallback)` helper at the bottom of `lib/finance/run-bulk-generate.ts` — pre-sweep call uses fallback=0 (skip sweep on network blip), post-sweep call uses fallback=pendingCount (over-report rather than drop the manual surface). Helper is module-private (not exported). Also hardened 3 pre-existing tests that were reaching `phase: "done"` while their fetchMock stack ran dry — the count-only fetch was returning `undefined` and the `await res.json()` throw was being swallowed by the orchestrator's catch, silently skipping the sweep gate. Added explicit `mockResolvedValueOnce(jsonResponse({ total: 0 }))` to: "partial Xendit failure tallies", "does nothing when signal is not provided (back-compat)", and "failure rows on snapshot" — matching the pattern already used by the single-chunk and multi-chunk happy-path tests. Pure refactor + test hardening, no behavior change. Vitest: **772 passed** (unchanged count).

### Task 8 — Backfill script `scripts/backfill-pending-payment-links.ts`

- New script `scripts/backfill-pending-payment-links.ts` (~165 LOC). Imports `retryPaymentLinks` from `@/lib/finance/xendit-retry` directly — no HTTP, no session cookie. CLI flags: `--tenant <id>` (required), `--confirm` (required for live retries), `--dry-run` (alias for "no `--confirm`"). When both `--confirm` and `--dry-run` are passed, the last flag wins (matches conventional CLI parsing). Without `--confirm`, prints the initial breakdown and exits with `0` — no Xendit calls fired. Per-attempt `[XENDIT ATTEMPT]` logs come for free from `withXenditRetry` inside the helper; per-iteration summary logs are emitted by the script as `[XENDIT BACKFILL] tenantId=... iteration=... retried=... succeeded=... stillFailed=... pendingTotal=... categoryBreakdown=<json>`.
- Loop terminates on (1) `pendingTotal === 0`, (2) stall — `last.total >= prevCount` (all remaining are hard-fail like 401/422), or (3) `MAX_ITERATIONS = 50` cap (belt-and-suspenders against the hypothetical "always-progresses-by-1" pathology). All three exits return `{ exitCode: 0, ...stats }` so an operator can pipe to `jq`/grep without special-casing stall.
- **Refactor: SQL extracted into a shared helper.** New file `lib/finance/pending-breakdown.ts` exports `getPendingPaymentLinkBreakdown(tenantId)` returning `{ total, byPrefix }`. Both consumers — `app/api/invoices/pending-payment-link/breakdown/route.ts` and the new script — now call this helper. Eliminates the third-place duplicate before it lands; future schema or aggregation tweaks happen in one file. The route is now ~30 LOC of auth-gate + delegation; the SQL + zero-fill + unknown-fold-in lives in the helper. Existing 7 route tests still pass — they mock `prisma.$queryRaw` at the same level so behavior is preserved.
- **Testability via dependency injection.** The script's `runBackfill(args, deps)` accepts `{ retry, fetchBreakdown, log }` so tests inject mocks and never touch Prisma or Xendit. The CLI entry point at the bottom of the file (gated by an `isDirectRun` check on `process.argv[1]`) wires the real implementations and calls `prisma.$disconnect()` before `process.exit()`. Tests import the file without triggering the CLI block.
- **`requestOrigin` handling.** `retryPaymentLinks` accepts an optional `requestOrigin` (passed by API route handlers from `new URL(req.url).origin`). The script omits it — `lib/xendit/helpers.ts:resolveAppOrigin` falls back to `NEXT_PUBLIC_APP_URL` from env, which `.env.local` provides. Documented inline in the script header. No `--app-origin` CLI flag added; if a future operator needs to override, they can `NEXT_PUBLIC_APP_URL=... npx tsx ...`.
- **Env loading.** Existing scripts (`reseed-staging.ts`) use `tsx --env-file-if-exists=.env.staging`. The script header documents the same pattern: `npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts ...`. No `dotenv` package add (it's not in the lockfile and the established pattern uses tsx's built-in flag).
- Test file `scripts/__tests__/backfill-pending-payment-links.test.ts` (14 cases): (a) `parseArgs` — 6 cases covering all flag combinations + missing tenant + last-flag-wins; (b) guards — exitCode=2 on missing tenant; (c) dry-run gate — no retry call when `--confirm` absent, initial breakdown still printed; (d) empty pending — exits cleanly without firing retry; (e) live happy path — single iteration clears all + multi-iteration progressive clear; (f) stall detection — same count two iterations in a row triggers `STALLED` log + `stalled: true` in result; (g) `MAX_ITERATIONS` cap as belt-and-suspenders. Vitest: **786 passed** (was 772 after Task 7, +14 new). `npm run build` clean. design-system token: N/A — no frontend changes.

<!-- /build continues here -->

## Verification

### Spec acceptance criteria

- [x] Inline retry on transient Xendit failures wired into manual create + bulk batch + retry-payment-links — Tasks 1-3, helper at `lib/xendit/with-retry.ts`, vitest covers all paths.
- [x] Retry budget: 3 attempts total, backoff `[250ms, 1000ms]`. Final transient failure persists `PENDING_PAYMENT_LINK`.
- [x] Transient classification (5xx / 408 / 429 / network) — covered by `XenditApiError.code` + unit tests.
- [x] Hard classification (401 / 403 / 422 / other 4xx) — covered.
- [x] `XenditApiError` typed throw at `lib/xendit/client.ts` with `{ status, code, retriable, retryAfterMs?, message }`.
- [x] `paymentLinkError` write format prefix-tagged at all 5 sites — Task 4. Helper `formatPaymentLinkError` handles `unknown`/non-Error inputs.
- [x] Per-attempt structured Vercel log line `[XENDIT ATTEMPT] ...` — Task 2.
- [x] Auto-sweep in `runBulkGenerate` (post-chunk, gated on `!signal.aborted`, single-shot) — Task 7. 3 vitest cases pass (transient cleared, hard surfaces, user-aborted skips).
- [x] Admin diagnostic surface — `GET /api/invoices/pending-payment-link/breakdown` (Task 5) + popover component (Task 6). 401/403-heavy hint at `>0.5` ratio, boundary test at exactly `0.5` confirms strict `>`.
- [x] Backfill script `scripts/backfill-pending-payment-links.ts` with `--tenant`/`--confirm`/`--dry-run` — Task 8. 14 vitest cases.
- [x] Vitest coverage — all 9 acceptance scenarios from spec covered across `lib/__tests__/with-retry.test.ts`, `lib/__tests__/xendit-helpers.test.ts`, `lib/finance/__tests__/run-bulk-generate.test.ts`, and the 4 route tests. **786 passed | 42 todo | 0 failed.**
- [⚠️] Playwright `e2e/admin.spec.ts` 21/21 + 1 new — **see "End-of-cycle gate output" below**: new test passes in isolation with the correct admin user ID; full-suite failures are environmental (stale `ADMIN_USER_ID` literal in test fixtures vs locally re-seeded DB), not cycle-introduced.
- [ ] Manual smoke post-merge on staging — **deferred to post-merge**, documented in Ship Notes manual-steps section.

### End-of-cycle gate output

**`npm run build`** — clean. All routes built successfully including new `/api/invoices/pending-payment-link/breakdown`.

**`npx vitest run`** — `Test Files 90 passed | 2 skipped (92), Tests 786 passed | 42 todo (828)`. Duration 54.89s. Zero failures.

**`npx playwright test`** — `21 passed | 33 failed` over 18.7 min. **All 33 failures are environmental, not cycle-introduced.**

Root cause: the `beforeEach` in `e2e/admin.spec.ts`, `e2e/admin-school-admin.spec.ts`, and the `Tersedia` locator strictness in `e2e/teacher.spec.ts:53` rely on database state that diverges from the local Postgres in this worktree. Specifically, the test files hardcode `ADMIN_USER_ID = "u_super_admin"` (matching `prisma/seed.ts:138`), but the locally-running DB has been reseeded by `scripts/seed-demo-users.ts` (UUID-based admin like `be131b45-b67b-4599-8a11-bd4bc8a35041`) via a prior session. With the wrong ID in the cookie, every test's `page.goto("/admin")` redirects back to `/` (login picker) and `waitForURL("**/admin")` times out at 15s.

**Verification that the cycle's new code passes Playwright cleanly:** ran the cycle's only new e2e test in isolation, after temporarily substituting the local DB's actual admin UUID into `e2e/admin.spec.ts`:

```
[chromium] › e2e/admin.spec.ts:601:7 › Admin tagihan flows › pending-payment-link breakdown popover renders bucket counts when count > 0
1 passed (9.3s)
```

The popover renders, the `5xx` and `401` non-zero buckets display, the auth-heavy warning is correctly suppressed at sub-threshold share, and the inner "Coba Lagi Sekarang" CTA is reachable. **The cycle's code is sound.** The Playwright failure surface is a pre-existing environmental drift (DB seed vs test-fixture user ID) flagged for a separate cleanup cycle — see Ship Notes Known Gaps.

The previous cycle (`686235c docs(cycle): record end-of-cycle Playwright pass (21/21 18.4m)`) ran in an environment where the local DB had been freshly seeded via `prisma/seed.ts` (which writes `u_super_admin`). Re-running `prisma/seed.ts` against the local DB would restore the contract — but that's a workspace-state action outside the scope of this docs-only Task 9 commit and would also trash the demo Supabase Auth user mappings the operator currently needs.

### Spec deviations (documented)

1. **Task 4 — `revalidateTag` "bug fix" reverted.** Spec claimed `revalidateTag("parent-invoice-list", { expire: 0 })` had an invalid signature in Next.js 16. Verification against `node_modules/next/dist/server/web/spec-extension/revalidate.d.ts` confirmed Next.js 16 actually **requires** the second arg (`profile: string | CacheLifeConfig`); single-arg call breaks build with `TS2554`. The codebase uses `{ expire: 0 }` consistently across 6 sites. No change applied. Spec author appears to have been thinking of the Next.js 14 single-arg signature.

2. **Task 6 — single Popover instead of Tooltip+Popover dual trigger.** Spec mentioned both for hover-on-desktop / tap-on-mobile. Implementation uses one `<Popover>` that opens on click on every device — accessible by default (Shadcn handles keyboard + screen-reader semantics), avoids dual-trigger state choreography, satisfies the underlying intent ("render breakdown alongside the button"). Documented inline in `components/admin/invoices/pending-link-breakdown-popover.tsx` header.

## Ship Notes

### Migrations
None — `paymentLinkError` column already exists from prior cycle (2026-04-26 finance robustness).

### Environment Variables
None new. Existing `XENDIT_SECRET_KEY` / `NEXT_PUBLIC_APP_URL` continue to be used.

### Manual Steps Post-Merge

1. **Verify Vercel plan + maxDuration on staging** — auto-sweep budget math sized against Hobby 60s ceiling. If staging is on Pro (300s), no action needed but worth confirming via `vercel project inspect` or the Vercel dashboard.

2. **Verify `XENDIT_SECRET_KEY` on staging** — confirm it's a real Xendit sandbox key, not the e2e `test-secret` stub. If it's the stub, retries will all hit 401 and the auto-sweep will not help.

3. **Run backfill script against staging tenant** — clears the 584 PENDING_PAYMENT_LINK accumulation:
   ```bash
   # Dry-run first to see breakdown
   npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts --tenant <staging-tenant-id> --dry-run
   # Live retry (only after dry-run looks sensible)
   npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts --tenant <staging-tenant-id> --confirm
   ```
   Expected: most clear (transient 5xx residual), some may stall as 401/422 — those need ops attention via the diagnostic popover.

4. **Smoke test bulk-generate on staging** — trigger creation of ≥10 invoices. Expected: ≥95% land in `SENT` directly out of the chunk loop. Auto-sweep only fires for the residual. Capture `[XENDIT ATTEMPT]` log sample from Vercel logs as evidence the structured logging works in production.

5. **Promote to prod** after staging green for at least 1 cycle — same backfill steps against prod tenant.

### Rollback Plan

```bash
git revert <PR-merge-SHA>  # No schema change to undo
```
The auto-sweep is purely client-side orchestration; reverting removes the new endpoints/components/script and restores the prior single-attempt + manual-button behavior. No DB migration to undo.

### Known Gaps (Follow-up Cycles)

1. **Idempotency on lost-response TOCTOU** — if a Xendit session create succeeds but the response is lost mid-flight (e.g. Vercel timeout), the next retry creates a 2nd Xendit session for the same invoice. Real but rare. Tracked for follow-up cycle. Mitigation: `createXenditSessionForInvoice` already short-circuits if invoice is `PAID`/`CANCELLED`, but doesn't check existing `xenditSessionId`.

2. **>1000 PENDING auto-sweep bypass** — if more than 1000 invoices are stuck after a bulk run, auto-sweep silently skips (orchestrator's `onOverflow: () => false`). Manual button surfaces. Acceptable for current single-PAUD-tenant scale. Revisit if multi-tenant adoption introduces larger accumulations.

3. **`revalidateTag(tag, profile)` signature** — Next.js 16 changed this to require the 2nd arg. Cycle's bundled "bug fix" was based on a stale Next.js 14/15 mental model and was correctly NOT applied. No action needed; flagged here so future spec authors don't re-attempt the same change.

4. **e2e seed/test-fixture drift** — `e2e/admin.spec.ts:6` and `e2e/admin-school-admin.spec.ts` hardcode `ADMIN_USER_ID = "u_super_admin"` matching `prisma/seed.ts`. Local development environments seeded via `scripts/seed-demo-users.ts` (Supabase-Auth UUID-keyed) drift from this contract and the full Playwright suite fails 33/54 with `waitForURL` timeouts. Two clean fixes are possible: (a) make e2e tests dynamically discover the SUPER_ADMIN ID from `/api/auth/users` (the same pattern the existing `firstActiveYearId` helper uses for academic years); or (b) standardize on `prisma/seed.ts` for any environment that runs Playwright. Tracked as a separate ergonomics cycle. **Not cycle-introduced** — verified by reproducing the failure on a fresh checkout of the cycle's base SHA `abaad97`. Also affects the `Teacher › salary slips page loads` test where a strict-mode locator `text=Tersedia` matches 21 elements (the seeded data + slip table both contain the badge text). New cycle test passes 1/1 in isolation when given the correct admin ID.
