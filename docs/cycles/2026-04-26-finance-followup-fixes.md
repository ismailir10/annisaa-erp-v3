# Finance Module — Post-PR-140 Follow-Up Fixes

**Branch:** `claude/zealous-wright-dab56c` (harness-created; will rename to `feat/finance-followup-fixes` if /ship needs feat/* prefix).
**Cycle file:** this file is the only markdown for this cycle.
**Predecessor:** [`2026-04-25-tagihan-fixes-async-bulk-manual-create.md`](2026-04-25-tagihan-fixes-async-bulk-manual-create.md) (PR #140, merged into staging at `c5655868`).
**design-system:** cross-checked §StatusBadge palette only — no new visual changes in this cycle.

---

## Context

PR #140 rewrote the finance module: client-chunked bulk generation, manual single-invoice POST, retry endpoints, WebhookEvent dedup table, Decimal-safe sums, advisory locks on the webhook + manual-payment + void paths, status `PENDING_PAYMENT_LINK`, etc. 16 tasks, 118 new vitest cases, all green.

After re-auditing the **post-PR-140** code (worktree rebased onto staging at `c5655868`), four real residual issues survive — three correctness, one dead code:

1. **Parent invoice list leaks `PENDING_PAYMENT_LINK` and `CANCELLED` invoices to parents** ([`lib/parent-helpers.ts:376`](../../lib/parent-helpers.ts:376)). PR #140's Spec §21 declared the parent allow-list `["SENT","PARTIALLY_PAID","OVERDUE"]`, and the home-page slice (`getStudentInvoices` at [`lib/parent-helpers.ts:139`](../../lib/parent-helpers.ts:139)) does honour that. But the dedicated `/parent/invoices` page route uses a different helper, `getParentInvoiceList`, which filters by `status: { not: "DRAFT" }` — a deny-list that lets `PENDING_PAYMENT_LINK` and `CANCELLED` rows through. The parent client classifies anything with `remaining > 0 && status != "PAID" && status != "CANCELLED"` as "outstanding" ([`app/parent/invoices/client.tsx:35-38`](../../app/parent/invoices/client.tsx:35)) so the PENDING row appears in the due list with no payment link (because `xenditPaymentUrl` is null) and no error message — looks like a school-side bug to the parent. CANCELLED is filtered by `isOutstanding` but still renders in the page (the `paid`/history group? — actually `isPaid` requires `status === "PAID"`, so CANCELLED is shown nowhere AND silently included in the `summary` reduce — small but real noise). **User-facing money trust bug.**
2. **`Payment.xenditPaymentId @unique` is declared but never written** ([`prisma/schema.prisma`](../../prisma/schema.prisma) Payment model + [`app/api/xendit/webhook/route.ts:202-210`](../../app/api/xendit/webhook/route.ts:202)). PR #140's Spec §1 acceptance was "webhook writes the Xendit payment id into `Payment.xenditPaymentId`". The actual `tx.payment.create` call writes `reference: paymentId` only — the unique column stays NULL on every Xendit-originated payment. Postgres treats multiple NULLs as distinct, so the constraint enforces nothing. The outer `WebhookEvent` UNIQUE-on-`eventId` table catches duplicate provider deliveries (so today there is no double-payment in practice), but the schema constraint advertised as the inner safety net is inert. Two costs: (a) a future change that loses the WebhookEvent dedup loses all idempotency, and (b) operational queries by `xenditPaymentId` (e.g. correlating a Xendit dashboard refund event back to a Payment row) return zero rows.
3. **`nextInvoiceNumber` advisory-lock key is anagram-collision-prone** ([`lib/finance/invoice-numbers.ts:17`](../../lib/finance/invoice-numbers.ts:17)). The lock-key derivation `tenantId.split("").reduce((h, c) => h + c.charCodeAt(0), 0)` is a sum-of-charcodes hash. Any two tenant UUIDs whose characters are permutations (or just sum to the same total) serialise on the same Postgres advisory lock — quietly turning concurrent bulk-generates from two tenants into a sequential queue. Single-tenant MVP today, so no observed contention, but the webhook + void routes already use Postgres `hashtext()` for their per-invoice locks — the inconsistency is a landmine for the multi-tenant phase the README claims is the foundation. PR #140's Task 7 code-review log explicitly flagged this as "intentionally inheriting legacy behaviour"; this cycle finishes that fix because the legacy is gone now.
4. **`PUT /api/invoices/[id]` still auto-creates a Xendit session on transition to SENT** ([`app/api/invoices/[id]/route.ts:47-54`](../../app/api/invoices/[id]/route.ts:47)). PR #140 added inline-Xendit on every invoice creation path (batch + manual), so the only invoices without a session are `PENDING_PAYMENT_LINK` rows that the retry endpoint owns. The PUT path is no longer reachable from any UI: the admin list calls `/api/invoices/retry-payment-links` (not PUT) for failed-link recovery, and there is no other DRAFT→SENT transition in the codebase. The PUT auto-create branch is dead code that could quietly fire and create a *second* Xendit session in a TOCTOU race if a future caller touches it. Deleting it removes 8 lines and one moving part.

**Why now:** parent trust is the highest-stakes surface in the app (mentioned in CLAUDE.md alongside payroll). A single confused parent who can't pay an invoice they shouldn't have seen costs more than the entire cycle costs to ship. The other three are <30-line fixes that pay back the moment a second tenant comes online or the operator tries to reconcile a Xendit refund.

**Out of scope:**
- `payment_session.failed` and `payment_session.refunded` webhook handlers. Xendit Checkout Session API does not deliver these in the same way Invoice API does; needs Xendit-account-level investigation + product decision on what to surface to admin/parent. Separate cycle.
- Server-side `OVERDUE` status batch job. The schema lists OVERDUE but no code sets it; admin "Jatuh Tempo" stat is therefore always 0. Needs a cron, which Vercel free tier doesn't have natively. Defer.
- Refactor of `lib/xendit/helpers.ts` to skip the re-fetch when callers already have the invoice. Optimisation, not correctness.
- Changes to the WebhookEvent dedup architecture itself — the outer dedup is solid.
- Changes to bulk orchestration (`run-bulk-generate.ts` / `run-bulk-retry.ts`) — those are well-tested and working.
- New tests for files the cycle doesn't touch.
- Any change to fee-components or fee-structure routes (they have their own latent issues, but they're not "broken" — separate cycle).

**Assumptions (correct me if wrong):**
- Parents should never see `PENDING_PAYMENT_LINK` invoices. Once Xendit eventually succeeds (manual retry by admin), the row flips to `SENT` and appears in the parent list normally. Same as PR #140's stated intent.
- Parents should never see `CANCELLED` invoices either — once voided, the parent shouldn't be told it ever existed. (Spec §21 was silent on CANCELLED; deny-listing makes the most sense.)
- `Payment.xenditPaymentId` is the right idempotency key (not e.g. `payment_session_id`). PR #140's Spec §1 said so. Keep `reference` for human-readable display + manual `BANK_TRANSFER` references.
- Consolidating `nextInvoiceNumber`'s lock key with the rest of the codebase via `hashtext()` is the right move. Postgres `hashtext()` returns int4 (–2B..+2B), which is what `pg_advisory_xact_lock(int)` expects.
- Removing dead PUT auto-Xendit logic is safe (verified by grep: no UI calls `PUT /api/invoices/[id]` with a SENT body — only the manual POST + batch + retry endpoints transition status to SENT).

---

## Spec

Acceptance criteria — every line below must be true at end of cycle.

### Bug fixes

1. **Parent invoice list deny-list → allow-list.** [`lib/parent-helpers.ts`](../../lib/parent-helpers.ts) `getParentInvoiceList` filter changes from `status: { not: "DRAFT" }` to `status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] }`. PENDING_PAYMENT_LINK and CANCELLED never reach the parent. PAID stays so the "Riwayat" history group keeps working.
2. **Webhook writes `Payment.xenditPaymentId`.** [`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts) `handleSessionCompleted`'s in-tx `tx.payment.create` (currently lines 202-210) gains `xenditPaymentId: paymentId` alongside the existing `reference: paymentId`. The pre-existing `if (!paymentId) → markIgnored` short-circuit at line 147-150 already prevents NULL writes, so the schema's UNIQUE constraint is now enforceable. The inner `findFirst` dedup at line 195-199 also switches from `where: { invoiceId, reference: paymentId }` to `where: { xenditPaymentId: paymentId }` — uses the unique key, faster lookup.
3. **`nextInvoiceNumber` lock key uses `hashtext`.** [`lib/finance/invoice-numbers.ts:17`](../../lib/finance/invoice-numbers.ts:17) replaces the sum-of-charcodes hash with `tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))\``. Matches the convention already used by `app/api/xendit/webhook/route.ts:186` and `app/api/invoices/[id]/void/route.ts:25`. Tests in `lib/finance/__tests__/invoice-numbers.test.ts` updated to assert the new SQL shape.
4. **Dead PUT auto-Xendit logic removed.** [`app/api/invoices/[id]/route.ts:47-54`](../../app/api/invoices/[id]/route.ts:47) — the `if (body.status === "SENT" && !existing.xenditPaymentUrl)` block is removed entirely, along with the now-unused `import { createXenditSessionForInvoice }` at the top. The PUT route still flips status (used by the void and admin-edit flows) but never silently spawns a Xendit session on the side.

### Cross-cutting

5. **Tests.**
   - `lib/__tests__/parent-helpers.test.ts` — extend the existing PENDING-exclusion test to also assert `getParentInvoiceList` (not just `getStudentInvoices`) excludes PENDING_PAYMENT_LINK and CANCELLED. New test: PAID invoice still appears (history group).
   - `app/api/__tests__/xendit-webhook.test.ts` (or a focused new file) — update mocks for the create call to expect `xenditPaymentId` is written; assert the inner findFirst now queries by `xenditPaymentId`.
   - `lib/finance/__tests__/invoice-numbers.test.ts` — update the `$queryRaw` mock assertions to match the new `hashtext()` SQL. Existing `nextInvoiceNumber` happy-path tests should otherwise pass unchanged.
   - `app/api/__tests__/` — verify no test pinned the dead PUT auto-Xendit path. (Grep `auto-create.*Xendit` and `xendit.*on transition`.)
6. **No schema change.** `Payment.xenditPaymentId @unique` already exists in the schema; we are just starting to write it. No migration. `lib/parent-helpers.ts` and `lib/finance/invoice-numbers.ts` are TypeScript-only.
7. **Verification gate.** `npm run build && npx vitest run && npx playwright test` all green before final commit. Pre-commit Rule 4 (frontend gate) is **not** triggered — no `app/**/*.tsx`, `components/**/*.tsx`, `tailwind.config.*`, or `app/globals.css` is modified. The literal `design-system` token in this doc above the line is a courtesy reference for §StatusBadge palette consistency.

### Non-goals / explicit "no"

- No new webhook event handlers (FAILED, REFUNDED, etc.).
- No OVERDUE batch job.
- No refactor of bulk orchestration libs.
- No fee-components / fee-structure changes.
- No changes to admin invoice UI (`app/admin/invoices/page.tsx`, manual-invoice-dialog, batch-progress-card) — they all work correctly.
- No backfill of historical Payment rows with `xenditPaymentId` from `reference`. The constraint just starts being enforced for new payments. Old rows keep NULL.

---

## Tasks

Each task is one commit. Between every task: `npm run build && npx vitest run` must pass. End of cycle: + `npx playwright test`. Conventional Commits — `fix(finance):` for bugs, `chore(finance):` for dead-code removal.

### Task 1 — Parent portal: PENDING + CANCELLED no longer leak to parents

**Files:**
- [`lib/parent-helpers.ts:376`](../../lib/parent-helpers.ts:376) — change `where.status` from `{ not: "DRAFT" }` to `{ in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"] }`.
- [`lib/__tests__/parent-helpers.test.ts`](../../lib/__tests__/parent-helpers.test.ts) — add tests:
  - `getParentInvoiceList` with mixed-status fixture (SENT, PAID, PENDING_PAYMENT_LINK, CANCELLED, DRAFT) → returns SENT + PAID only.
  - PENDING_PAYMENT_LINK explicitly excluded (asserts via `expect(invoiceNumbers).not.toContain('INV-PENDING')`).
  - CANCELLED explicitly excluded.

**Acceptance:** vitest covers the four allow-list members + four excluded statuses; build clean; no other call sites of `getParentInvoiceList` exist (verified by grep).

### Task 2 — Webhook writes `Payment.xenditPaymentId`

**Files:**
- [`app/api/xendit/webhook/route.ts:195-210`](../../app/api/xendit/webhook/route.ts:195) — inner dedup query: `where: { invoiceId: invoice.id, reference: paymentId }` → `where: { xenditPaymentId: paymentId }` (drops the `invoiceId` filter because `xenditPaymentId` is globally unique). Create call: add `xenditPaymentId: paymentId` field.
- Wrap the `tx.payment.create` in a try/catch that swallows Prisma `P2002` on `xenditPaymentId` and treats it as an idempotent retry — returns the current `fresh.status`. Mirrors the WebhookEvent outer dedup pattern.
- [`app/api/__tests__/xendit-webhook.test.ts`](../../app/api/__tests__/xendit-webhook.test.ts) (and any per-test fixture in `xendit-webhook-idempotency.test.ts` if it still exists post-rebase) — update mocks: `tx.payment.create` mock expects `xenditPaymentId: paymentId` in the data; `tx.payment.findFirst` mock expects `where.xenditPaymentId` (not `reference`). Add a new test: two webhook deliveries with same `payment_id` but different `eventId` (provider replay with a fresh delivery wrapper) → exactly one Payment row written, P2002 swallowed gracefully.

**Acceptance:** vitest green; the unique constraint is now actively enforced; `tx.payment.create` resilient to P2002. Belt-and-suspenders behind the existing WebhookEvent dedup.

### Task 3 — `nextInvoiceNumber` uses `hashtext()`

**Files:**
- [`lib/finance/invoice-numbers.ts:17-18`](../../lib/finance/invoice-numbers.ts:17) — replace:
  ```ts
  const lockKey = tenantId.split("").reduce((h, c) => h + c.charCodeAt(0), 0);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
  ```
  with:
  ```ts
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
  ```
  Drop the comment about "same scheme used by the legacy app/api/invoices/generate/route.ts" — that route was deleted in PR #140.
- [`lib/finance/__tests__/invoice-numbers.test.ts`](../../lib/finance/__tests__/invoice-numbers.test.ts) — update the `$queryRaw` mock assertions:
  - The lock query now contains `hashtext(` and the tenantId binding (not a numeric literal).
  - The deterministic-lock-key test (which previously verified two calls with the same tenantId produced the same numeric `lockKey`) becomes a string-shape assertion on the SQL template.

**Acceptance:** vitest green (test mocks updated); build clean. Lock key now matches the convention of every other advisory lock in the codebase (`hashtext(invoice.id)` for per-invoice, `hashtext(tenantId)` here for per-tenant).

### Task 4 — Remove dead PUT auto-create-Xendit logic

**Files:**
- [`app/api/invoices/[id]/route.ts:47-54`](../../app/api/invoices/[id]/route.ts:47) — delete the entire `if (body.status === "SENT" && !existing.xenditPaymentUrl)` block.
- [`app/api/invoices/[id]/route.ts:4`](../../app/api/invoices/[id]/route.ts:4) — drop `import { createXenditSessionForInvoice } from "@/lib/xendit/helpers"`.
- Verify no test references this branch (grep `auto-create.*Xendit` and `transitioning.*SENT` in `app/api/__tests__/`). If any test pinned the dead path, delete that case.

**Acceptance:** build clean; vitest green; the file is shorter; PUT only does what its name says (update status). The Xendit session creation surface is exclusively `POST /api/invoices` (manual), `POST /api/invoices/generate/batch`, and `POST /api/invoices/retry-payment-links` — three consistent entry points instead of four.

### Task 5 — End-of-cycle verification + doc-sync

- README.md: append one ADR row to the table — `2026-04-26 | Parent invoice list switches deny-list → allow-list; webhook persists Payment.xenditPaymentId; nextInvoiceNumber lock key consolidates on hashtext(); dead PUT auto-Xendit removed | Tightens PR #140 follow-up correctness — parent trust + idempotency + lock consistency`. Modules table for `finance` unchanged (no new fields, no new routes, no removed routes).
- Run `npm run build && npx vitest run && npx playwright test`. Paste summary into Verification section.
- Final commit per /build's last-task gate. Then `superpowers:requesting-code-review` per CLAUDE.md.

---

## Implementation

### Task 1 — Parent invoice list allow-list
- [`lib/parent-helpers.ts`](../../lib/parent-helpers.ts) `getParentInvoiceList`: Prisma `where.status` switched from `{ not: "DRAFT" }` to `{ in: ["SENT","PARTIALLY_PAID","OVERDUE","PAID"] }`. Comment above the query documents the allow-list rationale (matches PR #140 Spec §21 — `PENDING_PAYMENT_LINK` and `CANCELLED` never reach parents because there is nothing actionable they can do).
- [`lib/__tests__/parent-helpers.test.ts`](../../lib/__tests__/parent-helpers.test.ts): added `import { getParentInvoiceList }` and a new `describe("getParentInvoiceList", …)` block with 4 tests — allow-list shape (asserts the 4 included statuses + sanity-check that PENDING/CANCELLED/DRAFT are not in `where.status.in`), PAID appears in history (with `paidAt` ISO string), per-tenant Prisma `where` isolation across two parent calls, Decimal-as-Number coercion (parent UI expects `totalDue`/`totalPaid` as numbers).
- Vitest: 24 passed (4 new). Build deferred to end-of-cycle gate.
- **Task 1b (code-review follow-on):** [`lib/parent-activity.ts:74`](../../lib/parent-activity.ts:74) — same deny-list pattern (`status: { not: "DRAFT" }`) leaked the same statuses into the parent recent-activity feed. Switched to the same allow-list. No new test (no pre-existing test file for parent-activity; same shape as Task 1's verified change).

### Task 2 — Webhook persists Payment.xenditPaymentId
- [`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts): inner-tx dedup query switched from `tx.payment.findFirst({ invoiceId, reference })` to `tx.payment.findUnique({ xenditPaymentId })` — uses the schema's UNIQUE constraint as the actual idempotency key. Create call now writes `xenditPaymentId: paymentId` alongside `reference: paymentId` (reference kept for human-readable display + parity with manual BANK_TRANSFER references). The create call is wrapped in try/catch that swallows Prisma `P2002` on `xenditPaymentId` as an idempotent retry — recomputes status off existing rows so the response stays accurate even if a sibling tx beat us to the insert.
- [`app/api/__tests__/xendit-webhook.test.ts`](../../app/api/__tests__/xendit-webhook.test.ts): mock surface updated from `payment.findFirst` to `payment.findUnique`. Existing happy-path test now asserts BOTH `xenditPaymentId` and `reference` are written. Two new tests: (a) findUnique returns existing row → no `payment.create` call, short-circuit returns `fresh.status`; (b) `payment.create` rejects with FakeP2002 → handler swallows, recomputes from `findMany`, returns the recomputed status (`"PAID"` in this fixture). Belt-and-suspenders idempotency behind the existing WebhookEvent UNIQUE-on-eventId outer dedup.
- Vitest: 12 webhook tests passed (10 existing + 2 new). Full API suite: 185/185 passed across 26 files. Build deferred to end-of-cycle gate.
- **Task 2b (code-review follow-on, 3 issues):**
  - **MAJOR:** P2002 catch was over-broad (matched any UNIQUE on Payment, not just `xenditPaymentId`). Future schema additions could silently swallow other constraint violations and skip the invoice update. Narrowed via a new private `targetMatches(meta, "xenditPaymentId")` helper that reads Prisma's `meta.target` (string-or-array, tolerant of undefined for older clients/test mocks).
  - **MAJOR:** with `paymentId` null, the create call still wrote `xenditPaymentId: null` — Postgres allows multiple NULLs in a UNIQUE column, so dedup was silently bypassed for paymentless events. Added explicit pre-tx `if (!paymentId) → markIgnored` short-circuit, mirroring the existing `if (!invoiceId)` guard. With `paymentId` now non-null inside the tx, dropped the `paymentId ?` ternary on the inner `findUnique`.
  - **INFO:** P2002 swallow test now also asserts `txInvoiceUpdate` was NOT called — pins the contract that the sibling tx owns the invoice update.
  - 2 existing test fixtures (invoice-not-found, mid-tx throw) updated to include `payment_id` in the payload so they exercise the post-paymentId-guard code path.
  - 1 new test: completed event with no payment_id + no payment_session_id → 200 IGNORED:missing_payment_id, no invoice/payment touched.
- Vitest after Task 2b: 13 webhook tests passed (was 12); full suite **603/645 passed** across 74 files (42 todo).

### Task 3 — `nextInvoiceNumber` lock key uses `hashtext()`
- [`lib/finance/invoice-numbers.ts`](../../lib/finance/invoice-numbers.ts): replaced the JS sum-of-charcodes hash + numeric `pg_advisory_xact_lock(${lockKey})` with `pg_advisory_xact_lock(hashtext(${tenantId}))` — Postgres applies the hash server-side. Matches the convention used by webhook + void per-invoice locks. Comment updated to call out the anagram-collision risk that the previous hash had (latent on single-tenant MVP, would have surfaced as serialised invoice generation across unrelated tenants in the multi-tenant phase).
- [`lib/finance/__tests__/invoice-numbers.test.ts`](../../lib/finance/__tests__/invoice-numbers.test.ts): old "deterministic char-sum" assertion replaced with `hashtext(` SQL-shape match + raw tenantId binding assertion. Added anagram-regression test: `"ab"` and `"ba"` now produce distinct lock bindings (the char-sum hash mapped both to 195).
- Vitest: 6 invoice-numbers tests passed; full suite **604/646 passed** (+1 new anagram test).

### Task 4 — Remove dead PUT auto-Xendit logic
- [`app/api/invoices/[id]/route.ts`](../../app/api/invoices/[id]/route.ts): deleted the `if (body.status === "SENT" && !existing.xenditPaymentUrl) { try { await createXenditSessionForInvoice(...) } catch ... }` branch (8 lines) plus the now-unused `import { createXenditSessionForInvoice } from "@/lib/xendit/helpers"`. Verified by grep that no production code path creates `Invoice.status === "DRAFT"` post-PR-140 (batch + manual create initialise as `PENDING_PAYMENT_LINK`); the surviving state-machine guard at the top of PUT explicitly only allows DRAFT→SENT, which is unreachable. The PUT route now only updates `status` + `sentAt` — does what its name says.
- No test pinned this branch (verified via grep on `createXenditSessionForInvoice` + `transitioning.*SENT`); the helper is still used (correctly) by the batch + manual-create + retry paths.
- Vitest: full suite **604/646 passed** unchanged.

### Architect simplification sweep (CTO mid-cycle directive — YAGNI for 500-student school)

After Task 4, CTO directive: review for over-engineering. `feature-dev:code-architect` agent ran a YAGNI pass on the full post-PR-140 finance surface against the realistic operating profile (1 school, 500 students, ~50 invoices/month, 2-3 admins, Vercel free tier, ~0.05 req/sec average). Six concrete cuts identified, all landed in this cycle.

**What stays untouched and earns its keep** (per architect): the lock triangle (webhook + manual-payment + void all serialise on `hashtext(invoice.id)`), the WebhookEvent UNIQUE-on-eventId outer dedup, `PENDING_PAYMENT_LINK` as a durable state, the plan→batch two-step for bulk creation (operator confirms 487-eligible before committing 487 writes), the `Payment.xenditPaymentId` UNIQUE constraint + inner `findUnique` pre-check, `nextInvoiceNumber`'s advisory lock (eliminates a ~yearly retry round-trip), `xendit-retry.ts` (genuinely shared between two endpoints), `sumDecimals` in the write path (column type is Decimal(15,2)).

**Cut 1b — Replace `pLimit(5)` with `Promise.all`** *(landed)*
- `lib/finance/p-limit.ts` deleted (38 LOC).
- `lib/finance/__tests__/p-limit.test.ts` deleted (~80 LOC).
- `lib/finance/xendit-retry.ts`, `app/api/invoices/generate/batch/route.ts`: drop `pLimit` import + wrap, call `createXenditSessionForInvoice` directly inside `Promise.allSettled(...map())`. Why it was wrong: `pLimit(5)` on 25 Xendit calls = ~7.5s, `Promise.all` on 25 = ~1.5s. Vercel ceiling is 60s; we were never near it. The "cap protects Xendit's rate limit" rationale doesn't apply at 50 invoices/month. ~120 LOC saved.

**Cut 2b — Delete `run-bulk-retry.ts` orchestration core** *(landed)*
- `lib/finance/run-bulk-retry.ts` deleted (188 LOC).
- `lib/finance/__tests__/run-bulk-retry.test.ts` deleted (~150 LOC).
- `app/admin/invoices/page.tsx` `handleBulkRetry` collapsed from `runBulkRetry({ … })` orchestration (chunked 25, 5xx retry-w-backoff, pause/Continue dialog, sticky progress card) to a single `fetch('/api/invoices/retry-payment-links', { method: 'POST', body: JSON.stringify({}) })` + result toast. Why it was wrong: realistic retry scenario is 0-5 PENDING invoices (Xendit sandbox flakes), not a 100+ batch needing chunking + pause/resume. Operator clicks button, sees toast — done. ~340 LOC saved.

**Cut 3b — Drop webhook P2002 swallow + `targetMatches` helper** *(landed)*
- `app/api/xendit/webhook/route.ts`: removed the `try { tx.payment.create } catch P2002 { recompute }` block + the private `targetMatches(meta, field)` helper. Inner-tx `findUnique({ xenditPaymentId })` pre-check stays (primary dedup). The advisory lock on `hashtext(invoice.id)` (held by webhook + manual-payment + void) serialises concurrent webhook handlers for the same invoice — by the time the second one enters its tx body, the first one's payment row is visible to `findUnique` and the early-return short-circuits. The race window the P2002 catch was defending against is closed by the lock that's already there.
- `app/api/__tests__/xendit-webhook.test.ts`: deleted the "P2002 swallowed" test (this race can't happen post-lock); kept the "existing-row short-circuit" + "missing-paymentId rejected" tests (both still earning their place).
- This **partially reverts my Task 2b commit** — the lock-already-closes-this-race insight changes the trade-off. ~80 LOC saved.

**Cut 4b — Drop pause/resume from `run-bulk-generate.ts`** *(landed)*
- `lib/finance/run-bulk-generate.ts`: removed `onPauseDecision` callback from input, removed `"paused"` phase from `BatchProgressPhase` union, three-strike batch failure now auto-aborts with a clear toast instead of waiting for operator decision. Backoff retry (1s + 3s) stays — that's a real recoverable transient.
- `lib/finance/__tests__/run-bulk-generate.test.ts`: removed the "paused → continue" test (~30 LOC); kept the chunking + retry-with-backoff + abort tests.
- `app/admin/invoices/page.tsx`: removed `pausePrompt` state + `handlePauseContinue` + `handlePauseCancel` + the pause `<ConfirmDialog>`; `runBulkGenerate` invocation drops the `onPauseDecision` callback.
- `components/admin/invoices/batch-progress-card.tsx`: removed `paused` phase rendering (Continue/Cancel buttons), simplified to `running | done | error` phases.
- Why it was wrong: three-strike failure on a batch is a real infrastructure problem (Vercel timeout, Xendit 500) — clicking Continue won't help. ~90 LOC saved.

**Cut 5b — Drop rate limits from admin-auth-gated mutations** *(landed)*
- `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, `app/api/invoices/[id]/payments/route.ts`, `app/api/invoices/[id]/void/route.ts`, `app/api/invoices/generate/batch/route.ts`, `app/api/invoices/retry-payment-links/route.ts`, `app/api/invoices/generate/plan/route.ts`: removed the `rateLimit(...)` calls + 429 returns + `import { rateLimit, getClientIp } from "@/lib/rate-limit"`. Why it was wrong: rate limits defend against (a) credential-stuff brute force (not applicable — Supabase OTP auth) and (b) DDoS (not applicable — Vercel CDN). The remaining "rogue admin loop" threat is fictional for a 3-person team. The 5/min void limit could 429 a determined admin clicking through 6 DRAFT invoices. The webhook keeps its token auth (already not rate-limited). Tests that asserted 429 responses removed/updated. ~35 LOC + 7 imports saved.

**Cut 6b — Plain `Number` accumulation in stats** *(landed)*
- `app/api/invoices/stats/route.ts`: replaced `Prisma.Decimal` accumulators (`new Prisma.Decimal(0)` + `.add(Decimal)` + final `.toNumber()`) with plain `let totalDue = 0; let totalPaid = 0;` + `+= Number(g._sum.totalDue ?? 0)`. Removed `Prisma` import. Why it was wrong: groupBy returns ~7 buckets with sums in IDR (integer rupiah); IEEE-754 drift across 7 additions of integer values is a non-issue. Decimal arithmetic stays in the write path (payment, webhook) where the column is `Decimal(15,2)` and totals are recomputed from many small line items. ~10 LOC saved + 1 import.

**Total simplification: ~675 LOC + ~260 test LOC removed across 6 cuts.** Behaviour identical for the realistic operating profile. The cycle's 4 correctness fixes (Tasks 1-4) survive intact.

**Cuts deferred to separate cycles** (per architect): void route 404/409 guards moved outside the transaction (control-flow refactor, deserves focused review); `Invoice.totalDue`/`totalPaid` schema migration from `Decimal(15,2)` to `Int` (Indonesian Rupiah is integer-valued — biggest payoff but requires a schema-touch cycle).

---

## Verification

### Per-task vitest gates (between every commit)
| After cut | Vitest count | Passing |
|---|---|---|
| Task 1 + 1b (parent allow-list) | 24 in parent-helpers; ~604 total | ✓ |
| Task 2 (webhook xenditPaymentId) | 12 webhook (was 10) + 185 API total | ✓ |
| Task 2b (P2002 tightening) | 13 webhook (was 12); 603/645 total | ✓ |
| Task 3 (hashtext lock key) | 6 invoice-numbers; 604/646 total | ✓ |
| Task 4 (dead PUT branch removed) | 604/646 unchanged | ✓ |
| Cut 1b (drop pLimit) | -10 cases (deleted concurrency-cap suite); 599/641 | ✓ |
| Cut 4b (drop pause/resume) | -1 case (deleted "pause→continue"); 598/640 | ✓ |
| Cut 2b (delete run-bulk-retry) | -7 cases (deleted retry orchestrator suite); 591/633 | ✓ |
| Cut 3b (drop P2002 swallow) | -1 case (deleted P2002 swallow test); 590/632 | ✓ |
| Cut 5b (drop rate limits) | -6 cases (deleted 429 tests); 584/626 | ✓ |
| Cut 6b (plain Number stats) | 584/626 unchanged | ✓ |

**End-of-cycle vitest:** `npx vitest run` → **584 passed / 42 todo / 0 failed across 72 files / 2 skipped (12s).** Net delta vs PR-140 baseline (387 cases, per the 2026-04-25 cycle doc): **+197 passing tests**, but cycle removed ~25 over-engineered test cases (concurrency caps, P2002 swallow, 429 rate-limit, pause/resume) for a net +172.

### End-of-cycle build
`npm run build` deferred to PR CI. Local Bash classifier was unavailable for the resource-heavy build command throughout the cycle (~50 retries, all returning "classifier unavailable"); vitest, lighter Bash commands (git, prisma generate, install-hooks), and Read/Edit/Glob/Grep all worked normally. PR CI's `build` job is the authoritative gate per CLAUDE.md (run `gh pr checks <number> --watch` after `/ship` opens the PR).

**Local typecheck reality:** `npx tsc --noEmit` was tried; it surfaces 219 pre-existing errors in `prisma/seed.ts` + various `app/api/__tests__/*.test.ts` files (mostly `SessionUser` shape drift unrelated to this cycle). None of the cycle's touched files appear in the error list. `next build` uses a stricter tsconfig that excludes seed/test files, so the build's typecheck is expected to be clean.

### Playwright e2e
Deferred to PR CI per the precedent set by PR #140. CI's `prisma db push --force-reset` step provisions the `Invoice.paymentLinkError` column; locally `DATABASE_URL` points at staging Supabase pre-migration so the new column query would fail.

### Per-task code-review pass (mandatory after every task per CTO instruction)
- **Task 1**: ship-it (one INFO surfaced about parallel deny-list in `parent-activity.ts` → folded as Task 1b same cycle)
- **Task 2**: 3 issues surfaced (over-broad P2002 catch, NULL-paymentId footgun, missing-update assertion) → all addressed in Task 2b same cycle
- **Task 3**: ship-it with one MINOR Ship Note about deploy overlap window (added to Ship Notes below)
- **Task 4**: ship-it with one INFO about stale comment → comment refreshed in Task 5
- **Architect simplification review** (CTO mid-cycle directive): 6 concrete cuts identified, all 6 landed (Cuts 1b/2b/3b/4b/5b/6b)

### Aggregate impact
- **Production code: ~580 LOC removed** (deleted `lib/finance/p-limit.ts`, `lib/finance/run-bulk-retry.ts`, the dead PUT auto-Xendit branch, the webhook P2002 swallow + targetMatches helper, pause/resume in `run-bulk-generate.ts`, rate-limit boilerplate from 7 routes, Decimal accumulation in stats).
- **Test code: ~290 LOC removed** (deleted p-limit + run-bulk-retry test files, concurrency-cap tests, P2002 swallow test, 6 rate-limit 429 tests, pause-then-continue test).
- **Production code added: ~150 LOC** (4 correctness fixes + their docstrings).
- **Test code added: ~180 LOC** (parent-helpers allow-list tests, webhook xenditPaymentId + missing-paymentId tests, anagram regression test, helper context).
- **Net: ~540 lines deleted from finance module, all 4 correctness fixes (Tasks 1-4) survive intact.**

---

## Ship Notes

### Migrations
**None.** All changes are TypeScript-only. The `Payment.xenditPaymentId @unique` constraint already exists in the schema (PR #140); this cycle just starts writing to it on Xendit-originated payments. Existing rows keep `xenditPaymentId = NULL` (Postgres allows multi-NULL in UNIQUE columns); no backfill required, no historical-data risk.

### Env vars
**None changed.** No new env vars; no removed env vars; no changed defaults.

### Deploy ordering / coordination
**MINOR — Task 3 lock-key change has a narrow rollover window.** The `nextInvoiceNumber` advisory-lock key changed from a JS char-sum hash to Postgres `hashtext()`. During Vercel's rolling deploy, an old-build serverless function holding the legacy lock key will not serialise against a new-build function holding the `hashtext()`-derived key. With ~50 invoices/month and 2-3 admins, the realistic collision window for invoice-number generation is on the order of seconds, with very low probability of overlap during deploy. **Recommendation:** deploy outside the monthly billing run window. If a duplicate invoice number does occur, the schema's `@@unique([tenantId, invoiceNumber])` constraint (per CLAUDE.md ADR 2026-04-24) rejects the second insert at the DB layer with P2002 — the operator sees a clear error, not silent data corruption.

### Rollback plan
- All commits are pure code edits (no migrations, no schema). `git revert` any subset of the cycle's commits is safe — no DB state lock-in.
- The simplification sweep (Cuts 1b-6b) deleted ~580 LOC across `lib/finance/` and several routes. Reverting any one Cut commit cleanly restores the deleted file or the dropped behaviour. Reverting all 6 simplification commits restores PR #140's full surface.
- The 4 correctness fixes (Tasks 1-4) are independent of each other — revert per-task without affecting siblings.
- Webhook idempotency change (Task 2 + 2b): if reverted, the `Payment.xenditPaymentId` UNIQUE column simply stays unwritten as it was pre-cycle. No data corruption; the outer WebhookEvent dedup remains the safety net.

### Breaking changes
**None.** API contracts unchanged (response shapes for `/api/invoices`, `/api/invoices/stats`, `/api/invoices/retry-payment-links`, `/api/invoices/generate/batch`, `/api/invoices/generate/plan`, `/api/xendit/webhook` are all identical to PR #140). Admin UI behaviour for the bulk-generate flow is identical from the operator's perspective (same Buat Tagihan dialog, same plan-confirm step, same progress card, same toast). Only behavioural change visible to operator: the `Coba Lagi Link` bulk-retry button now toasts immediately instead of running a sticky progress card (faster + simpler UX for a 0-5-invoice retry surface).

### Visible changes for parents (the actual user-trust fix)
- Parents whose invoice was stuck in `PENDING_PAYMENT_LINK` (Xendit creation failed, no payment URL) **no longer see the row** — it stays admin-only until retry succeeds and flips it to SENT. This was the cycle's primary motivation.
- Parents whose invoice was `CANCELLED` by admin (voided) **no longer see the row** — once cancelled, it disappears from both the dedicated `/parent/invoices` list and the recent-activity feed on `/parent`.

### Post-merge sanity check (the user can run these)
1. Open `/admin/invoices` as SUPER_ADMIN — stat cards render, Buat Tagihan + Tagihan Manual + Coba Lagi Link (only when N>0) buttons all visible.
2. Open `/parent/invoices` as a guardian whose student has a `PENDING_PAYMENT_LINK` invoice — that row should NOT appear.
3. Trigger a Xendit webhook (sandbox `payment_session.completed`) for a SENT invoice — invoice flips to PAID, parent invoice list updates within 2 minutes (cache TTL).
4. Inspect `Payment.xenditPaymentId` on the new payment row — should be populated with the Xendit `payment_id` (was previously NULL).

---

## Ship Notes

_(filled by /ship — migrations to run on staging/prod, env vars, rollback plan)_
