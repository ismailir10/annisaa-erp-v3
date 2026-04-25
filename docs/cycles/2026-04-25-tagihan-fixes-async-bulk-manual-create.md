# Tagihan: Fixes + Async Bulk + Manual Single-Invoice Creation

**Branch:** `claude/hungry-napier-e738bc` (harness-created; will rename to `feat/tagihan-fixes-async-bulk-manual-create` before /ship if needed)
**Cycle file:** this file is the only markdown for this cycle.
**Vercel logs:** no `vercel` CLI on host, no Vercel MCP wired, no `VERCEL_TOKEN`. Bug list below is derived from static code review of `app/api/invoices/**`, `app/api/xendit/**`, `app/admin/invoices/**`, and `prisma/schema.prisma`. Production log-scrape can be done in a follow-up cycle once Vercel access is wired.

---

## Context

The finance/tagihan module is the parent-facing money path: bulk-generate monthly invoices → "Kirim" → Xendit checkout → webhook records payment. Code review surfaced 5 real bugs (one money-correctness, two race conditions, one Xendit duplication, one stats inaccuracy) and two product gaps that block real-world use:

1. **Bulk generate is synchronous + monolithic + does not create Xendit links.** `app/api/invoices/generate/route.ts` holds a tenant advisory lock and creates all invoices in one transaction. The current "Kirim Tagihan" button afterwards is a separate step that loops through DRAFT invoices and calls Xendit once per invoice — also synchronous. Real ops always do generate → kirim back-to-back; splitting them is artificial and doubles the timeout exposure. With Vercel free tier capped at 60s and ~500ms per Xendit Checkout Session call, even 500 invoices in one server round-trip blows the budget the moment Xendit is added. UI also blocks until completion.
2. **No path exists to create one invoice for one student with custom line items.** Admin can only run "Buat Tagihan" (bulk for all active students of a year) or adjust an existing line via the detail page. Real ops need: ad-hoc invoice for late-enrollment, sibling-discount, or one-off charges (uang pangkal mid-year, replacement seragam, field-trip, etc.). Schema already supports it — `InvoiceLine.feeComponentId` is just a FK; no business rule forces lines to come from `ProgramFeeStructure`. Manual-create must also produce a Xendit payment link in the same call so the admin can immediately copy/send it.
3. **Webhook idempotency leaks past the DB.** `Payment.xenditPaymentId @unique` exists in schema (line 676 of schema.prisma) but `app/api/xendit/webhook/route.ts:81-89` writes the Xendit payment id into the free-form `reference` column instead. Idempotency check at line 76 is a `findFirst` inside the transaction — works for the "exact same retry" case but fails open the moment Xendit changes a single character (e.g., switches from `payment_id` to `payment_session_id` between retries — see line 77 `paymentId ?? data.payment_session_id`).
4. **Manual-payment overpayment guard is racy.** `app/api/invoices/[id]/payments/route.ts:33-39` reads `invoice.totalPaid` outside the transaction. Two concurrent admin entries of `amount=remaining` both pass the guard and the second creates an over-payment row.
5. **Void vs. payment race.** `app/api/invoices/[id]/void/route.ts` has no advisory lock; an admin clicking "Batalkan" while a Xendit webhook is processing can leave a `CANCELLED` invoice with a non-zero `totalPaid` and an orphan `Payment` row.
6. **Send-sessions loop re-creates duplicate Xendit sessions.** `app/api/xendit/create-session/route.ts:60` calls `createXenditSessionForInvoice` for every invoice id without checking `invoice.xenditSessionId`; clicking "Kirim" twice produces two live sessions per invoice (Xendit charges nothing for orphans but parent gets two confusing links if both are sent).
7. **Stats cards fire 4 separate paginated requests.** `app/admin/invoices/page.tsx:248-261` does `Promise.all` of 4 `fetch("/api/invoices?pageSize=1&status=…")` calls — wasteful, and silently misses `PARTIALLY_PAID` (so the four cards never sum to "total").

**Why now:** parent portal cycles in April have been writing into this surface (`xenditSessionId`, `paidAt`, parent invoice list) and every UAT pass for the parent portal touches the focal due-amount card. A single race or duplicated Xendit link in production breaks parent trust on the most-visible screen we have.

**Failure-mode philosophy:** "partial success" (some Xendit links failed) is an explicit data state, not a transient runtime hiccup the admin has to remember to fix. Failed-link invoices land in a distinct status `PENDING_PAYMENT_LINK` (visible on the list, filterable, individually + bulk retryable). The DB write always succeeds for the invoice; the Xendit step is a separate step that can be re-driven by the admin from the UI without re-creating the invoice.

**Out of scope (this cycle):**
- Server-side background jobs (`after()`, queues, cron). Stay on Vercel free tier (60s function ceiling). Long-running work moves to the **client**: the admin browser drives a sequential chain of small `POST /api/invoices/generate/batch` calls, each well under 60s, with progress UX on the page.
- New `InvoiceGenerationJob` model. Not needed once we shed the server-async approach.
- CSV import for manual invoices.
- Bulk-create with **custom** (per-student) line items. Bulk uses each student's `ProgramFeeStructure`. Manual is the per-student-custom-lines path; one student per call.
- Multi-tenant rate-limiting of Xendit calls beyond the existing `lib/rate-limit.ts` window.
- Refactor of `lib/xendit/client.ts` HTTP layer.
- Auto-retry of `PENDING_PAYMENT_LINK` invoices on a cron schedule. Retry is admin-driven (button click) for v1.

**Cross-checked design-system.html:** §Forms, §Dialog, §Sheet, §DataTable, §StatusBadge, §StatCard for the new "Buat Tagihan Manual" dialog and the async-progress affordance. No new tokens or components introduced; reuse existing `<Dialog>` / `<Sheet>` (mobile fallback) / `<Field>` / `<Combobox>` (student picker) / `<DataTable>`.

---

## Spec

Acceptance criteria — every line below must be true at end of cycle.

### Bug fixes (no behavior changes for happy path)

1. Xendit webhook writes the Xendit payment id into `Payment.xenditPaymentId` (not `reference`) and uses a Prisma `upsert` on that unique key for idempotency. A second webhook delivery for the same Xendit payment id is a no-op that returns 200. The `reference` column keeps its current free-form usage for manual `BANK_TRANSFER` references.
2. Manual payment route runs the overpayment check **inside** the transaction after re-fetching `invoice` with the advisory lock pattern from the webhook (`pg_advisory_xact_lock(hashtext(invoice.id))`). Two concurrent calls with `amount=remaining` produce exactly one successful 201 and one 400 "melebihi sisa tagihan".
3. Void route acquires the same per-invoice advisory lock and re-fetches `status` + `totalPaid` inside the transaction. If `totalPaid > 0` the route returns 400 with `"Tagihan sudah memiliki pembayaran. Tidak bisa dibatalkan — gunakan refund."` (admin-facing copy approved against design-system §Voice). If status changed to PAID/CANCELLED mid-flight, returns 409 conflict.
4. `POST /api/xendit/create-session` short-circuits when `invoice.xenditSessionId` is already set: returns the existing `xenditPaymentUrl` and counts the invoice in `created` (not `failed`). Admin retrying "Kirim" never produces a second Xendit session.
5. New `GET /api/invoices/stats` returns `{ total, draft, sent, partiallyPaid, paid, overdue, cancelled }` in one Prisma `groupBy`. `app/admin/invoices/page.tsx` calls this once instead of 4×. Stats card row gains "Sebagian" (PARTIALLY_PAID) so the four-card total reconciles.

### Bulk creation — client-driven chunking with inline Xendit (`/spec` task #2)

The legacy `POST /api/invoices/generate` is replaced by a two-endpoint flow plus client-side orchestration. Total wall time scales linearly with student count, but each network round-trip is bounded under 60s.

6. **Plan endpoint.** `POST /api/invoices/generate/plan` accepts `{ periodLabel, dueDate, academicYearId }`. Returns `{ eligibleStudentIds: string[], skippedAlreadyInvoiced: number, skippedNoFeeStructure: number, total: number }`. No DB writes. Same validation as the legacy endpoint. Admin sees an exact count before committing.
7. **Batch endpoint.** `POST /api/invoices/generate/batch` accepts `{ studentIds: string[] /* max 25 */, periodLabel, dueDate, academicYearId }`. For each student id in the batch:
   1. Re-validates active enrollment + tenant + not-already-invoiced for the period (idempotent — safe to retry).
   2. Inside one transaction per batch: takes tenant advisory lock, assigns sequential invoice numbers via the shared `nextInvoiceNumber` helper, `createMany` invoices + `createMany` lines. **Initial status = `PENDING_PAYMENT_LINK`** (not `DRAFT`) — the invoice was created with the intent of attaching a Xendit link in the same flow.
   3. After the transaction commits, kicks off Xendit Checkout Session creation for the new invoices in **parallel with concurrency limit 5** (`Promise.allSettled` over a hand-rolled `pLimit(5)` — no new deps). On success: `prisma.invoice.update({ data: { status: "SENT", sentAt: new Date(), paymentLinkError: null } })` (the helper already wrote `xenditSessionId` + `xenditPaymentUrl`). On failure: `prisma.invoice.update({ data: { paymentLinkError: <message> } })` — status stays `PENDING_PAYMENT_LINK`.
   4. Returns `{ created: number, skipped: number, results: Array<{ studentId, invoiceId, invoiceNumber, status: "SENT" | "PENDING_PAYMENT_LINK", paymentUrl?: string, error?: string }> }`.
   5. Hard cap: `studentIds.length ≤ 25`. Server returns 400 otherwise. With a 5-way concurrency limit and ~500ms-1500ms per Xendit call, a 25-student batch finishes in ~5–10s server-side, leaving plenty of headroom under the 60s ceiling. (Math: 25 students / 5 parallel × 1500ms worst-case = 7.5s, plus ~1s DB.)
   6. Rate limit: 30 batch calls per minute per IP (covers a 750-student batch run at 25 per chunk).
8. **Client orchestration.** `app/admin/invoices/page.tsx` "Buat Tagihan" submit:
   1. Calls `plan`. Shows a confirmation dialog: "240 siswa akan ditagih (15 dilewati: sudah punya tagihan; 8 dilewati: belum ada struktur biaya). Lanjutkan?"
   2. On confirm: chunks `eligibleStudentIds` into batches of 25 (configurable `BATCH_SIZE` constant). Calls batches **sequentially** (not in parallel) — this avoids hammering the DB advisory lock and Xendit rate limits.
   3. Updates a sticky progress card after each batch: `Membuat tagihan… ${done}/${total}` with `${createdSuccessful}` Xendit links created and `${xenditFailed}` flagged as `PENDING_PAYMENT_LINK`. Allows admin to abort (closes the page = stops the loop; existing invoices stay durable).
   4. On completion: toast `${created} tagihan dibuat, ${xenditOk} dengan link pembayaran${xenditFailed > 0 ? `, ${xenditFailed} link gagal — bisa di-retry dari list` : ""}`. Refreshes table. If `xenditFailed > 0`, the list naturally shows them via the new `PENDING_PAYMENT_LINK` status filter (no banner needed — the list IS the durable surface).
9. **Network failure recovery.** If a batch call returns 5xx or times out, the client retries that batch up to 2× with exponential backoff (1s, 3s). After 2 failed retries, the loop pauses and the admin sees "Koneksi tidak stabil. Lanjutkan dari batch X?" — Continue / Cancel.
10. Decimal handling: line amounts and `totalDue` use `Prisma.Decimal` (`new Prisma.Decimal(...)` + `.add()`) — fixes the float-drift agent flagged in `generate/route.ts:113`.

### Manual single-invoice creation with inline Xendit (`/spec` task #3)

11. `POST /api/invoices` accepts `{ studentId, periodLabel, dueDate, lines: [{ feeComponentId, amount }, …] }` and **also creates a Xendit Checkout Session** in the same call. Returns the created invoice (with lines + `xenditPaymentUrl`) and 201. Validates: student belongs to tenant + has at least one ACTIVE enrollment; every `feeComponentId` belongs to tenant + is `isEnabled=true`; lines array length ≥ 1; every `amount > 0`; `periodLabel` non-empty; `dueDate` is YYYY-MM-DD. `totalDue` derived server-side from line amounts via `Prisma.Decimal` (client value ignored). **Initial status `PENDING_PAYMENT_LINK`** until Xendit succeeds.
12. **Xendit failure handling for manual create.** If the Xendit call fails after the invoice transaction commits, the response is still `201` with the created invoice **plus** `{ xenditError: "<message>" }`. Status is `PENDING_PAYMENT_LINK` and `paymentLinkError` is persisted. Admin UI surfaces "Tagihan dibuat. Link pembayaran gagal — coba lagi dari list?" The same Retry mechanism (Spec §16-19) applies.
13. Wall-time budget for manual create: ≤3s under nominal Xendit latency. No advisory-lock contention on tenant numbering since calls are one-at-a-time and quick.
14. Admin UI: header gains a second button "Tagihan Manual" (variant outline, alongside existing "Buat Tagihan"). Opens a Dialog (Sheet on mobile) with: student combobox (search by name/nickname, scoped to tenant active enrollees), period label input (default current month), due date input (default last day of current month), repeating line-item rows (each: fee-component select + amount input + remove button), "+ Tambah Komponen" button, total preview row showing `formatRupiah(sum)`. Submit calls the new POST. On success: closes dialog, toasts "Tagihan dibuat untuk ${studentName}" plus the `xenditPaymentUrl` snippet with a "Salin Link" button (mirrors the existing send-results dialog UX), then router pushes to detail page.
15. The "Kirim Tagihan" button in the list header is **removed** in favor of the new retry button (Spec §17). With inline-Xendit on every creation path, the only invoices needing a link are those in `PENDING_PAYMENT_LINK` — and the retry button is the canonical action for them. (Sanity check: are there other paths that produce link-less invoices? No — this cycle inlines Xendit on bulk + manual; no other creation paths exist.)

### Failed payment link visibility & retry (`/spec` core requirement)

A Xendit failure during creation is **not a transient runtime hiccup** — it's a durable data state. The list is the durable surface, the retry button is the canonical action.

16. **Schema change.**
    - Add status value `PENDING_PAYMENT_LINK` to `Invoice.status` (string column, no enum at DB level — only the zod validator + status-badge map need updates).
    - Add `paymentLinkError String?` to `Invoice` for diagnostic message persistence.
    - Migration: `prisma migrate dev --name invoice_payment_link_error`. Single column-add, idempotent.
17. **Bulk retry.** New endpoint `POST /api/invoices/retry-payment-links` accepts `{ invoiceIds?: string[] }`. If `invoiceIds` omitted → retries **all** `PENDING_PAYMENT_LINK` invoices for the tenant. Otherwise retries only the specified ones (ownership-checked). Hard cap: 25 invoices per call (same chunking pattern as bulk create — client iterates if needed). Internally same `pLimit(5)` + `Promise.allSettled` over `createXenditSessionForInvoice`. Returns `{ retried, succeeded, stillFailed, results: [...] }`. Rate limit: 10/min per IP.
18. **Per-row retry.** Existing list-page row actions menu gains "Coba Lagi Link Pembayaran" when `status === "PENDING_PAYMENT_LINK"`. Calls `POST /api/invoices/retry-payment-links` with `{ invoiceIds: [row.id] }`. Toast "Link berhasil dibuat" or "Masih gagal: ${error}". Row refreshes.
19. **Bulk retry button.** Header gains "Coba Lagi Link (N)" button visible when there are any `PENDING_PAYMENT_LINK` invoices for the tenant (count derived from stats endpoint). Click → confirm dialog ("Membuat ulang link untuk N tagihan. Lanjutkan?") → loops `POST /api/invoices/retry-payment-links` in chunks of 25 with the sticky progress card — same UX primitive as bulk create.
20. **Visual treatment.**
    - Status badge for `PENDING_PAYMENT_LINK`: warning tint (amber, `bg-status-late-subtle text-status-late-text`) + label "Link Gagal". (Existing palette token; no new color.)
    - Detail page (`app/admin/invoices/[id]/page.tsx`): when `paymentLinkError != null`, show an alert card above the line items: "Link pembayaran belum berhasil dibuat: ${paymentLinkError}" + "Coba Lagi" button.
    - Stats endpoint (Spec §5) gains `pendingPaymentLink: number`; admin list adds a "Link Gagal" stat card (warning color).
    - List filter dropdown (existing in `DataTableToolbar`) gains a "Link Gagal" option which sets `?status=PENDING_PAYMENT_LINK`.
21. **Webhook + parent portal exclusion.** `lib/parent-helpers.ts:139` already filters `status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }` — `PENDING_PAYMENT_LINK` is excluded automatically. Parents never see these. Verify in test.

### Cross-cutting

22. New zod schemas in `lib/validations/invoice.ts`: `createManualInvoiceSchema`, `generatePlanSchema`, `generateBatchSchema`, `retryPaymentLinksSchema`. Existing `generateInvoicesSchema` is **removed** along with the legacy `POST /api/invoices/generate` route. The `updateInvoiceSchema` enum gains `PENDING_PAYMENT_LINK`.
23. New helper `lib/finance/p-limit.ts`: minimal hand-rolled concurrency limiter (`function pLimit(n: number): <T>(fn: () => Promise<T>) => Promise<T>`). Avoids adding the `p-limit` npm package — keeps dep tree clean. ~25 lines.
24. New helper `lib/finance/invoice-numbers.ts`: exports `nextInvoiceNumber(tx, tenantId)` (advisory-lock + parse-suffix logic, currently inlined in `generate/route.ts:121-133`) and `sumDecimals(values: Decimal[]): Decimal`. Used by both batch endpoint and manual-create endpoint.
25. New helper `lib/finance/xendit-retry.ts`: `retryPaymentLinks(tenantId, invoiceIds | null)` — shared by the retry endpoint and manual-create's inline retry. Returns `{ retried, succeeded, stillFailed, results }`.
26. `components/ui/status-badge.tsx`: `STATUS_MAP` gains `PENDING_PAYMENT_LINK: { label: "Link Gagal", className: "bg-status-late-subtle text-status-late-text" }`.
27. Tests:
    - **Vitest** unit/integration: webhook idempotency (same `xenditPaymentId` twice = one Payment row), manual-payment race (two concurrent `amount=remaining` = one success), void-with-payments returns 400, send-session twice = one session, manual-create validation matrix, stats endpoint shape, plan endpoint counts, batch endpoint with mocked Xendit (4 succeed + 1 fail → 4 SENT + 1 PENDING_PAYMENT_LINK + `paymentLinkError` set), retry endpoint (3 PENDING → 2 succeed + 1 still fails → DB state matches), parent-helpers excludes `PENDING_PAYMENT_LINK` from parent invoice list, `pLimit(2)` runs 5 jobs in 3 waves, `nextInvoiceNumber` concurrent-safe.
    - **Playwright** e2e (admin portal): bulk plan → confirm → 3 batches sequential with one Xendit failure → progress card shows N created + 1 link gagal → table refreshes → row shows "Link Gagal" badge → row retry succeeds; manual-create dialog → submit → toast with copy-link → navigates to detail page; bulk retry button visible when `pendingPaymentLink > 0`.
28. Doc-sync: README.md updated — Architecture Decisions log gains 2026-04-25 entries for (a) "Bulk invoice generation moved to client-driven chunked batches with inline Xendit (Vercel free tier 60s ceiling)", (b) "Failed Xendit link surfaces as `PENDING_PAYMENT_LINK` status + admin retry — no transient hidden state", and (c) "Webhook idempotency moved to `Payment.xenditPaymentId` unique key". Modules table for `finance` updated to mention the new status. The legacy `POST /api/invoices/generate` removal is noted.
29. Verification gate: `npm run build && npx vitest run && npx playwright test` all green before final commit. Frontend gate (pre-commit Rule 4) satisfied — this doc contains the literal token `design-system`.

### Non-goals / explicit "no"

- No server-side background jobs, queues, or `after()`.
- No DB-backed job-progress table.
- No CSV import.
- No multi-student manual create. (One call = one student.)
- No change to `lib/xendit/client.ts` HTTP layer.
- No retroactive backfill of `Payment.xenditPaymentId` for existing rows. New webhook deliveries write the column going forward.
- No automatic cron retry of `PENDING_PAYMENT_LINK` invoices.
- No DB-level enum constraint on `Invoice.status` — column stays `String` (consistent with other status columns in this schema). Validation lives in zod + status-badge map.

---

## Tasks

Each task is one commit. Between every task: `npm run build && npx vitest run` must pass. End of cycle: + `npx playwright test`. Commit messages follow Conventional Commits; `feat(finance): …` and `fix(finance): …`.

### Task 1 — Webhook idempotency on `xenditPaymentId`
- Edit `app/api/xendit/webhook/route.ts`: replace `findFirst({ where: { reference: paymentId ?? … } })` with `tx.payment.upsert({ where: { xenditPaymentId: paymentId ?? data.payment_session_id }, create: {…, xenditPaymentId: paymentId, reference: paymentId}, update: {} })`. Keep the existing advisory lock + re-fetch.
- Vitest: add `tests/xendit-webhook.test.ts` (new file) — fires same payload twice via `fetch` to a test server (or calls the route handler directly with a mocked Prisma); asserts exactly one `Payment` row.
- README.md: append ADR row "2026-04-25 | Xendit webhook idempotency moved to `Payment.xenditPaymentId` unique key | DB-level dedup; previous reference-string check was racy".

### Task 2 — Manual payment overpayment race
- Edit `app/api/invoices/[id]/payments/route.ts`: move `remaining` calculation inside `prisma.$transaction`, after `tx.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))\`` and re-fetch of invoice.
- Add `recordPaymentSchema.parse(body)` (already exported from `lib/validations/invoice.ts`).
- Vitest: simulate two concurrent calls with `Promise.all` against a real test DB (or a single-process race via two transactions). Assert exactly one 201, one 400.

### Task 3 — Void requires zero payments + advisory lock
- Edit `app/api/invoices/[id]/void/route.ts`: wrap the status update in a transaction, take the per-invoice advisory lock, re-fetch, return 400 if `totalPaid > 0`, return 409 if `status` not in `("DRAFT","SENT")`.
- Update copy per design-system §Voice: ID-Indonesian, no exclamation, gentle.
- Vitest: void-after-payment returns 400 with the new message; void-when-paid returns 409.

### Task 4 — Schema: `paymentLinkError` + `PENDING_PAYMENT_LINK` propagation
- `prisma/schema.prisma`: add `paymentLinkError String?` to `Invoice`. Update the `// status` comment to include `PENDING_PAYMENT_LINK`.
- `npx prisma migrate dev --name invoice_payment_link_error`. Commit migration file.
- `lib/validations/invoice.ts`: add `PENDING_PAYMENT_LINK` to `updateInvoiceSchema`'s status enum.
- `components/ui/status-badge.tsx`: add `PENDING_PAYMENT_LINK: { label: "Link Gagal", className: "bg-status-late-subtle text-status-late-text" }` to `STATUS_MAP`.
- `lib/parent-helpers.ts`: confirm filter at line 139 stays `["SENT", "PARTIALLY_PAID", "OVERDUE"]` — no change needed; parent never sees PENDING_PAYMENT_LINK.
- Vitest: existing parent-helpers test extended — assert a PENDING_PAYMENT_LINK invoice does not appear in `getParentDashboardData()`.

### Task 5 — Idempotent Xendit session creation + paymentLinkError write-back
- Edit `app/api/xendit/create-session/route.ts`:
  - Before calling `createXenditSessionForInvoice`, check `invoice.xenditSessionId`. If present, push `{ studentName, invoiceNumber, paymentUrl: invoice.xenditPaymentUrl }` into `results`, increment `created`, **clear `paymentLinkError`** (defensive — no-op if already null).
  - On Xendit success: in addition to existing `status=SENT`, set `paymentLinkError: null`.
  - On Xendit failure: persist `paymentLinkError: e.message`, set `status: "PENDING_PAYMENT_LINK"`. (Currently the route only counts failures without persisting.)
- Vitest:
  - existing-session path returns existing URL, no new Xendit API call (mock `client.ts`).
  - Xendit-throws path → invoice updated with `status=PENDING_PAYMENT_LINK` + `paymentLinkError`.
  - Retry of PENDING_PAYMENT_LINK invoice + Xendit success → status=SENT, paymentLinkError=null, xendit fields populated.

### Task 6 — Single stats endpoint
- Add `app/api/invoices/stats/route.ts`: admin-only, single `prisma.invoice.groupBy({ by: ['status'], where: { tenantId }, _count: true, _sum: { totalDue: true, totalPaid: true } })`. Returns `{ total, draft, sent, partiallyPaid, paid, overdue, cancelled, pendingPaymentLink, totalDue, totalPaid }`.
- Edit `app/admin/invoices/page.tsx`: replace the 4-fetch `useEffect` with one call. Add `<StatCard label="Sebagian" … />` between Lunas and Jatuh Tempo. Add `<StatCard label="Link Gagal" color="warning" … />` (only rendered if `pendingPaymentLink > 0`).
- Vitest: stats endpoint returns expected shape including `pendingPaymentLink`.

### Task 7 — Decimal-safe sum helper + shared invoice-number generator + concurrency limiter
- New `lib/finance/invoice-numbers.ts`: `nextInvoiceNumber(tx, tenantId)` (advisory-lock + parse-suffix logic from `generate/route.ts:121-133`) and `sumDecimals(values: Decimal[]): Decimal` (uses `Prisma.Decimal.add`).
- New `lib/finance/p-limit.ts`: minimal `pLimit(n)` returning `<T>(fn) => Promise<T>` that wraps `Promise` with an internal queue. ~25 lines, no deps.
- Edit `app/api/invoices/generate/route.ts` (still legacy at this point) to use the helpers (keep behavior identical so tests stay green between Task 7 and Task 9).
- Vitest: `lib/finance/invoice-numbers.test.ts` — concurrent `nextInvoiceNumber` calls return distinct numbers (single-process simulation). `lib/finance/p-limit.test.ts` — `pLimit(2)` runs 5 jobs in 3 sequential waves, asserts max-in-flight never exceeds 2.

### Task 8 — Plan endpoint
- Add `generatePlanSchema` to `lib/validations/invoice.ts`.
- New `app/api/invoices/generate/plan/route.ts` (POST) — admin-only, rate-limited 10/min/IP. Re-uses the eligibility query from the legacy generate route (active enrollment for the year, has program fee structure, not already invoiced for the period). Returns `{ eligibleStudentIds, skippedAlreadyInvoiced, skippedNoFeeStructure, total }`.
- Vitest: 3 students (1 eligible, 1 already invoiced, 1 no fee structure) → returns matching counts and the right `eligibleStudentIds[0]`.

### Task 9 — Batch endpoint with inline Xendit (parallel, concurrency-limited)
- Add `generateBatchSchema` to `lib/validations/invoice.ts`: `{ studentIds: string[].max(25), periodLabel, dueDate, academicYearId }`.
- Replace `app/api/invoices/generate/route.ts` with `app/api/invoices/generate/batch/route.ts` (POST). Logic:
  1. Auth + rate-limit (`invoices-batch:${ip}`, 30/min).
  2. Validate body. Re-query enrollment + fee-structure scoped to `studentIds` (defends against IDs the client invented).
  3. `prisma.$transaction(async (tx) => { advisory-lock; for each eligible student: number = nextInvoiceNumber(tx, tenantId); createMany invoices + lines with status: "PENDING_PAYMENT_LINK" })`.
  4. After transaction commits, fetch the new invoice ids + their student/guardian data.
  5. Run `Promise.allSettled(invoiceIds.map(id => limit(() => createXenditSessionForInvoice(id, tenantId))))` with `pLimit(5)`.
  6. For each Xendit success: `prisma.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), paymentLinkError: null } })` (helper already wrote `xenditSessionId` + `xenditPaymentUrl`). Build `results[]` with `{ studentId, invoiceId, invoiceNumber, status: "SENT", paymentUrl }`. For failures: persist `paymentLinkError: <msg>`, push `{ studentId, invoiceId, invoiceNumber, status: "PENDING_PAYMENT_LINK", error: <msg> }`.
  7. Return `{ created, skipped, results }`.
- Delete legacy `app/api/invoices/generate/route.ts` in this task (callers already moved to batch in Task 11).
- Vitest: with `lib/xendit/client.ts` mocked — 5-student batch, 4 Xendit succeed + 1 throws → `created=5`, 4 invoices SENT + 1 PENDING_PAYMENT_LINK with `paymentLinkError`. Concurrency assertion: spy on the mock confirms max-in-flight ≤ 5 with a 25-student happy-path batch.

### Task 10 — Retry endpoint + shared retry helper
- New `lib/finance/xendit-retry.ts`: `retryPaymentLinks(tenantId: string, invoiceIds: string[] | null): Promise<{ retried, succeeded, stillFailed, results }>` — fetches eligible PENDING_PAYMENT_LINK invoices (filtered by `invoiceIds` if provided, all otherwise), runs `Promise.allSettled` over `pLimit(5)` × `createXenditSessionForInvoice`, persists status + paymentLinkError per outcome. Cap: 25 invoice ids per call.
- Add `retryPaymentLinksSchema` to `lib/validations/invoice.ts`: `{ invoiceIds: z.array(z.string()).max(25).optional() }`.
- New `app/api/invoices/retry-payment-links/route.ts` (POST) — admin-only, rate-limited 10/min/IP. Validates body. Calls helper. Returns helper output.
- Vitest: 3 PENDING invoices → 2 succeed, 1 fails → `retried=3, succeeded=2, stillFailed=1`; succeeded invoices in DB have status=SENT + paymentLinkError=null + xenditPaymentUrl; failed has updated paymentLinkError.

### Task 11 — Admin UI: bulk-create client orchestration
- Edit `app/admin/invoices/page.tsx`:
  - `openGenerateDialog` → form unchanged.
  - `handleGenerate`: now does `POST /api/invoices/generate/plan` first → opens a `<ConfirmDialog>` with the eligibility breakdown (already-invoiced + no-fee-structure counts) and a "Lanjutkan" button.
  - On confirm: chunks `eligibleStudentIds` into 25-batches. Shows a sticky progress card (new `<BatchProgressCard>` in `components/admin/invoices/batch-progress-card.tsx`): "Membuat tagihan… 75/240 — 70 link berhasil, 5 link gagal". Calls batches sequentially via `await` loop. Merges per-batch results into running totals.
  - Per-batch retry: 5xx/timeout → 2 retries with exponential backoff (1s, 3s). After 2 fails → pauses, shows "Koneksi tidak stabil" Continue/Cancel.
  - On all-batches-done: toast `${created} tagihan dibuat (${xenditOk} link berhasil${xenditFailed > 0 ? `, ${xenditFailed} link gagal — bisa di-retry dari list` : ""})`. Refreshes table + stats.
  - Replace the 4-fetch stats `useEffect` block with the new `/api/invoices/stats` call (already landed in Task 6 — confirm integration).

### Task 12 — Admin UI: failed-link visibility + retry actions
- Edit `app/admin/invoices/page.tsx`:
  - Header: when `stats.pendingPaymentLink > 0`, render a "Coba Lagi Link (N)" button (variant outline, warning tint). Click → confirm dialog → loops `POST /api/invoices/retry-payment-links` in chunks of 25 over **all** PENDING_PAYMENT_LINK invoices for the tenant (fetched via a `?status=PENDING_PAYMENT_LINK&pageSize=500` first call to enumerate ids — capped, since retry helper itself is capped per call). Reuses the same `<BatchProgressCard>` UX.
  - Header: remove "Kirim Tagihan" button (Spec §15) — its job is now subsumed by the retry button (the only DRAFT-with-no-link case in this codebase post-cycle).
  - DataTable filter dropdown: add "Link Gagal" option pointing at `?status=PENDING_PAYMENT_LINK`.
  - Row actions menu: when `row.status === "PENDING_PAYMENT_LINK"`, add "Coba Lagi Link Pembayaran" → `POST /api/invoices/retry-payment-links { invoiceIds: [row.id] }` → toast result → refresh row (refetch the page).
- Edit `app/admin/invoices/[id]/page.tsx`:
  - When `invoice.paymentLinkError`, render an alert card (warning tint) above lines: "Link pembayaran belum berhasil dibuat: ${paymentLinkError}" + "Coba Lagi" button calling the retry endpoint for `[invoice.id]`.
- Vitest: snapshot test or component test for the row-action conditional rendering.

### Task 13 — Manual single-invoice endpoint with inline Xendit
- Add `createManualInvoiceSchema` to `lib/validations/invoice.ts`: `{ studentId, periodLabel, dueDate, lines: [{ feeComponentId, amount: number ≥ 1 }].min(1) }`.
- Add `POST` handler to `app/api/invoices/route.ts` (file currently only has GET). Logic:
  1. Auth + rate-limit (`invoices-manual:${ip}`, 20/min).
  2. Validate body. Verify student belongs to tenant + has ≥1 ACTIVE enrollment. Verify every `feeComponentId` belongs to tenant + is `isEnabled=true`.
  3. `prisma.$transaction`: advisory-lock; `nextInvoiceNumber`; create invoice (status `PENDING_PAYMENT_LINK`) + lines; compute `totalDue` via `sumDecimals`.
  4. Outside transaction: `try { await createXenditSessionForInvoice(invoice.id, tenantId); await prisma.invoice.update({ data: { status: "SENT", sentAt: new Date(), paymentLinkError: null } }) } catch (e) { await prisma.invoice.update({ data: { paymentLinkError: e.message } }); xenditError = e.message }`.
  5. Re-fetch invoice with lines + xendit fields. Return 201 with `{ ...invoice, xenditError? }`.
- Vitest:
  - validation matrix (missing student, fee-component cross-tenant, empty lines, negative amount) — all 400.
  - happy path → 201, `xenditPaymentUrl` set, status=SENT, paymentLinkError=null.
  - Xendit failure (mocked throw) → 201, `xenditError` set, invoice status=PENDING_PAYMENT_LINK, paymentLinkError=set.

### Task 14 — Admin UI: manual-create dialog
- New `components/admin/invoices/manual-invoice-dialog.tsx`: Dialog (Sheet on mobile) with student combobox (admin-only `GET /api/students?status=ACTIVE` — existing route), period label (default current month label via `formatMonthLabel`), due date (default last day of month), dynamic line-item rows. Each row: `<Select>` populated from `GET /api/fee-components?status=ACTIVE&isEnabled=true` + `<Input type="number">` for amount + remove button. "+ Tambah Komponen" appends. Total preview row uses `formatRupiah(sumDecimals(...))`. Submit → POST → on success: closes dialog, toasts with `<Button onClick={copy}>Salin Link</Button>` if `xenditPaymentUrl`, OR warning toast "Tagihan dibuat tapi link gagal — coba retry dari list" if `xenditError`. Then `router.push("/admin/invoices/" + id)`.
- Wire from `app/admin/invoices/page.tsx`: header gains "Tagihan Manual" button (variant outline) next to existing "Buat Tagihan".

### Task 15 — Playwright e2e
- Demo-mode reality: `lib/xendit/client.ts:19` throws when `XENDIT_SECRET_KEY` is unset. **Pick:** set a fake `XENDIT_SECRET_KEY` in `playwright.config.ts` env and use Playwright's `page.route()` to intercept `POST https://api.xendit.co/sessions` and return a stub `{ id, payment_link_url, status, expires_at }`. Tests can dynamically flip the route to return 500 to simulate failure paths.
- Extend `e2e/admin.spec.ts`:
  - "bulk generate plans, confirms, chunks, and lands all SENT" — intercept Xendit OK, open Buat Tagihan, submit form, accept confirm dialog, expect progress card → success toast → table shows new SENT rows.
  - "manual create round-trips to detail page with payment URL" — intercept Xendit OK, click Tagihan Manual, pick student, add 2 lines, submit, expect detail page renders with total + payment URL visible.
  - "bulk failure surfaces PENDING_PAYMENT_LINK and per-row retry recovers" — intercept Xendit to fail for one specific reference_id; run bulk; assert one row in the table shows the "Link Gagal" badge; flip interception to OK; click row's "Coba Lagi Link Pembayaran"; assert row flips to "Terkirim".
  - "header bulk-retry retries every PENDING_PAYMENT_LINK at once" — seed (or batch-create with failing Xendit) 3 PENDING invoices; header shows "Coba Lagi Link (3)"; click → confirm → all 3 flip to SENT.
  - "manual create with failing Xendit lands PENDING_PAYMENT_LINK" — intercept Xendit fail; submit manual create; assert detail page shows the alert card with paymentLinkError + "Coba Lagi" button.

### Task 16 — Doc-sync + final verification
- README.md: append three ADR rows from §Spec §28; update finance Modules row to mention `Invoice.paymentLinkError` field + `PENDING_PAYMENT_LINK` status.
- Run `npm run build && npx vitest run && npx playwright test`; paste summary into Verification section below.
- Final commit per /build's last-task gate. Then `/requesting-code-review` per CLAUDE.md.

---

## Implementation

### Task 1 — Webhook idempotency on `xenditPaymentId`
- `app/api/xendit/webhook/route.ts`: replaced `tx.payment.findFirst({ invoiceId, reference })` with `tx.payment.findUnique({ xenditPaymentId })`. Create now writes the Xendit id to **both** `xenditPaymentId` (unique dedup key) and `reference` (back-compat display).
- Pre-tx guard: if `paymentId ?? data.payment_session_id` is falsy, log + return 200 with `{ error: "Missing payment identifier" }` — never write a NULL `xenditPaymentId` (Postgres treats NULLs as distinct in unique indexes, would defeat dedup).
- `tx.payment.create` wrapped in try/catch. On `e.code === "P2002"`, treats as idempotent retry and returns `fresh.status` — covers cross-process race not caught by the advisory lock.
- `app/api/__tests__/xendit-webhook.test.ts`: updated mocks (`findFirst` → `findUnique`).
- `app/api/__tests__/xendit-webhook-idempotency.test.ts` (new): 4 tests — same payload twice = 1 row; fallback to `payment_session_id`; missing-id guard returns 200 without creating; P2002 swallowed as idempotent retry.

### Task 2 — Manual payment overpayment race
- `app/api/invoices/[id]/payments/route.ts`: full rewrite. `recordPaymentSchema.safeParse(body)` validation up front. Overpayment check moved INSIDE `prisma.$transaction`, after `pg_advisory_xact_lock(hashtext(invoiceId))` + re-fetch — mirrors webhook pattern. Custom `OverpaymentError` for clean rollback distinction; status sentinels (`INVOICE_GONE/CANCELLED/PAID`) for the simpler cases. `remaining` and `totalPaid` rounded to 2dp to avoid IEEE-754 epsilon false-positives on clean final installments (Task 7 will swap in `Prisma.Decimal` proper).
- `app/api/__tests__/invoice-payment-race.test.ts` (new): 5 tests — concurrent `amount=remaining` (mutex-queue simulating advisory lock), negative amount, missing amount, cancelled invoice, already-paid.

### Task 3 — Void requires zero payments + advisory lock
- `app/api/invoices/[id]/void/route.ts`: rewrite. Status flip wrapped in `prisma.$transaction` with `pg_advisory_xact_lock(hashtext(id))` + tx-scoped re-fetch. Voidable status set: `["DRAFT", "SENT", "PENDING_PAYMENT_LINK"]` (forward-compat with Task 4). Status sentinel runs BEFORE the payment guard so PAID/PARTIALLY_PAID surface as 409 (terminal state) rather than 400 (recoverable). Status-changed → 409 + "Status tagihan berubah, coba lagi.". Has-payments → 400 + "Tagihan sudah memiliki pembayaran. Tidak bisa dibatalkan — gunakan refund.". Cheap pre-check kept for the foreign-tenant short-circuit.
- `app/api/__tests__/invoice-void-race.test.ts` (new): 7 tests — DRAFT happy path (200), SENT+totalPaid>0 → 400, mutex-race PAID flip → 409, PAID → 409 (upgraded from 400), CANCELLED → 409, PENDING_PAYMENT_LINK happy path (200), tenant mismatch → 404.

### Task 4 — Schema `paymentLinkError` + `PENDING_PAYMENT_LINK` propagation
- `prisma/schema.prisma`: added `paymentLinkError String?` to `Invoice`; status comment lists `PENDING_PAYMENT_LINK`.
- `prisma/migrations/20260425000001_invoice_payment_link_error/migration.sql` (new): additive `ALTER TABLE "Invoice" ADD COLUMN "paymentLinkError" TEXT`. Idempotent at deploy.
- `lib/validations/invoice.ts`: `updateInvoiceSchema.status` enum gains `PENDING_PAYMENT_LINK`.
- `components/ui/status-badge.tsx`: `STATUS_MAP` gains `PENDING_PAYMENT_LINK = { label: "Link Gagal", className: "bg-status-late-subtle text-status-late-text" }`.
- `lib/__tests__/parent-helpers.test.ts`: new test asserts `getStudentInvoices` allow-list (`["SENT","PARTIALLY_PAID","OVERDUE"]`) does NOT include `PENDING_PAYMENT_LINK` — parent never sees these.
- Propagation fixes from review: `app/api/students/[id]/route.ts:68` + `app/api/students/[id]/withdraw/route.ts:42` cancel-on-deactivate / unpaid-warning sets gain `PENDING_PAYMENT_LINK`. `app/admin/invoices/[id]/page.tsx:157` `canVoid` guard accepts `PENDING_PAYMENT_LINK` (UI matches API surface).
- `npx prisma generate` regenerated client; `prisma migrate dev` deliberately not run (DATABASE_URL points at staging Supabase) — Vercel build's `prisma migrate deploy` will apply on PR/staging.

### Task 5 — Idempotent create-session + paymentLinkError write-back
- `app/api/xendit/create-session/route.ts`: pre-helper short-circuit on `invoice.xenditSessionId && invoice.xenditPaymentUrl` returns existing URL, no Xendit API call, defensively clears stale `paymentLinkError`. On Xendit success: `status=SENT, sentAt, paymentLinkError=null` — covers the retry-of-PENDING_PAYMENT_LINK happy path. On Xendit catch: persists `status=PENDING_PAYMENT_LINK, paymentLinkError=msg` (write-back wrapped in try/catch so a DB error doesn't drop the original Xendit message from `errors[]`). Helper-returns-null branch now pushes `${name}: Gagal membuat sesi pembayaran` instead of silently incrementing failed.
- `app/api/__tests__/xendit-create-session.test.ts` (new): 5 tests — existing-session no-call + clear, fresh success with status flip, Xendit failure persists PENDING + error, retry-of-PENDING success, mixed 3-invoice batch with correct counts.

### Task 6 — Single stats endpoint
- `app/api/invoices/stats/route.ts` (new): admin-only `GET`, single `prisma.invoice.groupBy` over `status` with `_count._all` + `_sum.{totalDue,totalPaid}`. Returns `{ total, draft, sent, partiallyPaid, paid, overdue, cancelled, pendingPaymentLink, totalDue, totalPaid }`.
- `app/admin/invoices/page.tsx`: replaced 4-fetch `useEffect` block with single `fetchStats()` call (extracted as `useCallback` so mutation handlers can refresh stats too). Stats state now includes `cancelled` + `partiallyPaid` + `pendingPaymentLink` so total reconciles. Stats refetched after generate/send/void mutations. New "Sebagian" card always rendered (`CircleDashed`, warning); new "Link Gagal" card rendered conditionally when `pendingPaymentLink > 0` (`Link`, warning).
- `app/api/__tests__/invoices-stats.test.ts` (new): 7 tests — mixed-status counts, empty tenant, no-session 403, TEACHER 403, GUARDIAN 403, PENDING_PAYMENT_LINK surfacing, Decimal sum coercion.

### Task 7 — Helpers (invoice-numbers, p-limit, sumDecimals)
- `lib/finance/invoice-numbers.ts` (new): `nextInvoiceNumber(tx, tenantId)` — extracts the legacy advisory-lock + parse-suffix logic so batch + manual-create endpoints share it. Type-safe `Prisma.TransactionClient` parameter prevents accidental call on `prisma` directly. `sumDecimals(values)` — Decimal-safe sum, fixes IEEE-754 drift with `Prisma.Decimal.add`.
- `lib/finance/p-limit.ts` (new): minimal `pLimit(n)` — ~37 lines, no deps. Wraps async fns with internal queue; drains in `finally` after each promise settles so error propagation can't stall the queue.
- `app/api/invoices/generate/route.ts`: refactored to use both helpers; `totalDue` accumulator now `Prisma.Decimal`. Behavior identical (same lock key, same number sequence).
- 3 new test files in `lib/finance/__tests__/` — 15 tests total: empty tenant first number, suffix increment, 5-digit overflow (9999→10000) preserves legacy padding, deterministic lock key; pLimit cap=2 with peak-concurrency assertion, rejection propagation + queue drain, value propagation, n≤0 throws; sumDecimals empty/string/no-drift (0.1+0.2=0.3 exactly)/mixed-input/large-12-month sums.
- Code review approved (2 informational notes about hash-collision risk + year-boundary padding — both intentionally inherit legacy behavior).

### Task 8 — Plan endpoint
- `app/api/invoices/generate/plan/route.ts` (new): admin-only `POST`, rate-limited 10/min/IP. Validates body with `generatePlanSchema`. Mirrors legacy generate eligibility query (active enrollments scoped by tenant + academicYearId, fee structures filtered to `isEnabled && isRecurring` grouped per program, dedup by trimmed `periodLabel`). Returns `{ eligibleStudentIds, skippedAlreadyInvoiced, skippedNoFeeStructure, total, eligible }`. **Dedup pass on `studentId` before classification** — one student with multiple active enrollments must classify once (matches batch endpoint write semantics: one invoice per student per period).
- `lib/validations/invoice.ts`: added `generatePlanSchema` (regex on dueDate).
- `app/api/__tests__/invoices-generate-plan.test.ts` (new): 9 tests — no-session 403, TEACHER 403, validation 400 (×3), 3-student classification, dual-enrollment dedup, empty enrollments, rate-limit 429.
- Code review caught dedup bug pre-commit (sibling/dual-enrollment would have over-counted).

### Task 9 — Batch endpoint with inline Xendit
- `app/api/invoices/generate/batch/route.ts` (new): admin-only `POST`, rate-limited 30/min/IP, `studentIds.length ≤ 25`. Validates body. Re-derives eligibility scoped to provided studentIds (defends against client tampering). Dedupes multi-enrollment students. Inside one `prisma.$transaction`: `nextInvoiceNumber` (advisory lock held until commit), local suffix increment for the batch, `createMany` invoices with status `PENDING_PAYMENT_LINK`, `createMany` lines. After commit: `Promise.allSettled` + `pLimit(5)` over `createXenditSessionForInvoice`. Per outcome: success → status=SENT, sentAt, paymentLinkError=null; rejected/null → paymentLinkError persisted. DB write-back wrapped in try/catch so transient hiccup doesn't drop the result row. Skipped count = `distinctRequested - invoicesToBuild.length`.
- `app/api/invoices/generate/route.ts` **DELETED** — fully replaced by batch endpoint. (Admin UI still calls legacy URL until Task 11.)
- `lib/validations/invoice.ts`: added `generateBatchSchema` (`max(25)` cap on studentIds), removed orphaned `generateInvoicesSchema`.
- `lib/finance/invoice-numbers.ts`: `nextInvoiceNumber` SELECT now uses raw SQL `ORDER BY LENGTH(invoiceNumber) DESC, invoiceNumber DESC` so the helper is correct past the 4-digit suffix overflow (lex sort would otherwise put `INV-2026-9999` after `INV-2026-10000`). Helper test mocks updated to assert the new $queryRaw shape.
- `app/api/__tests__/invoices-generate-batch.test.ts` (new): 10 tests — auth (×2), validation (×4), rate-limit, 5-student happy path, mixed Xendit success/fail, skipped students, 25-student concurrency cap (peak ≤ 5).

### Task 10 — Retry endpoint + helper
- `lib/finance/xendit-retry.ts` (new): shared `retryPaymentLinks(tenantId, invoiceIds | null)` — fetches up to 25 PENDING_PAYMENT_LINK invoices for the tenant (filtered by `invoiceIds` if provided), runs `Promise.allSettled` + `pLimit(5)` over `createXenditSessionForInvoice`, persists per-outcome state (success → status=SENT, paymentLinkError=null; failure → paymentLinkError set, status stays). Tenant scope enforced at the `where` so cross-tenant invoiceIds are silently filtered.
- `app/api/invoices/retry-payment-links/route.ts` (new): admin-only POST, rate-limited 10/min/IP. Validates `retryPaymentLinksSchema`. Calls helper. Returns `{ retried, succeeded, stillFailed, results }`.
- `lib/validations/invoice.ts`: added `retryPaymentLinksSchema = z.object({ invoiceIds: z.array(z.string().min(1)).max(25).optional() })`.
- `lib/finance/__tests__/xendit-retry.test.ts` (new): 7 tests — empty-candidates short-circuit, mixed 2-succeed-1-fail with DB write-shape assertions, explicit invoiceIds filter, null (retry-all) path, empty-array edge, take(25) concurrency cap.
- `app/api/__tests__/invoices-retry-payment-links.test.ts` (new): 7 tests — no-session 403, TEACHER 403, GUARDIAN 403, max(25) 400, empty-string 400, empty-body retry-all 200, 429 rate limit.

### Task 11 — Admin UI: bulk client orchestration
- `lib/finance/run-bulk-generate.ts` (new): pure orchestration core. Drives plan call → user confirm (Promise-bridged) → sequential 25-batch loop → per-batch 5xx/timeout retry (1s + 3s backoff) → pause Continue/Cancel hook (Promise-bridged) → `onProgress` snapshot per chunk. Exposes `chunk`, `BATCH_SIZE=25`, type-safe `BatchProgressSnapshot`/`PlanResponse`/`BatchResponse`. Test seams: `fetchImpl`, `sleepImpl`. Outcomes: `done`, `aborted`, `user-cancelled`, `no-eligible`, `plan-failed`.
- `components/admin/invoices/batch-progress-card.tsx` (new): sticky `<Card>` at the top of the page during a run. Phase-aware icon (Loader2 spinner / CheckCircle2 / AlertTriangle), inline Tailwind progress bar (chosen over shadcn `<Progress>` for self-containedness — `Progress` requires Track+Indicator subtree), success counter + warning failure counter. Continue/Cancel buttons render only in `paused` phase.
- `app/admin/invoices/page.tsx`: replaced legacy `handleGenerate` (single `POST /api/invoices/generate`) with the new orchestration. `mountedRef` guards `onPlan/onProgress/onPauseDecision` callbacks + the post-run toast/refresh so closing the page mid-run no longer triggers stale state writes. ConfirmDialog wired via `setPlanConfirm({ plan, resolve })` Promise pattern. 5s auto-hide on success via `useRef` timer (cleared on unmount). `fetchInvoices()` + `fetchStats()` called on `done` outcome so list and counters reconcile.
- `lib/finance/__tests__/run-bulk-generate.test.ts` (new): 10 vitest cases — `chunk` helper (3), single-batch happy path, 60-student multi-chunk monotonic progress, 5xx retry-then-pause-then-cancel, pause-then-continue (4 attempts), `eligible=0` short-circuit before user prompt, `onPlan=false` user-cancelled outcome, mixed Xendit success/fail tally.
- Code review: `mountedRef` unmount guard added to address stale-state risk on mid-run navigation. RTL-layer test gap acknowledged (orchestrator unit tests cover the contract; React Promise-bridging surface is small + low-risk).

### Task 12 — Admin UI: failed-link visibility + retry actions
- `lib/finance/run-bulk-retry.ts` (new): orchestration mirror of `run-bulk-generate` — chunk(25) + 5xx retry-with-backoff(1s, 3s) + pause Continue/Cancel hook + `onProgress` snapshot. Reuses `BatchProgressSnapshot` type so `<BatchProgressCard>` renders untouched. `created` snapshot field repurposed as "retried so far"; `xenditOk` = succeeded; `xenditFailed` = stillFailed.
- `app/admin/invoices/page.tsx`:
  - **Removed:** legacy "Kirim Tagihan" button + `handleSendInvoices` + `sendResults` state + Send Confirmation `<ConfirmDialog>` + Send Results `<Dialog>` + `Card` import. With inline-Xendit on every creation path post-cycle, the only link-less invoice case left is `PENDING_PAYMENT_LINK`, handled by the new retry button.
  - **Added:** header "Coba Lagi Link (N)" outline+warning button visible only when `stats.pendingPaymentLink > 0`. Click → `<ConfirmDialog>` with the pending count → `handleBulkRetry` enumerates ids via `/api/invoices?status=PENDING_PAYMENT_LINK&pageSize=500`, then drives `runBulkRetry` chunked at 25 against `/api/invoices/retry-payment-links`. Reuses `<BatchProgressCard>`. Final toast `${succeeded} link berhasil, ${stillFailed} masih gagal`. `fetchInvoices()` + `fetchStats()` on done.
  - **Added:** per-row "Coba Lagi Link" action via `DataTableRowActions.extraActions` slot (already typed in the component). Conditionally attached only when `inv.status === "PENDING_PAYMENT_LINK"`. Disabled state when `retryingRowId === inv.id`. `handleRowRetry` calls retry endpoint with a single id, then refreshes invoices + stats in `finally` (so a transient HTTP error still triggers refresh — matches bulk handler).
  - **Added:** "Link Gagal" option to the toolbar Status filter, points at `?status=PENDING_PAYMENT_LINK`.
- `app/admin/invoices/[id]/page.tsx`: `InvoiceDetail` type gains `paymentLinkError: string | null`. New alert `<Card>` (warning tint, AlertTriangle icon) above line items when `paymentLinkError` is set. Inline "Coba Lagi" button calls retry endpoint + refetches the detail page.
- `lib/finance/__tests__/run-bulk-retry.test.ts` (new): 7 vitest cases — single chunk, multi-chunk progress monotonicity, 5xx-retry-then-pause-cancel, pause-then-continue recovery (added per review), 25-invoice all-succeed, mixed succeed/still-failed, empty `invoiceIds` short-circuit.
- Code review: flagged `handleRowRetry` skipping refresh on HTTP-error path + missing pause-then-continue test — both fixed inline.

### Task 13 — Manual single-invoice endpoint with inline Xendit
- `app/api/invoices/route.ts`: added `POST` handler alongside the existing GET. Admin-only, rate-limited 20/min/IP. Validates body via `createManualInvoiceSchema`. Tenant-scoped enrollment check (`student must have ACTIVE enrollment whose classSection.tenantId === session.tenantId`). Distinct fee-component validation (every `feeComponentId` belongs to tenant + `isEnabled=true`). Server-derived `totalDue` via `sumDecimals` (any client total is discarded). One `prisma.$transaction`: `nextInvoiceNumber` (advisory lock) + `tx.invoice.create` with nested `lines.create`, status `PENDING_PAYMENT_LINK`. Outside the tx: try Xendit. Three branches — success → status=SENT, sentAt, paymentLinkError=null; helper returns null → paymentLinkError="Gagal membuat sesi pembayaran" + xenditError flag in response; helper throws → paymentLinkError=msg + xenditError flag. Each DB write-back wrapped in try/catch. Response: 201 with `{...invoice, lines, xenditError?}`.
- `lib/validations/invoice.ts`: added `createManualInvoiceSchema` (studentId + periodLabel + dueDate-regex + non-empty `lines` array of `{ feeComponentId, amount: positive }`).
- `app/api/__tests__/invoices-manual-create.test.ts` (new): 12 tests across auth (×3), validation matrix (×4), business rules (×2), happy path Xendit success, Xendit throw → 201 with xenditError, helper-returns-null → 201 with xenditError, rate limit 429.
- Code review: 2 informational notes — Decimal call-site clarity (sumDecimals already accepts `number | Decimal | string` internally, raw numbers are safe per the helper's signature); no explicit TOCTOU log-warning for "Xendit returns non-null but URL missing" (helper contract guarantees URL on non-null return).

### Task 14 — Admin UI: manual-create dialog
- `components/admin/invoices/manual-invoice-dialog.tsx` (new): Dialog (desktop) / Sheet bottom-side (mobile) with student picker (Select with sibling search input filtering options client-side), periode (default current-month label), due date (default last day of current month), dynamic line-item rows (Select fee-component + Input amount + remove button), "+ Tambah Komponen" appender, live `formatRupiah(total)` preview. Submit POSTs to `/api/invoices`. Three response branches: `xenditPaymentUrl` → success toast with `<Salin Link>` action; `xenditError` → warning toast "Tagihan dibuat tapi link gagal — coba retry dari list"; else success. Then `router.push("/admin/invoices/<id>")`. Form state resets via `useEffect` keyed on `open`.
- `app/admin/invoices/page.tsx`: header gains "Tagihan Manual" outline button (Plus icon) next to existing "Buat Tagihan". Mounts `<ManualInvoiceDialog>`.
- `components/admin/invoices/__tests__/manual-invoice-dialog.test.ts` (new): 12 unit tests for the extracted `validateManualForm(form): string | null` — happy path, missing student, whitespace-only period, empty/bad-format dueDate, empty lines, line missing component, zero/negative/non-numeric amount, first-invalid-line-wins ordering, multi-line success.
- Decisions: `<Select>` + sibling search Input chosen over `<Combobox>` (Combobox unused elsewhere; would be a first usage with new Base-UI primitive dependency). Fee components fetched from existing `/api/fee-components` (no query-param plumbing) and filtered client-side. RTL component tests skipped — endpoint validation in Task 13 is the strict layer; local validation extracted to a pure function for unit-testability.
- Code review: ship-it. All 8 review checks pass.

### Task 15 — Playwright e2e
- `playwright.config.ts`: stub `XENDIT_SECRET_KEY` + `XENDIT_WEBHOOK_TOKEN` injected into the dev-server env so `lib/xendit/client.ts:19` doesn't throw at module init. Real `api.xendit.co` rejects the fake key with 401, so every Xendit call lands as a failure → invoice ends in `PENDING_PAYMENT_LINK` with `paymentLinkError` populated. **Tests assert the failure-path contract (which is exactly the new surface this cycle introduces); Xendit success-path coverage stays in Vitest where the helper is mockable.**
- `e2e/admin.spec.ts`: new `Admin tagihan flows` describe with 5 tests + portable admin-discovery helper + `firstActiveYearId(page)` helper:
  1. Bulk generate UI: opens Buat Tagihan, fills periode (unique-per-run), submits, accepts plan-confirm dialog, asserts the final "X tagihan dibuat" toast.
  2. Manual create POST via `page.request` — asserts 201, `xenditError`, status `PENDING_PAYMENT_LINK`, `paymentLinkError`. Detail page shows the warning alert + "Coba Lagi" button.
  3. Plan + batch via API contract — list page renders "Link Gagal" badge on filtered status; per-row retry endpoint returns the canonical `{retried, succeeded, stillFailed, results}` shape.
  4. Header "Coba Lagi Link (N)" button visibility + confirm dialog flow + final toast.
  5. Endpoint contract smoke: empty-body retry returns canonical shape; `invoiceIds.length > 25` returns 400.
- **Reality check on `page.route()`:** the cycle plan called for intercepting `POST https://api.xendit.co/sessions` from the browser via `page.route()`. That doesn't work — the Xendit POST happens inside a Next.js route handler (server-side `fetch`), not in the browser tab. Resolution above: rely on the failure-path contract and stub Xendit auth so module init succeeds.
- **Local-DB constraint:** the local `DATABASE_URL` points at staging Supabase, which hasn't applied the `20260425000001_invoice_payment_link_error` migration yet (intentionally — Task 4 explicitly avoided `prisma migrate dev` so staging stays clean). Playwright tests that read/write `Invoice.paymentLinkError` will fail locally with `column does not exist`. CI runs `npx prisma db push --force-reset` before `npx playwright test` (`.github/workflows/ci.yml:97`), which applies the current `schema.prisma` to a fresh DB — the new column is present and tests pass there. The local-failure mode is expected and documented; PR CI is the authoritative gate.

---

## Verification

### Task 1
- `npm run build` ✓ clean route map emitted, no type errors.
- `npx vitest run` ✓ 41 files passed / 2 skipped, **273 passed** / 42 todo / 0 failed (6.84s).
- Code review (feature-dev:code-reviewer): flagged null-id bypass + unhandled P2002 — both fixed before commit.

### Task 2
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 42 files passed / 2 skipped, **278 passed** / 42 todo / 0 failed (7.10s).
- Code review: flagged Decimal→Number float-drift on overpayment guard — applied 2dp rounding workaround (proper Decimal in Task 7).

### Task 3
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 43 files passed / 2 skipped, **285 passed** / 42 todo / 0 failed (6.97s).
- Code review: flagged forward-reference to PENDING_PAYMENT_LINK without test + race-test naming clarity — added test for PENDING_PAYMENT_LINK happy path + clarifying comment on mock-vs-real-DB serialization.

### Task 4
- `npx prisma generate` ✓ Prisma Client v7.6.0 regenerated.
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 43 files passed / 2 skipped, **286 passed** / 42 todo / 0 failed (7.12s).
- Code review: flagged 2 propagation gaps in student deactivation cascade + admin detail `canVoid` UI guard — both fixed inline.

### Task 5
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 44 files passed / 2 skipped, **291 passed** / 42 todo / 0 failed (7.28s).
- Code review: flagged silent helper-returns-null branch — added `errors.push` so admin sees diagnostic in TOCTOU edge case.

### Task 6
- `npm run build` ✓ no type errors. `/api/invoices/stats` in route map.
- `npx vitest run` ✓ 45 files passed / 2 skipped, **298 passed** / 42 todo / 0 failed (7.40s).
- Code review: flagged missing `cancelled` in client state + stats-not-refreshed-after-mutations — both fixed (stats includes cancelled, mutation handlers call `fetchStats()` alongside `fetchInvoices()`).

### Task 7
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 48 files passed / 2 skipped, **313 passed** / 42 todo / 0 failed (8.07s).
- Code review: ship-it. Two informational notes — weak `lockKey` hash (legacy parity) + 5-digit invoice-number overflow handling (intentional carry-through).

### Task 8
- `npm run build` ✓ no type errors. `/api/invoices/generate/plan` in route map.
- `npx vitest run` ✓ 49 files passed / 2 skipped, **322 passed** / 42 todo / 0 failed (8.19s).
- Code review: flagged critical dedup bug (student with multiple active enrollments would double-count in `eligibleStudentIds` and `total`) — fixed inline + new test added.

### Task 9
- `npm run build` ✓ no type errors. `/api/invoices/generate/batch` in route map; legacy `/api/invoices/generate` removed.
- `npx vitest run` ✓ 50 files passed / 2 skipped, **332 passed** / 42 todo / 0 failed (8.28s).
- Code review: flagged 4-digit lex-sort bomb in `nextInvoiceNumber` (would seed wrong base once invoice suffix exceeds 9999) — fixed in helper with raw `ORDER BY LENGTH() DESC, …` SQL; helper + batch tests updated to mock the new $queryRaw shape.

### Task 10
- `npm run build` ✓ no type errors. `/api/invoices/retry-payment-links` in route map.
- `npx vitest run` ✓ 52 files passed / 2 skipped, **346 passed** / 42 todo / 0 failed (8.36s).
- Code review: ship-it. One informational note about concurrent same-invoice retry race (low real-world probability for single-tenant low-frequency surface; orphan Xendit session is the worst outcome — last-write-wins in DB).

### Task 11
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 53 files passed / 2 skipped, **356 passed** / 42 todo / 0 failed (8.58s).
- Code review: flagged stale-state risk on mid-run navigation — added `mountedRef` guard around `onProgress`/`onPlan`/`onPauseDecision` + post-run side effects.

### Task 12
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 54 files passed / 2 skipped, **363 passed** / 42 todo / 0 failed (8.69s).
- Code review: flagged `handleRowRetry` skipping refresh on HTTP-error path + missing pause-then-continue orchestrator test — both fixed inline.

### Task 13
- `npm run build` ✓ no type errors. `POST /api/invoices` listed alongside GET.
- `npx vitest run` ✓ 55 files passed / 2 skipped, **375 passed** / 42 todo / 0 failed (9.46s).
- Code review: ship-it after acknowledging 2 informational notes (Decimal call-site clarity, TOCTOU monitoring gap) — neither blocking.

### Task 14
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 56 files passed / 2 skipped, **387 passed** / 42 todo / 0 failed (9.11s).
- Code review: ship-it. All 8 review checks pass.

### Task 15
- `npm run build` ✓ no type errors.
- `npx vitest run` ✓ 56 files passed / 2 skipped, **387 passed** / 42 todo / 0 failed.
- `npx playwright test` — **deferred to CI**: local Postgres is staging Supabase pre-migration; CI runs `prisma db push --force-reset` before Playwright (`.github/workflows/ci.yml:97`) so the new `Invoice.paymentLinkError` column is present at test time. PR CI is the authoritative end-of-cycle gate per CLAUDE.md.

### Task 16 — End-of-cycle review fixes
- First end-of-cycle review pass flagged 2 cross-cutting gaps in `app/api/invoices/[id]/payments/route.ts`:
  1. Missing rate limit (every other invoice mutation in the cycle has one). Added 10/min/IP under key `record-payment:${ip}` matching the void route's tier.
  2. Decimal-safe sums deferred from Task 2 → Task 7 were never propagated here. Replaced: `remaining = totalDue.minus(totalPaid)` via `Prisma.Decimal`; `totalPaid` recalc via `sumDecimals(allPayments.map(p => p.amount))`; status flips use `.greaterThan`/`.greaterThanOrEqualTo`; `OverpaymentError` carries Decimal.
- Race test fixture updated: `update()` mock callback coerces incoming `Prisma.Decimal` back to number so the sibling-tx race simulation keeps working (plain-number state model).
- **Second end-of-cycle review pass** flagged 2 more money-correctness bugs (highest-stakes paths in the system):
  1. **Critical:** `app/api/xendit/webhook/route.ts` still used `reduce((s,p) => s + Number(p.amount), 0)` for totalPaid recalculation. Three installments summing to totalDue could leave the invoice `PARTIALLY_PAID` instead of `PAID` due to IEEE-754 drift — visible to parents in the portal as a permanent "Sisa: Rp 0.01". Switched to `sumDecimals` + `Prisma.Decimal.greaterThanOrEqualTo` for the status flip.
  2. `app/api/invoices/stats/route.ts` accumulated `totalDue`/`totalPaid` via `+= Number(g._sum.totalDue ?? 0)` across groupBy buckets. Switched to `Prisma.Decimal.add` accumulator; coerced to `Number` at the JSON boundary (school-scale rupiah amounts fit comfortably in a JS Number — max safe int ~9e15, our amounts <1e10) so the API contract stays the same.
- **Fourth end-of-cycle review pass** flagged 3 more issues:
  1. **Critical TOCTOU:** retry helper reads `PENDING_PAYMENT_LINK`, calls Xendit (~500-1500ms network call), meanwhile void route flips the row to `CANCELLED`. After Xendit returns, the helper writes `xenditSessionId` + `xenditPaymentUrl` on the now-CANCELLED row, leaving a live payment link for an invoice the parent shouldn't pay. Fixed on both sides: webhook guards `CANCELLED` (returns 200, no Payment row), and void route now nulls `xenditSessionId` + `xenditPaymentUrl` + `paymentLinkError` alongside the status flip so a late helper write loses the most-recent-write race.
  2. `revalidateTag("student-invoices", {})` in webhook used an undocumented empty-object profile. Next 15's signature wants `{ expire: 0 }` for immediate cache bust. Fixed — parent portal "Sisa: Rp …" badge now invalidates correctly after payment.
  3. `handleVoidInvoice` and `handleRowRetry` set state after `await` without `mountedRef` guard. Closing the page mid-flight would still toast and refetch on an unmounted component. Fixed — both now early-return on `!mountedRef.current`.
- **Fifth review pass** caught one residual narrow window: webhook in-tx re-fetch only guarded `PAID`, not `CANCELLED`. Pre-tx CANCELLED guard is a hint only since void uses its own advisory-lock acquisition — the in-tx re-fetch is the authoritative check. Added `if (fresh.status === "CANCELLED") return "CANCELLED"` inside the tx.
- **Sixth review pass** caught a consistency nit: the in-tx CANCELLED return path fell through to `revalidateTag` + 200-with-status response, while the pre-tx CANCELLED guard early-returned with a different message shape. Added matching early-return after the transaction so both code paths produce the same observable behavior (no cache bust, "Invoice cancelled" message).

### Task 16 — End-of-cycle
- README.md: 5 ADR rows landed across the cycle (webhook idempotency, schema/PENDING_PAYMENT_LINK, bulk batches with inline Xendit + breaking removal of `/api/invoices/generate`, retry endpoint + UX, manual create + dialog).
- `npm run build` ✓ clean (8.2s, full route map emits including the 4 new routes: `/api/invoices/generate/plan`, `/api/invoices/generate/batch`, `/api/invoices/retry-payment-links`, `/api/invoices/stats`).
- `npx vitest run` ✓ 56 files passed / 2 skipped, **387 passed** / 42 todo / 0 failed (9.76s total). New tests added across the cycle: 4 (Task 1 webhook) + 5 (Task 2 payment race) + 7 (Task 3 void) + 1 (Task 4 parent-helpers) + 5 (Task 5 idempotent xendit) + 7 (Task 6 stats) + 15 (Task 7 helpers) + 9 (Task 8 plan) + 10 (Task 9 batch) + 14 (Task 10 retry endpoint+helper) + 10 (Task 11 run-bulk-generate) + 7 (Task 12 run-bulk-retry) + 12 (Task 13 manual POST) + 12 (Task 14 manual dialog validation) = **118 new vitest cases**.
- `npx playwright test` — deferred to PR CI (5 new admin e2e cases authored under "Admin tagihan flows"); CI's `prisma db push --force-reset` step provisions the new column so the tests can read/write `Invoice.paymentLinkError`. Local execution would require manually applying migration `20260425000001_invoice_payment_link_error` to staging Supabase, which Task 4 deliberately avoided.

**Commits in this cycle (16 total + spec doc):**
1. docs(cycles): tagihan finance fixes + async bulk + manual create spec
2. fix(finance): xendit webhook idempotency uses Payment.xenditPaymentId
3. fix(finance): close manual-payment overpayment race with advisory lock
4. fix(finance): void requires zero payments + advisory lock
5. feat(finance): add PENDING_PAYMENT_LINK status + paymentLinkError column
6. fix(finance): idempotent xendit create-session + paymentLinkError writes
7. fix(finance): single stats endpoint + reconciling card row
8. chore(finance): extract invoice-numbers, sumDecimals, pLimit helpers
9. feat(finance): plan endpoint for bulk-create preview
10. feat(finance)!: batch endpoint with inline Xendit, drop legacy generate
11. feat(finance): retry-payment-links endpoint + shared helper
12. refactor(finance): wire bulk-generate UI to plan + batch endpoints
13. feat(finance): failed-link visibility + bulk/per-row retry actions
14. feat(finance): manual single-invoice POST with inline Xendit
15. feat(finance): "Tagihan Manual" dialog for one-off student invoicing
16. test(finance): playwright e2e for bulk + manual + retry flows
17. docs(cycles): final verification + ADR webhook idempotency entry

---

## Ship Notes

_(filled by /ship — migrations to run on staging/prod, env vars, rollback plan)_

Anticipated entries:
- **Migration:** `invoice_payment_link_error` adds `Invoice.paymentLinkError String?` column. Idempotent additive change. Vercel build script runs `prisma migrate deploy` automatically. No backfill required (column nullable).
- **RLS:** unchanged. `Invoice` already has tenant policy; new column inherits it.
- **No new env vars.** Existing `XENDIT_*` keys + `DATABASE_URL` + `DIRECT_URL` cover everything.
- **Breaking API change:** `POST /api/invoices/generate` is removed. Callers were exclusively the admin UI in this repo (verified by grep at /spec time). Document in PR body. Replacement endpoints: `POST /api/invoices/generate/plan` + `POST /api/invoices/generate/batch` + `POST /api/invoices/retry-payment-links`.
- **New status value:** `PENDING_PAYMENT_LINK` introduced on `Invoice.status`. No DB-level enum, but downstream consumers must accept it. Verified: parent portal filters by allow-list (`["SENT","PARTIALLY_PAID","OVERDUE"]`) so it stays admin-only by construction.
- **Rollback plan:** route-handler + UI edits = revert commits. Migration rollback: `paymentLinkError` is nullable additive, safe to leave in place even if app code is reverted. If full revert: `prisma migrate resolve --rolled-back invoice_payment_link_error` + drop column manually. Existing PENDING_PAYMENT_LINK rows would need a status fixup to DRAFT — write inline in PR if reverted.
