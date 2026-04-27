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

<filled by /build>

## Verification

<filled by /build>

## Ship Notes

<filled by /ship>
