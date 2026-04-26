# Finance Robustness — A (Manual Create) + B (Bulk Pain) + C (Webhook Reliability)

> Cycle owner: cto · Started 2026-04-26 · Branch: `feat/finance-robustness-a-b-c`

## Context

Three production pain points converge this cycle. They share enough surface area (invoice numbering, batch orchestration, webhook-driven status transitions) to warrant a single durable fix instead of three patches.

### A — Manual single-invoice creation broken in trial

Live preview deployment `dpl_HHZ5UuoHLfv8oKhN9JPoYvWsqqKV` (sha `c4c86c0`, post-PR #142) returned `500 Error [PrismaClientKnownReq...]` at `2026-04-26T08:55:47Z` from `POST /api/invoices` during admin user trial. The end-to-end manual-create path (UI + API + Xendit) was added in PR #140, but a Prisma-known-request-error fires inside the `prisma.$transaction` at [app/api/invoices/route.ts:138-165](../../app/api/invoices/route.ts).

Most likely root cause: **P2002 race on `@@unique([tenantId, invoiceNumber])`**. The advisory lock acquired in [`nextInvoiceNumber`](../../lib/finance/invoice-numbers.ts) (`pg_advisory_xact_lock(hashtext(tenantId))`) lives inside an interactive transaction whose Prisma client may issue the lock query and the downstream `invoice.create` on different pool connections — defeating the lock's serialization guarantee. Concurrent invocations (manual + batch) can read the same `last invoiceNumber` and both produce e.g. `INV-2026-0042`.

A secondary year-boundary bug exists: `nextInvoiceNumber` calls `new Date().getFullYear()` which is UTC on Vercel. Between 00:00–07:00 WIB (UTC+7), the allocator uses the previous UTC year, producing `INV-2025-NNNN` invoices on Jan 1–7 mornings WIB.

Secondary A complaints (from operator feedback): the student picker in `ManualInvoiceDialog` is unusable — currently fetches `/api/students?status=ACTIVE&pageSize=500` once at dialog open and filters client-side, no typeahead, silently truncates above 500 students. Plus `periodLabel` is unbounded (no `maxLength`) and duplicate `feeComponentId` rows in the `lines[]` payload produce duplicate `InvoiceLine` rows on the same invoice (the route's server-side `Set` dedup silently discards them rather than rejecting).

### B — Bulk-send polish gaps

PR #140 already fixed the headline "current-page-only" bug with the plan→batch→orchestrator flow. Three residuals remain:

- [`retryPaymentLinks`](../../lib/finance/xendit-retry.ts) hard-caps at `take: 25` with no `orderBy` and no chunking loop. If 60 invoices are stuck in `PENDING_PAYMENT_LINK`, the "Coba Lagi Link (60)" button silently retries only 25 in undefined order. Admin sees the count drop to 35 and assumes a transient failure; in reality 35 will never auto-recover.
- [`POST /api/invoices/generate/batch`](../../app/api/invoices/generate/batch/route.ts) and [`retryPaymentLinks`](../../lib/finance/xendit-retry.ts) both fan out Xendit calls via `Promise.allSettled` with **no concurrency cap**. A 10s Xendit latency spike or a per-merchant rate-limit serialize-on-server can push past Vercel's 60s function timeout.
- The 3-strike orchestrator retry on a Vercel-timed-out batch can re-fire the same 25 Xendit calls up to 3× (75 calls for 25 invoices) before aborting. Wasted Xendit quota + duplicate session URLs.

### C — Webhook reliability + payload visibility gaps

Current handler at [app/api/xendit/webhook/route.ts](../../app/api/xendit/webhook/route.ts) is solid on signature (`timingSafeEqual` w/ length pre-check), idempotency (two layers — `WebhookEvent.eventId @unique` + `Payment.xenditPaymentId @unique`), and per-invoice advisory lock. Five gaps:

- **xenditSessionId fallback regressed.** PR #136 added a fallback lookup `prisma.invoice.findFirst({ xenditSessionId: payload.payment_session_id ?? payload.id })` for the case where Xendit's `reference_id` is missing/mismatched (UAT reseed regenerates invoice UUIDs while existing Xendit sessions retain the original reference). The current HEAD handler resolves only via `data.reference_id`; the fallback was lost in a later refactor. UAT reseed environments will silently drop paid-invoice updates again.
- **No amount-mismatch guard.** `paymentAmount = data.amount ?? Number(invoice.totalDue)` — a `payment_session.completed` event with `amount: 0` or missing `amount` silently falls back to `invoice.totalDue`, masking partial captures + amount-tampering attacks. Overpayments are accepted without flag.
- **`payment_session.expired` is destructive.** Flips invoice → `CANCELLED`, nulls `xenditSessionId` + `xenditPaymentUrl`. `CANCELLED` is a terminal status that hides the invoice from parent + blocks further admin retry. The correct soft state is `PENDING_PAYMENT_LINK` (clears xendit fields, retains the row, admin can re-create the link).
- **Transient-error path DROPS the payload.** Lines 122-127 `DELETE` the `WebhookEvent` row on any throw inside business logic — so Xendit retries can re-INSERT cleanly. But this defeats audit. The user-stated principle is **always store the payload first; process second; never lose the receipt.** The ERROR status on the row is the durable record; let Xendit retry on a 5xx, idempotency-deduplicate on `eventId`.
- **Payload not surfaced to admin in the natural place.** Operators investigating "did this invoice get paid?" want to see the Xendit confirmation timeline — paidAt, payment method (BANK_TRANSFER / OVO / GoPay / etc), amount captured, raw event status — directly on the invoice detail page. Currently they must `psql` into Postgres or scan logs. No admin UI surface.

Bonus baseline gap: no `SENT → OVERDUE` promotion job. `OVERDUE` is cosmetic-only at HEAD; invoices past `dueDate` remain `SENT` indefinitely, breaking the parent dunning flow + the admin overdue stat card.

User constraint: **no Xendit/Supabase env-var changes** — keys, webhook token, Supabase config already correct in Vercel and stay untouched. One new operational env var `CRON_SECRET` is required for the cron auth (Vercel injects this header into cron deliveries; absence leaves the endpoint publicly callable). One-time `openssl rand -hex 32` paste in Vercel project settings — single-purpose, no coupling to Xendit/Supabase. Surfaced as a Ship Notes pre-merge task.

User principle: **simple, not clever.** Single big cycle, done carefully. Avoid abstractions beyond what each fix demands.

UX principle for this cycle (per `.claude/standards/voice.md` admin rules + `portal.md` Empty State Contract): every conditional list render needs an explicit empty-state branch (or explicit "hide entirely" decision); every async fetch needs idle/loading/empty/error states; every user-facing error string passes through a humanized label catalog. No raw engineer codes (`MISSING_AMOUNT`, `INVOICE_NOT_FOUND:ref=...`) in the UI. **Note**: there is no admin persona file in `.claude/personas/` — only `pak-budi.md` (parent). Admin voice rules come from `voice.md` directly. The "Pak Budi" name in this cycle doc refers to the operator persona used by `voice.md`, not the parent persona.

Recent finance cycles inform this work:
- 2026-04-25 [tagihan-fixes-async-bulk-manual-create](2026-04-25-tagihan-fixes-async-bulk-manual-create.md) (PR #140) — manual create + batch + retry endpoints landed
- 2026-04-25 [xendit-webhook-and-reseed-richness](2026-04-25-xendit-webhook-and-reseed-richness.md) (PR #138) — `WebhookEvent` table + idempotency layer
- 2026-04-25 [parent-portal-design-fixes](2026-04-25-parent-portal-design-fixes.md) (PR #139) — kwitansi PDF
- 2026-04-25 [finance-followup-fixes](2026-04-25-finance-followup-fixes.md) (PR #141) — parent allow-list + idempotency + YAGNI sweep

## Spec

### Acceptance criteria

**A — Manual create (correctness + UX)**

- A1. `POST /api/invoices` returns 201 (or 4xx with human-readable error) on every legitimate input. P2002 from invoice-number race auto-retries up to 3× with exponential jitter (50/150/450ms ± 50ms) inside the route, transparent to the caller. After 3 failures returns `409 Conflict` with `{ error: "Konflik nomor tagihan, silakan coba lagi" }`.
- A2. `nextInvoiceNumber` allocator hardened. Replace advisory-lock + LENGTH-ordered `SELECT MAX` + regex parsing with a single atomic `INSERT … ON CONFLICT … RETURNING` against a new `InvoiceNumberSequence(tenantId, year, lastNumber)` table. Year computed in **Asia/Jakarta** (`Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })`), not `getFullYear()`. The allocator MUST be invoked via `tx.$queryRaw` — same transaction as the `invoice.create` — so an outer rollback returns the sequence number too. Standalone (non-transactional) calls are not introduced.
- A3. `createManualInvoiceSchema` adds `periodLabel.max(64)` and a `.refine()` that rejects duplicate `feeComponentId` in `lines[]` with a 400 + Indonesian message ("Komponen biaya tidak boleh duplikat"). Server-side `Set` dedup at `route.ts:117` is removed — schema is the single source of truth.
- A4. `ManualInvoiceDialog` student picker replaced with shadcn `<Command>` combobox backed by `/api/students?search=<q>&status=ACTIVE&pageSize=20`. Debounce 250ms. No client-side filter, no `pageSize=500` initial fetch. Combobox states (cite `.claude/standards/design-system.html` §Forms when implementing):
  - **Idle (no query):** "Ketik nama untuk mencari siswa." (T2 self-correction: `/api/students?search=` matches `name`+`nickname` only, not `nis` — copy aligned with reality. Adding NIS search to the API is a separate followup.)
  - **Loading (debounce in flight + fetch pending):** `<Loader2 className="animate-spin" />` + "Mencari..."
  - **Empty (200 + zero rows):** `Tidak ada siswa cocok dengan "{query}". Periksa ejaan.`
  - **Error (network/500):** "Gagal memuat siswa. Coba lagi." + retry button.
  - **Overflow (`pagination.total > 20`):** footer row "Menampilkan 20 dari {total} hasil. Persempit pencarian."
  - **Selected:** student displays inside the trigger button as `${name} · ${nis}`. An `X` icon at the right of the trigger clears the selection and reopens the popover with focus on the search input.
- A5. **Line-items UX unchanged** from current implementation: per-row `<Select>` for fee component + raw `<Input type="number">` for amount + Total row at bottom (Total is the source of truth for currency-formatted display). No per-row Rupiah formatting upgrade in this cycle. This is an explicit non-goal — implementer must NOT refactor line-item entry.

**B — Bulk-send durability**

- B1. Bulk retry orchestrator. New `lib/finance/run-bulk-retry.ts` mirroring `run-bulk-generate.ts`:
  - Pre-fetches all `PENDING_PAYMENT_LINK` invoice IDs once via a thin endpoint `GET /api/invoices/pending-payment-link?pageSize=1000` (SUPER_ADMIN/SCHOOL_ADMIN, ordered `createdAt asc`).
  - At >1000 stuck invoices, the orchestrator opens an `<AlertDialog>` (NOT a toast — toasts are missable):
    - Title: "Antrian retry penuh"
    - Body: "1000 tagihan akan diproses sekarang. Sisa {total - 1000} tagihan: jalankan ulang 'Coba Lagi Link' setelah batch ini selesai."
    - Single confirm button: "Mulai Proses"
  - Chunks the IDs client-side (`BATCH_SIZE = 25`).
  - POSTs each chunk as `{ invoiceIds: string[] }` to existing `/api/invoices/retry-payment-links`. Three-strike retry per chunk identical to `runBulkGenerate`.
  - Reports progress via the shared `BatchProgressCard` extended with a `mode: "generate" | "retry"` prop:
    - generate header: "Membuat tagihan…" · done copy: "Selesai: {created} dibuat, {failed} gagal Xendit"
    - retry header: "Memperbaiki link pembayaran…" · done copy: `60 link berhasil diperbaiki` (or partial: `47 link berhasil, 13 masih gagal — buka invoice untuk detail`)
  - **Cancel button** on the card during `phase === "running"`: `<Button variant="ghost" size="sm">Batalkan</Button>`. Existing orchestrator already supports the `phase: "aborted"` path (used at `app/admin/invoices/page.tsx:422`); wire the button to the same abort signal.
  - **Mid-run navigation guard:** when orchestrator phase is `running`, register a `beforeunload` listener with message "Pembuatan tagihan sedang berjalan. Yakin keluar?" — Pak Budi who fat-fingers the sidebar gets a confirm dialog. Cleared on `phase: "done" | "aborted"`. Browser-based orchestrator still dies on hard navigation, but partial state is recoverable next session via the retry button.
  - Result: with 60 stuck invoices, one click drains all 60 across 3 chunks.
- B2. `retry-payment-links/route.ts` keeps the 25-cap per-call (defensive — never iterate beyond 25 inside one Vercel function) but the orchestrator handles total volume. Add `orderBy: { createdAt: "asc" }` to `xendit-retry.ts` so chunking sequence is deterministic across calls.
- B3. Cap Xendit fan-out at 5 concurrent calls in BOTH `app/api/invoices/generate/batch/route.ts:218` AND `lib/finance/xendit-retry.ts:65`. **`p-limit` is NOT in `package.json`.** Per the "simple, not clever" principle, use a 10-line inline semaphore at `lib/finance/concurrency-limit.ts` instead of adding a new dep:
  ```ts
  export function limit<T>(maxConcurrency: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    return async function run(fn: () => Promise<T>): Promise<T> {
      if (active >= maxConcurrency) await new Promise<void>(r => queue.push(r));
      active++;
      try { return await fn(); } finally { active--; queue.shift()?.(); }
    };
  }
  ```
  Both call sites import this helper. Caps Xendit pressure per function invocation.
- B4. Per-student error rows in batch + retry response. Shape:
  ```ts
  results: Array<{ invoiceId: string; studentId: string; studentName: string; status: "ok" | "xendit_failed" | "skipped"; error?: string }>
  ```
  `BatchProgressCard` renders a collapsible `<details>` "Lihat detail (N gagal)" listing failed students name + humanized error. **Read-only list (v1)** — admin retries via the header "Coba Lagi Link (N)" button after the orchestrator completes. No inline per-row retry button this cycle.

**C — Webhook robustness + payload visibility**

The architectural shift: **webhook handler is two-phase, durable.**

- C1. **Phase 1 — Receive + persist (always).** First action is `prisma.webhookEvent.create({ data: { eventId, eventType, payload, status: "RECEIVED", invoiceId: null } })`. If `eventId` already exists (P2002 from `@unique`), return 200 immediately (Xendit retry of a delivered event). Signature verification still runs BEFORE the insert (a forged event must not even land in the table). After insert, the receipt is durable — no code path may DELETE it. Existing DELETE-on-transient-error logic at lines 122-127 is removed. **The P2002 short-circuit on Phase 1 guarantees at most one Phase 2 dispatch per `eventId`** — the per-invoice advisory lock in Phase 2 then serializes concurrency at the invoice level.
- C2. **Phase 2 — Process + record outcome.** Dispatcher runs the type-specific handler (`handleSessionCompleted`, `handleSessionExpired`, others are noop). Outcomes:
  - Success → `update({ status: "PROCESSED", invoiceId, processedAt })` + 200.
  - Any error after Phase 1 committed → `update({ status: "ERROR", errorMessage })` + **always return 200** (admin-driven recovery via the activity panel; Xendit retry would be silently no-op'd anyway by the Phase 1 idempotency check on the duplicate `eventId`).
  - Phase 1 itself throws (DB unreachable before any row is committed) → 500. Xendit retries; on next delivery Phase 1 succeeds and Phase 2 runs cleanly.
  - Status enum extended: `RECEIVED | PROCESSED | ERROR | IGNORED`. Schema comment at `prisma/schema.prisma:912` updated to match (drop "DELETE on transient" wording, replace with "ERROR rows retained for admin audit; provider retries deduplicate via eventId @unique").
- C3. Restore `xenditSessionId` fallback in `handleSessionCompleted` + `handleSessionExpired`. On `findUnique({ id: reference_id })` miss, fall back to `findFirst({ where: { xenditSessionId: payload.payment_session_id ?? payload.id, tenantId } })`. Log line on fallback hit: `{ level: "warn", reason: "ref_id_miss_session_fallback", refId, sessionId, paymentId, invoiceId }`. Resurrect the two unit tests originally added in PR #136.

  **Worked-example trace** (real production-shape payload supplied during /spec):
  ```jsonc
  {
    "event": "payment_session.completed",
    "created": "2026-04-26T09:23:19.140Z",
    "data": {
      "status": "COMPLETED",
      "amount": 800000,
      "currency": "IDR",
      "reference_id": "staging-tagihan-cmodtjyva1g7n7bx7lzpw5oht",  // ← legacy prefix, NOT a bare invoice ID
      "payment_session_id": "ps-69ec4131991c6b6d61d2e989",
      "payment_id": "py-baa5f75a-73b0-4d57-9476-58f1bb160168",
      "updated": "2026-04-26T09:23:18.882Z",
      "items": [/* catalog snapshot, not payment method */]
    }
  }
  ```
  Resolution path under T5 (two-phase):
  1. Phase 1 → `webhookEvent.create({ eventId: <hash>, eventType: "payment_session.completed", payload, status: "RECEIVED" })`. Commits.
  2. Phase 2 → dispatcher finds `event === "payment_session.completed"` → `handleSessionCompleted(payload)`.
  3. Primary lookup: `prisma.invoice.findUnique({ where: { id: "staging-tagihan-cmodtjyva1g7n7bx7lzpw5oht" } })` → returns `null` (legacy prefix, not a CUID match). Logs `{ reason: "ref_id_miss" }`.
  4. Fallback: `prisma.invoice.findFirst({ where: { xenditSessionId: "ps-69ec4131991c6b6d61d2e989", tenantId } })` → resolves `invoice.id = "cmodtjyva1g7n7bx7lzpw5oht"`. Logs `{ reason: "ref_id_miss_session_fallback", invoiceId }`.
  5. `pg_advisory_xact_lock(hashtext(invoice.id))` acquired.
  6. Amount guard: `data.amount = 800000` → not null/zero → passes. If `800000 === remaining` exactly → no overpayment flag.
  7. Idempotency: `payment.findUnique({ where: { xenditPaymentId: "py-baa5f75a-..." } })` → if exists, skip; else create.
  8. `payment.create` with `xenditPaymentId`, `amount: 800000`, `method: "XENDIT"`, `paidAt: data.updated ?? data.created`.
  9. Recompute `totalPaid` from sum-of-payments → if `totalPaid >= totalDue` → status `PAID` + `paidAt = now()`; else `PARTIALLY_PAID`.
  10. `webhookEvent.update({ status: "PROCESSED", invoiceId, processedAt: now() })`.
  11. Return 200.

  Failure modes covered:
  - If step 4 also misses (no invoice has that `xenditSessionId`) → mark event `ERROR` with `errorMessage: "INVOICE_NOT_FOUND:ref=<refId>;session=<sessionId>"` + 200. Visible in admin "Aktivitas Xendit" panel for triage (the panel queries by invoiceId so an unresolved event with `invoiceId: null` would not appear there — fine, since there is no invoice to surface it on; admins find it via the cron audit trail or Vercel logs).
  - If `data.amount` missing → `errorMessage: "MISSING_AMOUNT"` (per C4) + 200, no payment row.
  - If `data.status !== "COMPLETED"` (e.g. PENDING delivery from Xendit) → mark event `IGNORED:status_not_completed` + 200.
  - If invoice already `PAID` → mark event `IGNORED:already_paid` + 200 (defensive — should be deduped by `xenditPaymentId @unique` first, but belt-and-suspenders).
- C4. Amount-mismatch guard:
  - `data.amount == null || data.amount === 0` → mark event `ERROR` with `errorMessage = "MISSING_AMOUNT"`, no payment row written, return 200.
  - `data.amount > remaining + 1` IDR (rounding tolerance) → still credit, but mark event `ERROR` with `errorMessage = "OVERPAYMENT_FLAGGED"` so the invoice-detail panel surfaces it. Status transition still happens.
- C5. `payment_session.expired` → revert to `PENDING_PAYMENT_LINK` (not `CANCELLED`). Clear `xenditSessionId` + `xenditPaymentUrl`. Status guard: only revert if current status is `SENT` or `PENDING_PAYMENT_LINK`. Already-paid invoices ignore the expired event (event marked `IGNORED:already_paid`). Already-cancelled invoices ignore likewise. **Parent portal note:** `getStudentInvoices`/`getParentInvoiceList` allow-lists already exclude `PENDING_PAYMENT_LINK` ([lib/parent-helpers.ts:134](../../lib/parent-helpers.ts), [:372](../../lib/parent-helpers.ts)) — reverted invoices vanish from parent UI as before.
- C6. **"Aktivitas Xendit" panel on invoice detail page.** Replaces the planned `/admin/webhooks` page entirely (simpler, contextual). The detail page is `"use client"` — panel fetches its own data via a new endpoint `GET /api/invoices/[id]/webhook-events` (admin-only, ordered `createdAt desc`, returns events with payload already redacted server-side AND a humanized `errorLabel` field). Below the existing payment-history card.
  - **Empty-state policy:** if `events.length === 0`, the card does NOT render at all. (The 95%+ of invoices with no webhook activity do not need a "no events yet" placeholder — silent absence is the cleaner signal.)
  - **Row visual hierarchy** — two-line layout per event:
    - Line 1 (dominant): `paidAt` humanized (e.g. "26 Apr 2026 · 16:23") on the left + `amount` font-currency right-aligned (e.g. "Rp 800.000")
    - Line 2 (metadata, `text-xs text-muted-foreground`): event type badge · status pill · method-or-error muted text
  - **Status pill colors:** PROCESSED → green, ERROR → red, IGNORED → muted (cite design-system §Status badges).
  - **Method display:** when `paymentMethod === null` (e.g. `payment_session.completed` for Payment Link mode), show `Metode: —` with a `<Tooltip>` carrying the long-form rationale ("Metode tidak tercatat di event payment_session.completed; hanya muncul di event payment.succeeded yang belum kami subscribe.").
  - **errorLabel display:** when status is ERROR or IGNORED, show humanized `errorLabel` as primary muted text on line 2 (replacing method). Raw `errorMessage` only visible inside expanded payload.
  - **"Lihat payload" expand:** renders redacted JSON in a `<pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">` block. Server-side redactor strips `payload.customer.*` + `payload.billing_information.*` before sending.
  - GUARDIAN-role users do not see this panel (existing detail page is admin-only). No SUPER_ADMIN gate needed — finance audit is a SCHOOL_ADMIN responsibility per existing role mapping.
- C7. Vercel Cron `vercel.json` entry — `0 1 * * *` (01:00 UTC = 08:00 WIB, just before school day starts) → `POST /api/cron/finance-maintenance`. Handler:
  - Auth: header `Authorization: Bearer ${process.env.CRON_SECRET}`. **`CRON_SECRET` MUST be set in Vercel project settings** before merge — Vercel only injects the bearer header when this env var is set; absence leaves the endpoint publicly callable. One-time provisioning: `openssl rand -hex 32` → paste into Vercel dashboard → `CRON_SECRET`. Operational secret only (no Xendit/Supabase coupling, no client exposure). Defense-in-depth: `req.headers.get('user-agent')?.startsWith('vercel-cron/')` rejects forged calls but is not the primary auth.
  - Action 1: `DELETE FROM "WebhookEvent" WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  - Action 2: `UPDATE "Invoice" SET "status" = 'OVERDUE' WHERE "status" = 'SENT' AND "dueDate" < TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`
  - Returns `{ webhookPurged: number, overduePromoted: number, ranAt: ISO }` for log inspection.

### Out of scope

- Schema-level new statuses beyond what already exists. The `PENDING_PAYMENT_LINK` + `OVERDUE` enum members are sufficient.
- Refund / reversal events from Xendit. Not yet supported by the school operationally.
- Multi-currency. Single IDR.
- WhatsApp blast UX changes. Existing manual-WA copy URL flow stays.
- Replacing the parent-portal payment success page (already shipped in PR #137).
- Kwitansi PDF (already shipped in PR #139).
- Standalone `/admin/webhooks` inspector page — folded into invoice-detail panel per user request (simpler, more contextual).

### Non-goals (deliberate omissions)

- No move to a queue (BullMQ / Inbox-as-table) for bulk jobs. The `runBulkGenerate` orchestrator + `pLimit(5)` keeps Vercel-native and is the right MVP shape for ≤500 students.
- No `Decimal.js` swap on the route layer — Prisma `Decimal` is fine.
- No retroactive backfill of `InvoiceNumberSequence` beyond the migration seed.
- No async webhook processing via background worker. The two-phase pattern is still synchronous within the function — phase 1 (insert) just must complete before phase 2 starts. Vercel function 60s budget is sufficient for one webhook event.

## Tasks

Order is dependency-aware. Each task is one commit per CLAUDE.md `/build` loop. Between-task gate: `npm run build && npx vitest run`.

- **T0 — Repro test for the 500.** Add `app/api/__tests__/invoices-manual-p2002-race.test.ts` that mocks the Prisma client to throw a `PrismaClientKnownRequestError` with code `P2002` on `invoice.create` and asserts the route currently returns 500 with raw error body. *Acceptance: failing test that reproduces; no production code changed.*

- **T1 — `InvoiceNumberSequence` table + atomic allocator + WIB year.**
  - 1a. Migration `20260426000001_invoice_number_sequence`:
    ```sql
    CREATE TABLE "InvoiceNumberSequence" (
      "tenantId" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "lastNumber" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("tenantId", "year")
    );

    -- Seed from existing invoices (handles 4+ digit suffixes; tenants with zero invoices get no row)
    INSERT INTO "InvoiceNumberSequence" ("tenantId", "year", "lastNumber")
    SELECT
      "tenantId",
      CAST(SUBSTRING("invoiceNumber" FROM 'INV-(\d{4})-') AS INTEGER) AS year,
      MAX(CAST(SUBSTRING("invoiceNumber" FROM 'INV-\d{4}-(\d+)$') AS INTEGER)) AS last_num
    FROM "Invoice"
    WHERE "invoiceNumber" ~ '^INV-\d{4}-\d+$'
    GROUP BY "tenantId", year;
    ```
  - 1b. Replace `nextInvoiceNumber` body with:
    ```ts
    export async function nextInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
      const yearStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date());
      const year = Number(yearStr);
      const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
        INSERT INTO "InvoiceNumberSequence" ("tenantId", "year", "lastNumber")
        VALUES (${tenantId}, ${year}, 1)
        ON CONFLICT ("tenantId", "year")
        DO UPDATE SET "lastNumber" = "InvoiceNumberSequence"."lastNumber" + 1
        RETURNING "lastNumber";
      `;
      const next = rows[0]?.lastNumber ?? 1;
      return `INV-${year}-${String(next).padStart(4, "0")}`;
    }
    ```
  - 1c. Drop `sumDecimals` is unaffected — keep as is.
  - 1d. New unit test `invoice-numbers.test.ts`: 50 concurrent calls produce 50 distinct numbers; year boundary at 17:00 UTC produces correct WIB year (next-day 00:00 WIB).
  - *Acceptance: T0 test now passes (routes returns 201, no race); existing `invoice-numbers.test.ts` cases still green; new concurrency test green.*

- **T2 — Manual-create resilience + UX.**
  - 2a. `lib/validations/invoice.ts` — `createManualInvoiceSchema`: add `periodLabel.max(64, "Maks 64 karakter")` and a `.refine((data) => new Set(data.lines.map(l => l.feeComponentId)).size === data.lines.length, { message: "Komponen biaya tidak boleh duplikat", path: ["lines"] })`.
  - 2b. `app/api/invoices/route.ts` — wrap the `prisma.$transaction` in a 3-attempt retry loop catching `PrismaClientKnownRequestError` code `P2002`, jitter `[50, 150, 450]ms ± 50ms`. On exhaust → 409. Drop the now-redundant `Set` dedup at line 117 (schema rejects upstream). Keep tenant + enabled fee-component verification.
  - 2c. `components/admin/invoices/manual-invoice-dialog.tsx` — replace student picker with shadcn `<Command>` combobox. Reuse the `useDebouncedCallback` from `lib/hooks` (or 250ms inline if unavailable). Fetches `/api/students?search=${q}&status=ACTIVE&pageSize=20`. Drop the existing one-shot `pageSize=500` fetch.
  - 2d. Vitest covers schema rejection (long periodLabel, duplicate feeComponentId), 409 retry-exhaust path, dedup removal. Playwright: open dialog → type "Aisy" → student appears → pick → submit → invoice in list. Cross-reference `.claude/standards/design-system.html` §Forms + §Combobox for picker visual.

- **T3 — Bulk retry orchestrator.**
  - 3a. `app/api/invoices/pending-payment-link/route.ts` — new GET endpoint, returns `{ data: [{ id, studentName, periodLabel, totalDue, paymentLinkError }], total }`, paginated, max `pageSize=1000`, ordered `createdAt asc`. Admin-only.
  - 3b. `lib/finance/run-bulk-retry.ts` — orchestrator:
    - Calls the new GET, surfaces "Lebih dari 1000 tagihan tertunda" toast if `total > 1000`.
    - Chunks IDs into 25-item slices.
    - POSTs each chunk to existing `/api/invoices/retry-payment-links` with `{ invoiceIds }`.
    - Three-strike retry pattern lifted from `run-bulk-generate.ts`.
    - Calls `onProgress` after each chunk.
  - 3c. `lib/finance/xendit-retry.ts` — keep 25-cap per call (defensive), add `orderBy: { createdAt: "asc" }`.
  - 3d. `app/admin/invoices/page.tsx` — `handleBulkRetry` now calls `runBulkRetry` instead of single-shot fetch. Same `BatchProgressCard` reuse.
  - *Acceptance: with 60 stuck invoices, one click drains all 60. Vitest covers chunking math + three-strike abort.*

- **T4 — Concurrency limiter + per-student results.**
  - 4a. Add `pLimit(5)` to Xendit fan-out in `app/api/invoices/generate/batch/route.ts:218` and `lib/finance/xendit-retry.ts:65` (verify both use bare `Promise.allSettled` and have no existing limiter).
  - 4b. Both endpoints' response shape gains `results: Array<{ invoiceId, studentId, studentName, status: "ok" | "xendit_failed" | "skipped", error?: string }>`. Existing `xenditOk`/`xenditFailed` counts stay (downstream `BatchProgressCard` already consumes them).
  - 4c. `BatchProgressCard` upgraded:
    - Accepts `mode: "generate" | "retry"` prop. Header copy switches: generate → "Membuat tagihan…", retry → "Memperbaiki link pembayaran…".
    - Collapsible `<details>` "Lihat detail (N gagal)" listing failed students name + humanized error (read-only per B4).
    - Done copy switches by mode: generate → "Selesai: {created} dibuat, {failed} gagal Xendit"; retry → "60 link berhasil diperbaiki" (or partial: "47 link berhasil, 13 masih gagal — buka invoice untuk detail").
    - "Batalkan" ghost button visible during `phase === "running"` (wires to existing abort signal).
    - `beforeunload` listener registered while `phase === "running"`, message: "Pembuatan tagihan sedang berjalan. Yakin keluar?"
  - 4d. Vitest mocks 3-of-25 Xendit failures, asserts response.results carries them. Component test: card renders correct header for both modes; cancel button calls abort callback; beforeunload handler registered/cleaned up.

- **T5 — Webhook two-phase + hardening.**
  - 5a. `prisma/schema.prisma` — `WebhookEvent.status` allowed values comment update: `RECEIVED | PROCESSED | ERROR | IGNORED`. Add `processedAt DateTime?` if missing. Migration if fields change (no breaking change to existing rows).
  - 5b. `app/api/xendit/webhook/route.ts` — two-phase rewrite:
    - Verify signature first.
    - `webhookEvent.create({ … status: "RECEIVED" … })` — on P2002 dup eventId → 200 noop.
    - Dispatch by `event` field; non-handled → `update({ status: "IGNORED" })` + 200.
    - `handleSessionCompleted` / `handleSessionExpired` mutations stay inside per-invoice advisory-lock tx.
    - On business-logic error → `update({ status: "ERROR", errorMessage })` + 200.
    - On infrastructure error → `update({ status: "ERROR", errorMessage })` + 500 (Xendit retries).
    - Remove DELETE-on-transient-error block at lines 122-127.
  - 5c. Restore `xenditSessionId` fallback in both handlers (PR #136 logic resurrected, with the 2 unit tests).
  - 5d. Amount-mismatch guard:
    - `amount == null || 0` → status `ERROR`, `errorMessage = "MISSING_AMOUNT"`, no payment row, 200.
    - Overpayment > tolerance → still credit, `errorMessage = "OVERPAYMENT_FLAGGED"`, 200.
  - 5e. `handleSessionExpired` → revert to `PENDING_PAYMENT_LINK` not `CANCELLED`, clear xendit fields. Status guard `["SENT", "PENDING_PAYMENT_LINK"]` only.
  - 5f. New + restored vitest cases: dup eventId 200 noop, missing-amount ERROR path, overpayment OVERPAYMENT_FLAGGED + credit, expired→PENDING_PAYMENT_LINK transition, xenditSessionId fallback hit, business-logic ERROR returns 200, infrastructure ERROR returns 500.

- **T6 — Cron handler + vercel.json.**
  - 6a. `app/api/cron/finance-maintenance/route.ts` — POST handler. Bearer-token check: `req.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\``. **Refuse if `CRON_SECRET` env is missing** (early 500 with operator log) — fails closed rather than leaving the endpoint open. Defense-in-depth `User-Agent: vercel-cron/*` check. **Pre-merge requirement**: operator must `openssl rand -hex 32` then add `CRON_SECRET` in Vercel project settings → mentioned in Ship Notes.
  - 6b. `vercel.json`:
    ```json
    {
      "$schema": "https://openapi.vercel.sh/vercel.json",
      "regions": ["sin1"],
      "crons": [
        { "path": "/api/cron/finance-maintenance", "schedule": "0 1 * * *" }
      ]
    }
    ```
  - 6c. Handler logic: webhook purge SQL + OVERDUE promote SQL (per acceptance C7). Returns counts JSON.
  - 6d. Vitest: 401 without auth; 200 with auth + correct purge/promote counts using a small fixture.

- **T7 — "Aktivitas Xendit" panel on invoice detail.**
  - 7a. `lib/webhook/redact-payload.ts` — pure function strips `payload.customer.*`, `payload.billing_information.*`, returns the redacted JSON.
  - 7b. `lib/webhook/extract-display-fields.ts` — pure parser: takes a Xendit payload, returns `{ paidAt: Date | null, paymentMethod: string | null, amount: number | null, currency: string | null, sessionId: string | null, paymentId: string | null }`. Field sources for `payment_session.completed`:
    - `paidAt` ← `data.updated ?? data.created ?? envelope.created`. The supplied real payload has `data.updated = "2026-04-26T09:23:18.882Z"` which is the actual capture moment.
    - `paymentMethod` ← `null` for `payment_session.completed` (Xendit does NOT include the user's chosen rail in the session-completed event for Payment Link mode; method appears only on the separate `payment.succeeded` event we don't currently subscribe to). Display label: "Metode tidak tercatat di webhook ini" rather than "Tidak diketahui" — communicates "not in this event" not "unknown".
    - `amount` ← `data.amount` (number) or `null` if missing.
    - `currency` ← `data.currency`.
    - `sessionId` ← `data.payment_session_id`.
    - `paymentId` ← `data.payment_id`.
    Returns all-null on completely unparseable payloads (e.g. `expired` shape with different fields). Vitest covers the supplied real `payment_session.completed` payload as a fixture.
  - 7c. `lib/webhook/error-labels.ts` — pure mapper from `errorMessage` prefix → humanized Indonesian label (`errorLabel: string | null`). Catalog:
    - `INVOICE_NOT_FOUND:*` → "Tagihan tidak ditemukan untuk pembayaran ini. Hubungi tim teknis."
    - `MISSING_AMOUNT` → "Jumlah pembayaran tidak tercatat di webhook. Verifikasi manual."
    - `OVERPAYMENT_FLAGGED` → "Pembayaran melebihi tagihan — sudah dikreditkan, verifikasi manual."
    - `IGNORED:already_paid` → "Tagihan sudah lunas — event diabaikan."
    - `IGNORED:status_not_completed` → "Status pembayaran belum selesai (Xendit pending)."
    - `IGNORED:status_not_handled` → "Tipe event tidak didukung."
    - default (no prefix match) → null (UI falls back to muted "Lihat detail di payload").
    Vitest covers each catalog entry + null fallback.
  - 7d. `app/api/invoices/[id]/webhook-events/route.ts` — new GET endpoint. Admin-only (tenant-scoped via the invoice ownership check). Fetches `WebhookEvent` rows where `invoiceId = id`, ordered `createdAt desc`, applies `redactPayload` server-side, calls `extractDisplayFields` for convenience fields, calls `mapErrorLabel(errorMessage)` for the humanized copy. Response: `Array<{ id, eventType, status, errorMessage, errorLabel, createdAt, displayFields, payload }>`.
  - 7e. New client component `components/admin/invoices/xendit-activity-card.tsx` — fetches via `useEffect` on mount (consistent with the rest of the detail page's client-fetch pattern). Renders `<Card>` only when `events.length > 0` (empty-state policy: silent absence). Each row uses the two-line layout from C6.
  - 7f. `app/admin/invoices/[id]/page.tsx` (already `"use client"`) — drop in `<XenditActivityCard invoiceId={invoice.id} />` below the payment-history card. Component handles its own visibility.
  - 7g. Cross-check `.claude/standards/design-system.html` §Card, §Status badges, §Forms. Reuse existing pill colors (PROCESSED→green, ERROR→red, IGNORED→muted). Mobile/tablet: payload `<pre>` is `whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto text-xs font-mono`.
  - 7h. Vitest fixtures live at `lib/webhook/__fixtures__/`:
    - `session-completed-realprod.json` — the exact payload supplied by the user during /spec (legacy `staging-tagihan-` reference_id, no `payment_method`, real `data.updated`, `data.payment_session_id = ps-69ec4131...`).
    - `session-completed-bare-id.json` — bare-CUID reference_id (post-PR #138 happy path).
    - `session-expired.json` — minimal expired event.
    Tests assert: redactor strips PII; extractor returns `paidAt = 2026-04-26T09:23:18.882Z`, `amount = 800000`, `paymentMethod = null` for the realprod fixture; webhook handler integration test runs the realprod fixture end-to-end against a mocked Prisma client and verifies the xenditSessionId fallback path (T5c) resolves the invoice via `ps-69ec4131...`. Playwright: SCHOOL_ADMIN visits a paid invoice detail, sees panel with "Metode tidak tercatat di webhook ini", expands payload, sees no `customer.email`.

- **T8 — Verification + cycle doc fill + ship prep.**
  - End-of-cycle gate: `npm run build && npx vitest run && npx playwright test`.
  - Update `README.md` finance-module section: mention `InvoiceNumberSequence`, the cron, the activity panel.
  - Fill Implementation + Verification + Ship Notes here.
  - Run `/requesting-code-review` per CLAUDE.md.

## Implementation

- Subagent plan: T0/T1/T2 sequential (touch the same allocator+route); T3→T4 sequential (share `xendit-retry.ts` + `batch-progress-card.tsx`); T5+T6 parallel (independent files); T7 after T5 (depends on ERROR enum); T8 final.
- Task 0 — failing P2002 race repro test — `app/api/__tests__/invoices-manual-p2002-race.test.ts` (new) + `vitest.config.ts` (added `.claude/worktrees/**` to `exclude` — orphaned harness worktrees were polluting test discovery and blocking the gate). Fixture `describe.skip`'d until T2b lands the retry-once loop; manual run `npx vitest run app/api/__tests__/invoices-manual-p2002-race.test.ts` confirms current code returns 500 (P2002 bubbles unhandled) — T2b will remove the skip and the suite goes green naturally.
- Task 1 — `InvoiceNumberSequence(tenantId, year, lastNumber)` table + atomic allocator + WIB year. Files: `prisma/schema.prisma` (new model + Tenant relation), `prisma/migrations/20260426000001_invoice_number_sequence/migration.sql` (DDL + seed from existing invoices via `WHERE invoiceNumber ~ '^INV-\d{4}-\d+$'` + `MAX(SUBSTRING)`), `lib/finance/invoice-numbers.ts` (rewrote `nextInvoiceNumber` as thin wrapper over new `reserveInvoiceNumbers(tx, tenantId, count)` — single `INSERT … ON CONFLICT DO UPDATE SET lastNumber = lastNumber + count RETURNING lastNumber`), `app/api/invoices/generate/batch/route.ts` (rewired to use `reserveInvoiceNumbers` for atomic N-number reservation, fixes reviewer blocker on cross-route sequence drift). Code-reviewer pass: 1 blocker fixed inline, 1 hardening recommendation applied.
- Task 2 — Manual create resilience + UX. Files: `lib/validations/invoice.ts` (periodLabel max(64) + lines dedup `.refine` with Indonesian copy at `path: ["lines"]`), `lib/validations/__tests__/invoice.test.ts` (NEW — 5 schema tests), `app/api/invoices/route.ts` (3-attempt P2002 retry loop with jittered backoff `[50, 150, 450]ms ± 50ms`, returns 409 with "Konflik nomor tagihan, silakan coba lagi" on exhaust; dropped redundant Set dedup at line 117 since schema rejects upstream), `components/admin/invoices/manual-invoice-dialog.tsx` (combobox rewrite with all 5 states: idle/loading/empty/error/overflow + clear-X button + 250ms debounce + AbortController + on-demand `/api/students?search=&pageSize=20` — no upfront fetch), `e2e/admin.spec.ts` (combobox happy-path), unskipped T0 fixture. Code-reviewer pass: 3 fixes applied — (a) `wireHappyPath` mock queue updated for single-call atomic allocator, (b) loading state moved INSIDE setTimeout callback to avoid keystroke-jitter, (c) idle + empty copy stripped of "atau NIS" since `/api/students?search=` only matches name/nickname (NIS-search is a separate followup).
- Task 3 — Bulk retry orchestrator. NEW: `app/api/invoices/pending-payment-link/route.ts` (admin GET, tenant-scoped, `take: 1000`, `orderBy: createdAt asc`), `lib/finance/run-bulk-retry.ts` (orchestrator mirroring `run-bulk-generate.ts` — phases fetching-pending/running/done/aborted/overflow, BATCH_SIZE=25, 3-strike retry w/ `[1000,3000]ms` backoffs, 4xx fail-fast, MAX_PENDING_FETCH=1000), `lib/finance/__tests__/run-bulk-retry.test.ts` (10 tests), `app/api/__tests__/invoices-pending-payment-link.test.ts` (6 tests). MODIFIED: `lib/finance/xendit-retry.ts` (+`orderBy: { createdAt: "asc" }` only — cap stays 25), `lib/finance/__tests__/xendit-retry.test.ts` (orderBy assertion), `components/admin/invoices/batch-progress-card.tsx` (TS discriminated union `mode: "generate" | "retry"` — RetryCard variant renders Indonesian copy "Memperbaiki link pembayaran…" + "Selesai: {fixed} link diperbaiki, {stillFailed} masih gagal"), `app/admin/invoices/page.tsx` (handleBulkRetry now calls `runBulkRetry`, AlertDialog "Antrian retry penuh" gates >1000 case with `Sisa ${total - 1000}` interpolated count + "Mulai Proses" confirm). Code-reviewer pass: 2 fixes applied — (a) `onOverflow` callback made REQUIRED on orchestrator signature (optional version allowed silent processing of 1000 invoices without UI gate, violating spec); (b) AlertDialogDescription interpolates `{total - 1000}` so admin sees actual remaining backlog. Cancel button + beforeunload + per-student error rows deferred to T4 per cycle plan.

## Verification

- Task 0: gates passed. `npm run build` → green. `npx vitest run` → 584 passed, 2 skipped (T0 fixture), 42 todo. Build size unchanged.
- Task 1: gates passed. `npm run build` → green. `npx vitest run` → 591 passed, 2 skipped, 42 todo (+4 reserveInvoiceNumbers tests, +3 nextInvoiceNumber tests vs old advisory-lock impl).
- Task 2: gates passed. `npm run build` → green. `npx vitest run` → 600 passed, 42 todo (+9 net: +5 schema cases, +2 retry assertions in invoices-manual-create, +2 unskipped T0 fixture). Both T0 assertions green: P2002→retry→201 and 3×P2002→409 with Indonesian copy.
- Task 3: gates passed. `npm run build` → green. `npx vitest run` → 616 passed, 42 todo (+16: 10 run-bulk-retry, 6 invoices-pending-payment-link).
- Task 1: Added `lib/finance/invoice-numbers.ts::reserveInvoiceNumbers(tx, tenantId, count)` to fix reviewer-flagged blocker — the batch route at `app/api/invoices/generate/batch/route.ts:153` allocated ONE number then incremented `nextNum++` client-side N times, leaving the new atomic `InvoiceNumberSequence.lastNumber` at `start+1` while emitting numbers `start..start+N-1`. Fix: single round-trip `INSERT … ON CONFLICT DO UPDATE SET lastNumber = lastNumber + count RETURNING lastNumber` reserves a contiguous range. Batch route rewired to consume the array. `nextInvoiceNumber` now thin-wraps `reserveInvoiceNumbers(..., 1)`.
- Task 1: Hardened year extraction per reviewer recommendation — `Intl.DateTimeFormat.formatToParts()` + explicit `year` part lookup, defensive against future ICU locale changes to `en-CA` stand-alone year rendering. Zero behavior change today.

## Ship Notes

<!--
Filled by /ship:
- New migration: 20260426000001_invoice_number_sequence (additive, includes seed pass for existing invoices; tenants with zero invoices get no seed row, allocator seeds on first call)
- New env var: `CRON_SECRET` — **operator MUST set in Vercel project settings before merge.** Generate via `openssl rand -hex 32`. Single-purpose secret, no Xendit/Supabase coupling. Vercel auto-injects this header into cron deliveries when set; absence leaves endpoint publicly callable (handler fails-closed).
- New cron: vercel.json registers /api/cron/finance-maintenance @ 01:00 UTC (08:00 WIB) daily
- New routes: GET /api/invoices/pending-payment-link, POST /api/cron/finance-maintenance
- New schema enum value comment: WebhookEvent.status now uses RECEIVED | PROCESSED | ERROR | IGNORED. **No data backfill required** — production rows currently hold only RECEIVED / PROCESSED / IGNORED (the prior schema comment listed FAILED but the DELETE-on-transient-error path never wrote it). Adding ERROR is purely additive at the comment level.
- Behavior change for parents: payment_session.expired now reverts invoices to PENDING_PAYMENT_LINK (was CANCELLED). Parent allow-list excludes both, so no parent-visible diff. Admin sees the invoice stay in the list with retry option instead of disappearing into CANCELLED.
- Duplicate-payment risk note: when admin clicks "Coba Lagi Link" on a PENDING_PAYMENT_LINK invoice, a new Xendit session is created. The OLD session URL still works at Xendit. If parent pays the old link, webhook resolves by reference_id (= invoice.id) regardless of which session was paid — credits correctly. The two-layer idempotency (eventId + xenditPaymentId @unique) protects against double-credit. Safe.
- Rollback plan: revert merge commit. Migration is additive (no destructive change). Cron entry in vercel.json: removing it restores no-cron behavior. Sequence table can be left in place after rollback (orphaned, harmless) or dropped via separate migration.
- Post-merge: monitor Vercel logs 24h on /api/cron/finance-maintenance + /api/xendit/webhook for amount-guard activations + ERROR-status webhook events.
-->
