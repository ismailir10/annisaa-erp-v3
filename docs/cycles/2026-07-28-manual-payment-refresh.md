# Manual Payment Refresh — "Perbarui pembayaran" on the invoice detail page

## Context

Invoice payment status is currently driven entirely by gateway webhooks
(`app/api/xendit/webhook/route.ts`, `app/api/doku/webhook/route.ts`). When a
webhook does not arrive — misconfigured callback URL, gateway-side delivery
failure, an environment where the callback cannot reach us at all — the invoice
stays `SENT` forever even though the parent has paid. The only recovery today
is for an admin to record a manual `CASH`/`BANK_TRANSFER` payment, which loses
the gateway reference and produces a `Payment` row that does not match the
settlement.

Owner request: an admin-triggered action on `/admin/invoices/[id]` that asks the
gateway what it thinks the state is, and applies it.

Prior art this builds on:
- `lib/payments/webhook-processor.ts` (cycle 2026-07-27-doku-payment-gateway T4)
  already holds the gateway-agnostic transition core — the durable
  `WebhookEvent` receipt, P2002 dedup, advisory-lock transaction, amount /
  currency / payment-id guards, overpayment tolerance, and cache-tag busting.
- `lib/payments/types.ts` `PaymentGateway` port + `lib/payments/registry.ts`
  `getGateway()` already abstract Xendit vs DOKU.

So this cycle adds a *read* path to the port and a second producer of
`NormalizedPaymentEvent`. It deliberately adds **no new transition logic**.

## Spec

**AC-1** — `/admin/invoices/[id]` shows a "Perbarui pembayaran" action whenever
the invoice has a gateway checkout (`xenditPaymentUrl` set) and is not
`CANCELLED`.

**AC-2** — Clicking it polls the active gateway's status endpoint for that
invoice and reconciles the local invoice with what the gateway reports, using
the *same* transitions the webhook performs.

**AC-3** — Idempotent and safe to click repeatedly: no double credit, no
duplicate `Payment` row, correct result when already paid.

**AC-4** — Admin-only (`SUPER_ADMIN` / `SCHOOL_ADMIN`), tenant-scoped, rate
limited. A guardian must never be able to call it.

**AC-5** — Loading, success, no-change and error states are all distinguishable
in the UI. A no-op click must not read as a success.

**AC-6** — The gateway call is strictly read-only. No capture, no void, no
session re-creation.

**AC-7** — Every reconciliation that changes state leaves an audit row visible
in the existing "Aktivitas Pembayaran" panel, distinguishable from a real
webhook delivery.

### Non-goals

- No automatic/background polling. Manual only, this cycle.
- No parent-facing refresh button.
- No new gateway; the port covers Xendit and DOKU as they stand.

### Assumptions

- **A1** — Xendit exposes `GET /sessions/{id}` returning the session with a
  status field. Shape *not* verified against a live account (no local
  credentials). Parsing is defensive; see Risks.
- **A2** — DOKU's `GET /orders/v1/status/{invoice_number}` returns the same
  `order` / `transaction` / `channel` envelope its notification carries.
  `pingDoku` already signs this path, so the route + auth scheme are confirmed;
  the body shape is not.
- **A3** — A `FAILED`/`CANCELED` gateway state is *not* an expiry. Reverting on
  it would null a payment link the parent could still retry, so it is a no-op.

## Tasks

- **T1** — Extend the `PaymentGateway` port with `fetchPaymentStatus(ref)` +
  the `GatewayPaymentStatus` / `GatewayPaymentState` types.
- **T2** — Xendit adapter: `getXenditSessionStatus`, `mapXenditSessionState`,
  `parseXenditSessionStatus`.
- **T3** — DOKU adapter: `getDokuOrderStatus`, `mapDokuTransactionState`,
  `parseDokuOrderStatus`.
- **T4** — `lib/payments/reconcile.ts` — poll → normalize → delegate to
  `processPaymentEvent`. No transitions of its own.
- **T5** — `POST /api/invoices/[id]/refresh-payment` — auth, tenant check,
  rate limit.
- **T6** — UI: header action on the invoice detail page + activity-panel
  refresh key.
- **T7** — Tests.

## Implementation

| File | What |
|---|---|
| `lib/payments/types.ts` | `GatewayStatusRef`, `GatewayPaymentState`, `GatewayPaymentStatus`; `fetchPaymentStatus` added to the `PaymentGateway` port |
| `lib/payments/xendit/client.ts` | `getXenditSessionStatus` (`GET /sessions/{id}`, 10s abort, DEMO_MODE short-circuit) + exported pure `mapXenditSessionState` / `parseXenditSessionStatus` |
| `lib/payments/doku/client.ts` | `getDokuOrderStatus` (signed `GET /orders/v1/status/{invoice_number}`, no digest, 404 → `UNAVAILABLE`) + exported pure `mapDokuTransactionState` / `parseDokuOrderStatus` |
| `lib/payments/reconcile.ts` | **new** — `reconcileInvoicePayment(invoiceId)`, `buildManualEventId`, Indonesian admin-facing messages |
| `app/api/invoices/[id]/refresh-payment/route.ts` | **new** — POST, admin + tenant guard, 10 req/min per (user, invoice), 502 on gateway failure |
| `app/admin/invoices/[id]/page.tsx` | "Perbarui pembayaran" header action, spinner, code-branched toasts, activity-panel bump |
| `components/admin/invoices/payment-activity-card.tsx` | optional `refreshKey` prop |

### How the shared logic is reused (AC-2)

`reconcileInvoicePayment` builds a `NormalizedPaymentEvent` — the exact type
both webhook routes build — and calls `processPaymentEvent`. State mapping:

| Gateway state | `kind` | Effect |
|---|---|---|
| `COMPLETED` | `PAYMENT_COMPLETED` | credit → `PAID` / `PARTIALLY_PAID` |
| `EXPIRED` | `SESSION_EXPIRED` | soft-revert `SENT` → `PENDING_PAYMENT_LINK` |
| `REFUNDED` | `UNHANDLED` + `REFUND_UNHANDLED` | ERROR row, surfaced to admin |
| `PENDING` | — | no dispatch, no audit row |
| `FAILED` | — | no dispatch, no audit row (A3) |
| `UNAVAILABLE` | — | no dispatch; explains why in the toast |

There is no second copy of the crediting logic. A change to the webhook's
guards automatically changes manual refresh.

### Idempotency (AC-3) — three independent layers

1. `eventId` = `manual:<provider>:<invoiceId>:<state>[:<paymentId>]` — a pure
   function of the gateway state, **not** hashed over the response body (which
   carries timestamps and would mint a fresh id per click). Repeated clicks on
   an unchanged state collide on the `WebhookEvent.eventId` unique index →
   P2002 → `{duplicate:true}` no-op.
2. `Payment.xenditPaymentId` is unique and checked *inside* the per-invoice
   `pg_advisory_xact_lock` transaction.
3. `processPaymentEvent` returns early on `PAID` / `CANCELLED` invoices.

Each adapter derives `paymentId` with the **same fallback chain its webhook
route uses** (Xendit: `payment_id` → `payment_session_id`; DOKU:
`transaction.original_request_id`). This is what makes a manual refresh and a
late real webhook for one settlement collapse onto one `Payment` row rather
than two.

### Ordering note

The refund branch is checked *before* the already-paid branch. A refunded
invoice is still locally `PAID`, so the PAID branch would otherwise report the
reassuring "sudah lunas" for money that has gone back to the parent. Caught by
a test, not by review.

## Verification

- `npx vitest run` — **245 files passed, 2 skipped; 2377 tests passed, 42
  todo**. Includes 33 new tests across
  `lib/payments/__tests__/gateway-status-parsing.test.ts` (parser + event-id
  determinism) and `app/api/__tests__/invoice-refresh-payment.test.ts` (auth
  matrix, every outcome branch, event shape, idempotency).
- `npm run build` — **✓ Compiled successfully in 7.5s**. Route
  `/api/invoices/[id]/refresh-payment` present in the manifest.
- `npm run lint` — **0 errors**, 58 warnings, all pre-existing (the 4 on
  `app/admin/invoices/[id]/page.tsx` are unused `Link` / `Skeleton` /
  `ArrowLeft` imports and a stale disable directive that predate this cycle).
- `bash scripts/verify-api-auth.sh` — **✓ 187 / 187 routes** have a session
  helper or `@public` sentinel; the new route is counted.
- Frontend: no new visual primitives — the action reuses the existing
  `DetailPageHeader` `actions` slot with `Button size="sm" variant="outline"`
  and a `lucide-react` icon, matching the sibling "Batalkan Tagihan" action.
  Cross-checked design-system.html §Buttons + §Status badges; toast copy follows
  `.claude/standards/voice.md` (plain Indonesian, no blame, states the next
  action).
- Playwright: **not run locally** — deferred to the required CI `Playwright E2E`
  check. No new e2e spec added: the action's whole behaviour depends on a live
  gateway response, which demo-mode cannot produce (the DEMO_MODE
  short-circuit deliberately returns `PENDING`, i.e. a visible no-op).
- **Preview-verify: NOT YET RUN.** This is the gate that matters for this cycle
  — see Ship Notes.

## Ship Notes

**Migrations:** none. No schema change; `WebhookEvent` and `Payment` are used
as-is.

**Env vars:** none added. Uses whatever `PAYMENT_GATEWAY` /
`XENDIT_SECRET_KEY` / `DOKU_*` the environment already has. Two optional debug
flags are honoured: `XENDIT_DEBUG=1` and `DOKU_DEBUG=1` log the raw
status-endpoint body — **this is the intended way to confirm A1/A2 on a
preview deploy.**

**Rollback:** revert the commit. Nothing persists that the webhook path cannot
also produce; `manual:`-prefixed `WebhookEvent` rows are inert audit records.

### Risks — read before enabling on production

1. **Neither status-endpoint body has been observed with real credentials.**
   No local Xendit/DOKU keys exist (`.env` has none), and probing production was
   explicitly out of scope. Every field is read through a candidate list; a
   shape miss yields `null`, and the shared processor's existing
   `MISSING_AMOUNT` / `MISSING_PAYMENT_ID` guards then refuse to credit and
   leave an ERROR row. The failure mode is "does nothing, logs why", not "credits
   wrongly" — but **A1/A2 must be confirmed on a sandbox preview before this is
   trusted in production.** Turn on `XENDIT_DEBUG=1` / `DOKU_DEBUG=1` and read
   the logged body.
2. **Sandbox vs live credentials.** The preview environment inherits whatever
   gateway credentials Vercel has for the Preview scope. If those are *live*
   keys, a click queries the live gateway (read-only, but still a real API call
   against real data). Confirm the preview scope points at sandbox before
   clicking. See the preview note below.
3. **Refreshing an expired session destroys the payment link.** The
   `SESSION_EXPIRED` transition nulls `xenditSessionId` / `xenditPaymentUrl` and
   reverts to `PENDING_PAYMENT_LINK`, so a parent holding the old link can no
   longer use it. This is exactly what the webhook does — consistent by design,
   and the toast says so — but it is a real user-visible consequence of a
   button an admin may click exploratorily.
4. **Partial-payment double-count is theoretically possible.** If a manual
   refresh credits under key K1 and a later webhook arrives with a different key
   K2 for the same settlement, a second `Payment` row could be inserted. The
   `PAID` short-circuit prevents this for full payments (the normal Checkout
   case, where one session = one full-amount settlement); only a partial
   capture could slip through. Mitigated as far as possible by using identical
   key-derivation chains on both paths.
5. **In-memory rate limiter.** `lib/rate-limit.ts` resets on cold start, so the
   10/min cap is per-instance, not global. Adequate as button-spam protection,
   not as a hard guarantee against gateway rate limits.
