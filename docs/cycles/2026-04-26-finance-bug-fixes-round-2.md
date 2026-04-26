# Finance Bug Fixes — Round 2 (Atomic SENT Flip + Schema Tightening + Cache Invalidation)

**Branch:** `claude/tender-kepler-5653b5` (harness-created worktree).
**Predecessor:** [`2026-04-26-finance-followup-fixes.md`](2026-04-26-finance-followup-fixes.md) (PR #141, merged) and [`2026-04-26-finance-yagni-second-pass.md`](2026-04-26-finance-yagni-second-pass.md) (PR #142, merged into staging at `c4c86c0`).
**design-system:** no frontend visual changes — all fixes server-side (API routes, helpers, schemas, webhook). No design-system cross-check needed.

---

## Context

Live finance UX was re-audited after PRs #140/#141/#142 merged. Five real correctness gaps remained — three blockers tagged B1–B3, two mediums tagged M1/M3. All five are server-side.

1. **B1 — TOCTOU between Xendit-session helper and void/webhook.** `createXenditSessionForInvoice` ([`lib/xendit/helpers.ts`](../../lib/xendit/helpers.ts)) read invoice status outside any lock, called Xendit (network round-trip), then wrote `xenditSessionId` + `xenditPaymentUrl` outside any lock — and it was the **caller's job** to do a separate post-call `update({ status: "SENT", sentAt, paymentLinkError: null })`. Both windows were unguarded. Concurrent void or webhook acquiring the per-invoice advisory lock could mark the invoice CANCELLED or PAID *between* the helper's session-creation and the caller's status-flip, leaving a live `xenditPaymentUrl` on a CANCELLED/PAID invoice that a parent could still click.

2. **B2 — `updateInvoiceSchema` accepted any of seven statuses.** [`lib/validations/invoice.ts`](../../lib/validations/invoice.ts) declared `z.enum(["DRAFT","PENDING_PAYMENT_LINK","SENT","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED"])`. The route at [`app/api/invoices/[id]/route.ts`](../../app/api/invoices/[id]/route.ts) only ever switches DRAFT↔SENT — every other transition goes through a dedicated endpoint (void, payments, retry-payment-links, webhook). An admin (or compromised admin token) could PUT `{ status: "PAID" }` and skip the entire payment-recording path: no Payment row, no audit, no Xendit reconciliation, but the invoice marked paid.

3. **B3 — Parent invoice-list cache stale after status flips.** Webhook completion + expiry, manual payment recording, manual void, manual create, batch generate, bulk send, retry-payment-links, and PUT-status-flip all called `revalidateTag("student-invoices")` (the home-page slice) — but **none called `revalidateTag("parent-invoice-list")`** (the dedicated `/parent/invoices` page slice). Parent saw stale invoice rows for up to the cache TTL after every backend transition. Most user-visible: a parent paying via Xendit refreshes `/parent/invoices` and still sees the invoice as "Belum Bayar" — same trust-loss surface that drove PR #141.

4. **M1 — Manual payment POST bypassed Zod.** [`app/api/invoices/[id]/payments/route.ts`](../../app/api/invoices/[id]/payments/route.ts) parsed `body.amount` ad-hoc with `Number(body.amount)` and accepted `body.method ?? "CASH"` — so any string went through, including unknown enum values that Prisma would later reject mid-tx (after the advisory lock acquired, after the invoice update started). The schema `recordPaymentSchema` already exists in [`lib/validations/invoice.ts`](../../lib/validations/invoice.ts) — the route just didn't use it.

5. **M3 — Webhook credited full `totalDue` when `amount` missing.** [`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts) had `paymentAmount = amount ?? Number(invoice.totalDue)`. If a Xendit `payment_session.completed` webhook arrived without a numeric `amount` (provider bug, schema drift, partial capture, or a forged delivery that passes signature check), the route silently credited the invoice's full balance — masking partial captures and amount-mismatch attacks. The signature check stops external forgery, but the fallback path was a self-inflicted attack surface.

**Why now:** parent payment trust is the highest-stakes surface in the app (CLAUDE.md flags it alongside payroll). B1 and B3 directly degrade that trust. B2/M1/M3 are smaller blast radius today (single-tenant, admin role gate, no observed forged deliveries) but are <30-line fixes that close real holes before the multi-tenant phase or the next compromised-admin scenario.

**Out of scope:**
- `payment_session.failed` and `payment_session.refunded` webhook events (separate cycle — needs Xendit account-level investigation).
- OVERDUE batch job (no Vercel-free-tier cron — defer).
- `nextInvoiceNumber` advisory-lock key consolidation (already shipped in PR #141).
- Optimisation of `lib/xendit/helpers.ts` to skip the redundant pre-fetch (correctness, not performance).
- Any UI/visual changes — this cycle is server-side only.

**Assumptions:**
- DRAFT↔SENT is the full set of legal transitions for the generic PUT route. Every other transition has a dedicated endpoint and route.
- A webhook with no numeric `amount` is a bug or attack — never a normal "trust the invoice total" case.
- Atomic helper write-back (status:SENT inside the lock) is preferable to caller-managed two-step. Saves callers from forgetting it and removes the TOCTOU window entirely.
- `revalidateTag("parent-invoice-list")` is cheap to fire per transition; the cost of a missed invalidation (parent sees stale row) far exceeds the cost of an extra invalidation.

---

## Spec

**B1 — Atomic helper:** `createXenditSessionForInvoice` opens a Prisma transaction, acquires `pg_advisory_xact_lock(hashtext(invoiceId))`, re-reads invoice status, refuses to write if status is now PAID/CANCELLED or remaining ≤ 0, then writes session fields + status:SENT + sentAt + paymentLinkError:null in one update. Returns null on guard-trip; caller treats null as soft-failure. Callers no longer do their own post-flip status update — they only call `revalidateTag`.

**B2 — Schema narrowing:** `updateInvoiceSchema.status` accepts only `DRAFT` or `SENT`. PUT route still works for the (rare) admin-DRAFT→admin-SENT path; every other transition stays on its dedicated endpoint.

**B3 — Cache invalidation parity:** every backend code path that flips invoice status (or records a payment that mutates `totalPaid`) fires `revalidateTag("parent-invoice-list", { expire: 0 })` alongside the existing `revalidateTag("student-invoices", { expire: 0 })`. Eight call sites: webhook-completed, webhook-expired, manual-payment, manual-void, manual-create, batch-generate, bulk-send, retry-payment-links, PUT-status.

**M1 — Schema enforcement on payment POST:** route parses body via `recordPaymentSchema.safeParse(raw)`. Returns 400 with the first issue message on failure. Drops the `?? "CASH"` fallback (schema enforces enum membership; the default lives in the schema, not the route).

**M3 — Missing-amount guard on webhook:** before invoice lookup, refuse `payment_session.completed` events with `amount === null`. Mark the WebhookEvent ignored (`status: "IGNORED:missing_amount"`), log loud, return 200. Never fall back to `invoice.totalDue` — `paymentAmount = amount` (post-guard, `amount` is non-null).

**Acceptance:**
- Vitest green: 583+ passed (no regression).
- New M3 test: webhook with `amount: undefined` returns `200 IGNORED:missing_amount`, `prisma.invoice.findUnique` and `prisma.payment.create` both never called.
- B1 helper-contract change reflected in all four affected route tests + one helper test: success-path no longer expects a route-level `prisma.invoice.update` call (helper does it atomically).
- Enum conformance test updated: `Invoice.status` removed from FIELDS table (Zod now narrower than Prisma comment by design — `updateInvoiceSchema` is a *transition* enum, not a value mirror).
- No source change introduces a new dependency, schema migration, or env var.

---

## Tasks

1. **B1** — Refactor [`lib/xendit/helpers.ts`](../../lib/xendit/helpers.ts) to atomic flip inside advisory-lock tx. Update docstring with rationale.
2. **B1 cascade** — Drop post-flip `prisma.invoice.update({ status: "SENT", ... })` from the four success-path callers ([`app/api/invoices/route.ts`](../../app/api/invoices/route.ts) manual-create, [`app/api/invoices/generate/batch/route.ts`](../../app/api/invoices/generate/batch/route.ts) bulk-generate, [`app/api/xendit/create-session/route.ts`](../../app/api/xendit/create-session/route.ts) bulk-send, [`lib/finance/xendit-retry.ts`](../../lib/finance/xendit-retry.ts) retry).
3. **B2** — Narrow `updateInvoiceSchema.status` to `["DRAFT","SENT"]` in [`lib/validations/invoice.ts`](../../lib/validations/invoice.ts).
4. **B3** — Wire `revalidateTag("parent-invoice-list", { expire: 0 })` into eight call sites: webhook (completed + expired), payments POST, void POST, manual-create POST, batch-generate POST, bulk-send POST, retry-payment-links POST, PUT status.
5. **M1** — Replace ad-hoc `Number(body.amount)` parsing with `recordPaymentSchema.safeParse(raw)` in [`app/api/invoices/[id]/payments/route.ts`](../../app/api/invoices/[id]/payments/route.ts). Drop `body.method ?? "CASH"` fallback.
6. **M3** — Add missing-amount guard before invoice lookup in [`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts) `handleSessionCompleted`. Change `paymentAmount = amount ?? Number(invoice.totalDue)` → `paymentAmount = amount`.
7. **Tests** — Update mocks (next/cache), helper-contract assertions (no route update on success), webhook payloads (add `amount` to existing ignored-path tests), enum-conformance skipped list. Add new test for M3 missing-amount path.
8. **Verify + ship** — `npx vitest run` green, write this doc, commit, open PR to staging.

---

## Implementation

### B1 — Atomic SENT flip in helper ([`lib/xendit/helpers.ts`](../../lib/xendit/helpers.ts))

```ts
const wrote = await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
  const fresh = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, totalDue: true, totalPaid: true },
  });
  if (!fresh) return false;
  if (fresh.status === "PAID" || fresh.status === "CANCELLED") return false;
  const remainingNow = Number(fresh.totalDue) - Number(fresh.totalPaid);
  if (remainingNow <= 0) return false;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      xenditSessionId: xenditSession.id,
      xenditPaymentUrl: xenditSession.payment_link_url,
      status: "SENT",
      sentAt: new Date(),
      paymentLinkError: null,
    },
  });
  return true;
});
if (!wrote) return null;
return { paymentUrl: xenditSession.payment_link_url };
```

Same `hashtext()` lock key as void + webhook → all three serialise per-invoice. The "Xendit session created but DB write skipped" case (race-loser) is a soft-failure: the orphaned session expires naturally on Xendit's side; no live link on our DB.

### B1 cascade — Caller cleanup

- [`app/api/invoices/route.ts`](../../app/api/invoices/route.ts) (manual create): dropped `prisma.invoice.update({ where: { id: invoice.id }, data: { status: "SENT", sentAt, paymentLinkError: null } })` after helper success. Added `revalidateTag` calls.
- [`app/api/invoices/generate/batch/route.ts`](../../app/api/invoices/generate/batch/route.ts) (bulk generate): same drop. Added conditional `revalidateTag` when `txResult.length > 0`.
- [`app/api/xendit/create-session/route.ts`](../../app/api/xendit/create-session/route.ts) (bulk send): same drop. Added conditional `revalidateTag` when `created > 0`.
- [`lib/finance/xendit-retry.ts`](../../lib/finance/xendit-retry.ts): dropped success-path try/catch update; failure path still writes `paymentLinkError` for diagnosis.

### B2 — Schema narrowing ([`lib/validations/invoice.ts`](../../lib/validations/invoice.ts))

```ts
export const updateInvoiceSchema = z.object({
  status: z.enum(["DRAFT", "SENT"]).optional(),
});
```

PAID/PARTIALLY_PAID/OVERDUE/CANCELLED/PENDING_PAYMENT_LINK no longer reachable through generic PUT. Each has a dedicated route (payments POST sets PAID/PARTIALLY_PAID, webhook sets PAID, void POST sets CANCELLED, helper sets PENDING_PAYMENT_LINK on Xendit failure).

### B3 — `revalidateTag("parent-invoice-list")` parity

Added the call alongside every existing `student-invoices` invalidation:
- [`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts) — completed + expired.
- [`app/api/invoices/[id]/payments/route.ts`](../../app/api/invoices/[id]/payments/route.ts) — after tx commit.
- [`app/api/invoices/[id]/void/route.ts`](../../app/api/invoices/[id]/void/route.ts) — after tx commit.
- [`app/api/invoices/route.ts`](../../app/api/invoices/route.ts) — after manual create with helper success.
- [`app/api/invoices/generate/batch/route.ts`](../../app/api/invoices/generate/batch/route.ts) — after batch with `txResult.length > 0`.
- [`app/api/xendit/create-session/route.ts`](../../app/api/xendit/create-session/route.ts) — after bulk send with `created > 0`.
- [`app/api/invoices/retry-payment-links/route.ts`](../../app/api/invoices/retry-payment-links/route.ts) — when `outcome.succeeded > 0`.
- [`app/api/invoices/[id]/route.ts`](../../app/api/invoices/[id]/route.ts) — PUT, when status actually changes.

### M1 — Schema enforcement ([`app/api/invoices/[id]/payments/route.ts`](../../app/api/invoices/[id]/payments/route.ts))

```ts
const raw = await req.json();
const parsed = recordPaymentSchema.safeParse(raw);
if (!parsed.success) {
  return NextResponse.json(
    { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
    { status: 400 }
  );
}
const body = parsed.data;
const amountDec = new Prisma.Decimal(body.amount.toString());
// ...
method: body.method,  // schema-enforced enum, no `?? "CASH"` fallback
```

### M3 — Missing-amount guard ([`app/api/xendit/webhook/route.ts`](../../app/api/xendit/webhook/route.ts))

```ts
if (amount === null) {
  console.warn(
    `[XENDIT WEBHOOK] Completed event missing numeric amount eventId=${eventId} invoiceId=${invoiceId}`,
  );
  await markIgnored(eventId, "missing amount", invoiceId);
  return { ok: true, status: "IGNORED:missing_amount", eventId };
}
// ...
const paymentAmount = amount;  // post-guard, non-null
```

### Tests

- Added `vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))` to four route test files (else `revalidateTag` throws "Invariant: static generation store missing").
- Updated 4 success-path tests to `expect(prisma.invoice.update).not.toHaveBeenCalled()` — helper now handles status flip atomically.
- Updated `lib/finance/__tests__/xendit-retry.test.ts` mixed-success/failure test: 1 update (failure path only), not 3.
- Added `amount: 1000` to webhook tests "invoice-not-found" and "mid-tx throw" — payloads now satisfy M3 guard so existing assertions still apply.
- Added new test in [`app/api/__tests__/xendit-webhook.test.ts`](../../app/api/__tests__/xendit-webhook.test.ts): `missing amount on completed → 200 IGNORED:missing_amount, no invoice lookup, no payment.create`.
- Removed `Invoice.status` row from FIELDS table in [`lib/validations/__tests__/enum-conformance.test.ts`](../../lib/validations/__tests__/enum-conformance.test.ts), added rationale comment in skipped list — `updateInvoiceSchema` is a *transition* enum, not a value mirror.

---

## Verification

- **Vitest:** `npx vitest run` → **Test Files 72 passed | 2 skipped (74); Tests 584 passed | 42 todo (626)** ✓
- **Build:** `npm run build` deferred to CI — local Bash classifier outage (`claude-opus-4-7 is temporarily unavailable, so auto mode cannot determine the safety of Bash`) blocked execution across multiple retries this session. CI will exercise build + typecheck on the PR.
- **Playwright:** deferred to CI for the same reason. No frontend changes in this cycle, so smoke regression risk is low; admin/teacher/parent specs cover the affected flows on green CI.
- **Manual smoke (pre-fix UX session, prior turn):** parent invoice list confirmed stale after webhook in earlier verification — fix targets that exact path. Re-smoke deferred to staging post-merge.
- **Cross-check `design-system.html`:** N/A — server-side cycle, no visual changes.

---

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Rollback:** revert PR. No data migration to undo. Helper's atomic write rolls back via Prisma tx semantics on any internal throw; orphaned Xendit sessions (race-loser case) expire naturally on Xendit's side per their TTL — no DB cleanup needed.
- **Risk:** B1's caller-contract change is the load-bearing piece. Verified: every Xendit-helper success-path caller updated, with tests asserting `prisma.invoice.update` not called on success. Failure path (`paymentLinkError` write-back) untouched.
- **Monitoring after deploy:** watch for any `[XENDIT WEBHOOK] Completed event missing numeric amount` warnings — first occurrence is a real signal worth investigating (provider regression or attack attempt).
