# DOKU Payment Gateway — Adapter Migration

## Context

Talib currently bills parents through **Xendit** Checkout Sessions (`POST https://api.xendit.co/sessions`, `mode: "PAYMENT_LINK"`). The CTO has decided to move the pilot to **DOKU Checkout**.

### Why now

The An Nisaa' pilot has not yet billed a single parent. Verified against `annisaa-erp-v3-prod-sgp` (`vxwywmvpxetdgnxejjgk`) on 2026-07-27:

```
invoices_total = 0   with_link = 0   outstanding = 0
payments_total = 0   payments_xendit = 0   webhook_events = 0
```

There are **zero in-flight payment sessions and zero settled payments in production**. The gateway can be swapped with no money in flight and no parent holding a live payment link.

### Decisions taken (CTO, 2026-07-27)

| Decision | Choice | Consequence |
|---|---|---|
| Cutover shape | **Adapter + both gateways behind an env flag** | A `PaymentGateway` port is introduced; Xendit and DOKU are both implementations; `PAYMENT_GATEWAY` selects at runtime. Rollback is an env flip, not a redeploy of reverted code. |
| Channels | **Virtual Account only** | `payment.payment_method_types` pinned to the `VIRTUAL_ACCOUNT_*` set. Matches the existing parent-portal copy "Transfer bank (Virtual Account)" exactly and avoids card MDR. |

The rejected alternative was a rip-and-replace with gateway-neutral column names. It produces a cleaner end state but has no rollback path. Because the adapter option was chosen, **no Prisma column is renamed in this cycle** — `Invoice.xenditSessionId`, `Invoice.xenditPaymentUrl` and `Payment.xenditPaymentId` keep their names and are re-documented as *generic gateway* columns. This is a deliberate, recorded debt: see Ship Notes → Known debt.

### Current-state map (three parallel audits, 2026-07-27)

**Wire surface.** Exactly one file talks to Xendit over HTTP: `lib/xendit/client.ts` (`createXenditSession`, `pingXenditBalance`). Hand-rolled `fetch`, no SDK, no npm dependency. `XENDIT_API_URL` is a module const with no env override.

**No seam exists.** Consumers import `createXenditSession` / `createXenditSessionForInvoice` concretely. There is no interface to bind a second implementation to — that seam is the bulk of this cycle.

**Reusable as-is (gateway-agnostic today):** `lib/xendit/with-retry.ts` retry loop, `lib/finance/concurrency-limit.ts`, `lib/finance/run-bulk-{generate,retry}.ts` orchestrators, `lib/finance/pending-breakdown.ts` SQL, `lib/xendit/error-prefix.ts` mechanism, `lib/parent-invoice-link.ts`, the webhook route's two-phase durable-receipt pattern, the `pg_advisory_xact_lock(hashtext(invoiceId))` concurrency model shared by webhook / manual-payment / void.

**Hard-coupled to Xendit:** `client.ts` in full; the webhook route's auth model (`x-callback-token` shared-secret equality, **not** a signature), event names `payment_session.completed` / `payment_session.expired`, and snake_case payload fields; `lib/webhook/redact-payload.ts` PII key set; `lib/webhook/extract-display-fields.ts` field names; the `?xenditStatus=paid|cancel` return param; CSP hosts in `lib/security/headers.ts`; the `xnd_development_` prefix guard in `scripts/reseed/guards.ts`; the `xnd_production_`/`xnd_development_` tier heuristic in `/api/health/xendit`.

**User-visible "Xendit" strings** (7 sites): `"Buat Link Xendit"` (admin invoice detail), `"Aktivitas Xendit (N)"` (activity card heading), `"…gagal Xendit"` (batch progress card), the `XENDIT_SECRET_KEY` hint in the pending-link breakdown popover, the `payment_session.completed` / `payment.succeeded` tooltip, and two legal sentences naming **Xendit Pte. Ltd.** in `app/legal/privacy/page.tsx:44` and `app/legal/terms/page.tsx:34-36`.

### DOKU Checkout API — verified against developers.doku.com, 2026-07-27

| Item | Value |
|---|---|
| Create session | `POST https://api-sandbox.doku.com/checkout/v1/payment` (prod `https://api.doku.com/checkout/v1/payment`) |
| Check status | `GET /orders/v1/status/{invoice_number}` — no Digest on GET. Docs: wait 60 s after payment before polling. |
| Headers | `Client-Id`, `Request-Id` (unique, ≤128), `Request-Timestamp` (UTC ISO8601), `Signature: HMACSHA256=<base64>` |
| Signed string | `Client-Id:{v}\nRequest-Id:{v}\nRequest-Timestamp:{v}\nRequest-Target:{path}\nDigest:{base64(sha256(rawBody))}` → HMAC-SHA256 with the Secret Key → base64. No trailing newline. |
| Request body (required) | `order.amount` (integer IDR, no decimals, ≤12 digits), `order.invoice_number` (≤64 chars), `payment.payment_due_date` (minutes, default 60, ≤6 digits) |
| Request body (used here) | `order.callback_url`, `order.callback_url_result`, `order.auto_redirect`, `order.line_items[]`, `payment.payment_method_types[]`, `customer.{name,email,phone}` |
| Response 200 | `response.payment.url` (checkout link), `response.payment.token_id`, `response.payment.expired_date` (`yyyyMMddHHmmss`, UTC+7), `response.order.session_id` |
| Response 400 | `{ "error_messages": ["order.amount must greater than 0", …] }` |
| Notification | `POST` to the merchant notification URL, same four headers, body `{ service{id}, acquirer{id}, channel{id}, transaction{status,date,original_request_id}, order{invoice_number,amount}, virtual_account_info{…} }` |
| Notification ACK | Must return **2xx**. Retries at +30 min, +6 h, +12 h (3 attempts), then gives up. |
| Statuses | Notification: `SUCCESS FAILED VOIDED REFUNDED` (VA sends `SUCCESS` only). Check-status: `PENDING SUCCESS FAILED EXPIRED REFUNDED TIMEOUT REDIRECT` |
| Channels (VA) | `VIRTUAL_ACCOUNT_BCA`, `VIRTUAL_ACCOUNT_BANK_MANDIRI`, `VIRTUAL_ACCOUNT_BRI`, `VIRTUAL_ACCOUNT_BNI`, `VIRTUAL_ACCOUNT_BANK_PERMATA`, `VIRTUAL_ACCOUNT_BANK_CIMB`, `VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI`, `VIRTUAL_ACCOUNT_BTN`, `VIRTUAL_ACCOUNT_BANK_DANAMON`, `VIRTUAL_ACCOUNT_DOKU`, `VIRTUAL_ACCOUNT_BNC` |

No npm dependency is added. `doku-nodejs-library` exists (v1.0.52) but the repo already hand-rolls Xendit over `fetch`; a hand-rolled DOKU client keeps the two adapters symmetric and adds no supply-chain surface.

### Behavioural difference that changes parent UX

Xendit Payment Link in card/e-wallet mode completes **synchronously** — the parent pays and is redirected back. DOKU **Virtual Account** does not: the parent receives a VA number and pays later at an ATM or in mobile banking, often hours later, and frequently never returns to the browser tab.

Therefore under DOKU the **HTTP notification is the only reliable completion signal**. `order.auto_redirect` must stay `false` so the parent sees the VA number rather than being bounced away from it, and the existing `?xenditStatus=paid` toast can no longer be treated as evidence of payment. The parent-portal 30-second `router.refresh()` poll already in `app/parent/invoices/client.tsx` becomes the primary way a parent sees their payment land.

### Assumptions carried into Spec

1. **A1 — RESOLVED.** Client-Id is `BRN-0249-1785138907502` (correct `BRN-` format). Secret Key supplied separately. The earlier `doku_key_sandbox_…` value is not a Client-Id and is not used by this integration. A DOKU RSA public key was also supplied; it is a **SNAP asymmetric-flow artifact** and is **not used** — DOKU Checkout is non-SNAP, which is symmetric HMAC-SHA256 with the Secret Key in both directions (confirmed 2026-07-27 against DOKU's non-SNAP request-header and response-header signature docs).
2. **A2 — Inbound notification `Request-Target` is undocumented.** DOKU documents signature generation for outbound requests, and validation of *response* headers (which swap `Request-Timestamp` for `Response-Timestamp` and use the DOKU endpoint path as `Request-Target`). Neither covers an inbound HTTP notification, and `doku-nodejs-library` v1.0.52 is SNAP-only — its `signatureService` uses the uppercase `REQUEST_TARGET:` SNAP form, not the non-SNAP one — so it is not authoritative here.

   **Resolution, not assumption:** the verifier computes the HMAC for *both* candidate `Request-Target` values (our own notification path, and the DOKU-side path) and accepts if either matches in constant time. Both candidates require the Secret Key to forge, so trying two costs nothing in security while removing the unknown from the trust path. The route logs which candidate matched; once a real sandbox notification pins it, the loser is deleted in a follow-up.

   Rejected alternative: gating every credit on a `GET /orders/v1/status/…` confirmation. DOKU's own docs say to wait 60 s after payment before polling, so a check-status at notification time would often return `PENDING`, forcing a non-2xx and a **30-minute** credit delay on every parent payment (DOKU's first retry interval). Check-status is therefore used only as a reconciliation tool for events already parked in `ERROR`, never on the happy path.
3. **A3 — `order.invoice_number` reuse on retry.** Whether DOKU rejects a repeated `invoice_number` is unverified. The design uses `invoice.id` (a bare CUID, 25 chars, no dashes) as `invoice_number`, with `${invoice.id}-${attempt}` as the retry form, so webhook correlation can always recover the invoice id by splitting on the last `-`. T2 confirms against sandbox which form is needed.
4. **A4 — Legal entity name.** DOKU's operating entity must be confirmed before the privacy/terms copy is changed. Not asserted from memory; T6 verifies from DOKU's own site or contract before editing legal text.

---

## Spec

Ship DOKU Checkout as a selectable payment gateway alongside Xendit, with DOKU active on staging and ready to activate on production by env flip.

### Acceptance criteria

**Port and selection**

- **AC-1** — A `PaymentGateway` port exists at `lib/payments/types.ts` with: `createSession(params: CreateSessionParams): Promise<GatewaySession>`, `ping(timeoutMs?: number): Promise<void>`, and a static `id: "xendit" | "doku"`. `GatewaySession` is `{ id: string | null; paymentUrl: string; status: string; expiresAt: string }`.
- **AC-2** — `getGateway()` in `lib/payments/registry.ts` resolves from `PAYMENT_GATEWAY` (`"xendit" | "doku"`), defaulting to `"xendit"` when unset so an un-migrated environment keeps working. An unrecognised value throws at call time with the offending value in the message.
- **AC-3** — Both adapters throw a single shared `GatewayApiError` carrying `{ status, code, retriable, retryAfterMs? }` where `code` is the existing 9-value taxonomy (`5xx | 429 | 408 | network | 401 | 403 | 422 | 4xx | unknown`). `withRetry` (formerly `withXenditRetry`), `prefixForError`, `formatPaymentLinkError` and the 10-bucket pending-link breakdown continue to work unchanged for both gateways.
- **AC-4** — Every existing Vitest and Playwright assertion that covers Xendit behaviour still passes with `PAYMENT_GATEWAY` unset. The Xendit path is refactored, never behaviourally changed.

**DOKU session creation**

- **AC-5** — `lib/payments/doku/signature.ts` exports a pure `buildSignature({ clientId, requestId, timestamp, target, body, secretKey })` returning `HMACSHA256=<base64>`, and a pure `buildDigest(rawBody)` returning `base64(sha256(rawBody))`. Both are unit-tested against the worked example in DOKU's docs (`Client-Id:MCH-0001-10791114622547` … → `Signature: HMACSHA256=OvIRJs/jH8BIcGsktr4d8nnYtxY6E0Uzdm9d1GVgv5s=`), so a regression in string assembly fails loudly.
- **AC-6** — The exact byte string signed is the string that is sent. The digest is computed over the serialised body that `fetch` transmits, not over a re-serialisation of the same object.
- **AC-7** — `POST /checkout/v1/payment` is called with `order.amount = Math.round(totalDue - totalPaid)`, `order.invoice_number` per A3, `order.currency = "IDR"`, `order.callback_url_result = <origin>/parent/invoices?invoice=<id>&paymentStatus=paid`, `order.auto_redirect = false`, `payment.payment_due_date = 10080` (7 days, matching the current Xendit `expiryDays: 7`), `payment.payment_method_types = <VA list>`, and `customer.{name,email,phone}` from the primary guardian. `response.payment.url` is persisted to `Invoice.xenditPaymentUrl`; `response.payment.token_id` to `Invoice.xenditSessionId`.
- **AC-8** — DOKU's `400 { error_messages: [...] }` is classified `4xx`, non-retriable, with the joined messages as the error text, so it lands in the `4xx:` breakdown bucket rather than `unknown:`.
- **AC-9** — `DEMO_MODE === "true"` short-circuits the DOKU adapter exactly as it does the Xendit one — synthetic session, zero network — so Playwright and CI keep running without credentials.
- **AC-10** — Secrets never appear in a log line, an error message, or an API response body. Regression-tested the same way `/api/health/xendit` already tests it.

**DOKU notification**

- **AC-11** — `POST /api/doku/webhook` verifies the inbound `Signature` header per A2 — HMAC-SHA256 over `Client-Id` / `Request-Id` / `Request-Timestamp` / `Request-Target` / `Digest` from the inbound headers and raw body, tried against both candidate `Request-Target` values, compared with `timingSafeEqual`. Rejects with 401 on mismatch, missing header, or missing `DOKU_SECRET_KEY`. The matching candidate is logged. **No unverified notification ever credits a payment.**
- **AC-12** — The two-phase durable-receipt pattern is preserved verbatim: insert `WebhookEvent` first (`provider: "doku"`), `P2002` → `200 {ok:true,duplicate:true}`, business failures → `WebhookEvent.status = "ERROR"` + **200**, only rate-limit / auth / malformed-body / audit-insert-failure return non-2xx. DOKU retries at +30 min / +6 h / +12 h, so a 5xx from us is a 12-hour delay, not a lost payment.
- **AC-13** — Payment crediting reuses the existing advisory-lock transaction: the `MISSING_AMOUNT`, `CURRENCY_MISMATCH`, `MISSING_PAYMENT_ID`, `INVOICE_NOT_FOUND`, already-`PAID`, `CANCELLED` and `OVERPAYMENT_FLAGGED` guards all apply identically, and `Payment.xenditPaymentId` remains the `@unique` inner idempotency key (populated with DOKU's `transaction.original_request_id`).
- **AC-14** — `transaction.status` maps: `SUCCESS` → credit payment; `FAILED` / `VOIDED` → `IGNORED:status_not_completed`; `REFUNDED` → `ERROR:REFUND_UNHANDLED` (surfaced to admin, never silently swallowed); anything else → `IGNORED:status_not_handled`.
- **AC-15** — `Payment.method` gains `"DOKU"` in `lib/constants/payment-methods.ts` with label `"Virtual Account"`, and `recordPaymentSchema`'s method enum accepts it. No Prisma migration — `method` is a `String` column.
- **AC-16** — `GET /api/invoices/[id]/webhook-events` filters by `provider` matching the active gateway, so a future two-provider database cannot mix Xendit and DOKU rows into one activity panel.

**Config, ops, surface**

- **AC-17** — New env vars, all added to `.env.example` (which makes them required by `scripts/audit-vercel-env.ts`): `PAYMENT_GATEWAY`, `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_ENV` (`sandbox | production`, drives the API base URL — DOKU key prefixes do not encode tier the way `xnd_development_` does).
- **AC-18** — `GET /api/health/payments` reports the active gateway. For DOKU, "healthy" means a signed `GET /orders/v1/status/<synthetic-id>` returns any non-401/403 response (reachable and credentials accepted); 401/403 → 503 with `code:"401"`/`"403"`. `/api/health/xendit` is kept as an alias so existing uptime monitors do not break.
- **AC-19** — `lib/security/headers.ts` `connect-src` gains `https://api.doku.com https://api-sandbox.doku.com`. `script-src` is **not** widened — DOKU Checkout is a full-page redirect, not a JS SDK.
- **AC-20** — `scripts/reseed/guards.ts` refuses to run against production credentials for whichever gateway is active: the `xnd_development_` check for Xendit, and `DOKU_ENV !== "production"` for DOKU.
- **AC-21** — `proxy.ts` public-path bypass covers the DOKU notification path, using an exact-segment match rather than the current loose `startsWith` prefix.

**Copy and legal**

- **AC-22** — User-visible gateway brand names are removed from the admin UI in favour of gateway-neutral copy: `"Buat Link Xendit"` → `"Buat Link Pembayaran"`, `"Aktivitas Xendit (N)"` → `"Aktivitas Pembayaran (N)"`, `"N gagal Xendit"` → `"N link gagal"`, and the breakdown popover's auth hint names the active gateway's key env var. Bahasa register and honorifics follow `.claude/standards/voice.md`.
- **AC-23** — `app/legal/privacy/page.tsx` and `app/legal/terms/page.tsx` name the correct processor and data-residency claim for the gateway actually in use, with the legal entity confirmed per A4 — not asserted from model memory.
- **AC-24** — The parent portal accepts `?paymentStatus=paid|cancel` **and** the legacy `?xenditStatus=paid|cancel`, so the redirect shims at `/payment/success` and `/payment/cancel` keep working for any session created before this cycle.

### Non-goals

- No Prisma column rename and no data migration. `xenditSessionId` / `xenditPaymentUrl` / `xenditPaymentId` are re-scoped as generic gateway columns and documented as debt.
- No card, e-wallet, QRIS, paylater or convenience-store channel. Virtual Account only, per the CTO decision.
- No refund, void or partial-capture API integration. `REFUNDED` notifications are surfaced to admin as `ERROR` for manual handling (AC-14), not automated.
- No `payment.type: "INSTALLMENT"` / `allow_tenor`, no `recover_abandoned_cart`.
- No removal of Xendit code. Both adapters ship. Deleting Xendit is a separate cycle once DOKU has run clean in production for a full billing period.
- No change to invoice generation, fee structures, or the bulk-generate/retry orchestrators beyond re-pointing their imports.

---

## Tasks

### T1 — Gateway port + Xendit adapter, zero behaviour change

Create `lib/payments/types.ts` (`PaymentGateway`, `CreateSessionParams`, `GatewaySession`, `GatewayApiError`, `GatewayErrorCode`) and `lib/payments/registry.ts` (`getGateway()`). Re-home `lib/xendit/{client,helpers,with-retry,error-prefix}.ts` into `lib/payments/xendit/` implementing the port, renaming `XenditApiError` → `GatewayApiError` and `withXenditRetry` → `withRetry`. Leave `lib/xendit/*` as thin re-export shims so no consumer moves in this task.

Satisfies AC-1, AC-2, AC-3, AC-4. **Gate: the full existing suite must pass with zero test-file edits other than import paths.** Any assertion that needs rewriting to stay green is a behaviour change and must be reverted, not accommodated.

### T2 — DOKU client + signature

`lib/payments/doku/signature.ts` (`buildDigest`, `buildSignature`, both pure) and `lib/payments/doku/client.ts` implementing `PaymentGateway`. Base URL from `DOKU_ENV`. Error classifier maps DOKU's `error_messages` shape and HTTP bands onto the shared taxonomy. `DEMO_MODE` short-circuit.

Unit tests: the doc's worked signature vector; digest of an empty body; the `4xx` classification of `{error_messages:[…]}`; `DEMO_MODE` returning synthetic without touching `fetch`; a secret-leakage guard.

Verify A3 against sandbox once `DOKU_CLIENT_ID` is available — record which `invoice_number` form is required in Implementation.

Satisfies AC-5, AC-6, AC-7, AC-8, AC-9, AC-10.

### T3 — Route session creation through the port

Replace `lib/xendit/helpers.ts` with `lib/payments/session.ts` exporting `createPaymentSessionForInvoice(invoiceId, tenantId, requestOrigin?)`, which resolves the gateway via `getGateway()`. Re-point the four callers: `app/api/xendit/create-session/route.ts`, `app/api/invoices/route.ts` (POST), `app/api/invoices/generate/batch/route.ts`, `lib/finance/xendit-retry.ts`. Add `?paymentStatus=` alongside `?xenditStatus=` in `app/parent/invoices/client.tsx` and both redirect shims.

While here, close two defects the audit surfaced in `create-session`: `await req.json()` is unguarded (malformed body → unhandled 500) and `invoiceIds` has no length cap while every sibling bulk route caps at 25 via zod. Add a zod schema matching `retryPaymentLinksSchema`.

Satisfies AC-24. Gate: `npm run build && npx vitest run`.

### T4 — Shared webhook processor + DOKU notification route

Extract the gateway-agnostic core of `app/api/xendit/webhook/route.ts` into `lib/payments/webhook-processor.ts`: `processPaymentEvent(event: NormalizedPaymentEvent)` owning the `WebhookEvent` insert, `P2002` dedup, advisory-lock transaction, amount/currency/payment-id guards, overpayment tolerance, status recomputation, and cache-tag busting. Reduce the Xendit route to `verify → parse → processPaymentEvent`.

Add `app/api/doku/webhook/route.ts`: rate limit (60/min/IP, before auth, matching the Xendit route), dual-candidate signature verification per A2/AC-11, parse to `NormalizedPaymentEvent`, delegate. Add `"DOKU"` to `PAYMENT_METHODS` and `recordPaymentSchema`. Filter `webhook-events` by provider. Update `proxy.ts` public paths with an exact-segment match.

The raw request body must be read **once** as text and used for both digest and JSON parse — re-serialising the parsed object would change bytes and break verification.

Satisfies AC-11 through AC-16, AC-21.

### T5 — Health, env, CSP, reseed guards

`GET /api/health/payments` (gateway-aware, `/api/health/xendit` kept as alias). `.env.example` block for `PAYMENT_GATEWAY`, `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_ENV`. Drop the dead `NEXT_PUBLIC_XENDIT_PUBLIC_API_KEY` line the audit found — nothing reads it. CSP `connect-src` hosts. `scripts/reseed/guards.ts` gateway-aware production-credential refusal. `playwright.config.ts` injects DOKU stub env alongside the Xendit stubs.

Satisfies AC-17, AC-18, AC-19, AC-20.

### T6 — Copy, activity card, legal

Neutralise the seven user-visible brand strings (AC-22). Rename `components/admin/invoices/xendit-activity-card.tsx` → `payment-activity-card.tsx`; its tooltip stops naming Xendit event types and describes the active gateway's. Update `lib/webhook/redact-payload.ts` PII key set to cover DOKU's `customer` object, and `extract-display-fields.ts` to read DOKU's `order.amount` / `transaction.date` / `channel.id` — DOKU **does** report the rail via `channel.id`, so the long-standing hardcoded `paymentMethod: null` becomes a live field for DOKU.

Confirm the DOKU legal entity per A4 from a primary source, then update both legal pages (AC-23). Cross-check `.claude/standards/design-system.html` for the card and badge treatments touched.

Satisfies AC-22, AC-23.

### T7 — E2E, docs, README

`e2e/payment.spec.ts` covers both `paymentStatus` and legacy `xenditStatus` params. `e2e/admin.spec.ts`: the suite's whole design rests on "stub key ⇒ 401 ⇒ `PENDING_PAYMENT_LINK`" — confirm the DOKU classifier maps an auth failure the same way, or the suite silently stops testing what it claims to.

README: new routes, new env vars, ADR entry for the port decision. Fill Implementation, Verification and Ship Notes in this cycle doc.

Gate: `npm run build && npx vitest run && npx playwright test`.

---

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5. T1 sequential (foundation — every other task imports its types); T2+T3 parallel once T1 lands; T4 after T2; T5+T6 parallel; T7 last.
- **T1: gateway port + Xendit adapter** — `lib/payments/{types,registry,with-retry,error-prefix}.ts` + `lib/payments/xendit/client.ts` added; `lib/xendit/{client,with-retry,error-prefix}.ts` reduced to re-export shims; `lib/xendit/helpers.ts` untouched (its imports resolve through the shims). No consumer file changed. `XenditApiError` is exported as a literal alias of `GatewayApiError` — the same class object, so every existing `instanceof` check still holds.
- **T1 accepted deviation from "zero behaviour change":** `GatewayApiError` sets `this.name = "GatewayApiError"`, so Xendit-path errors now stringify as `GatewayApiError: …` rather than `XenditApiError: …`. One assertion (`lib/__tests__/xendit-client-classifier.test.ts:89`) pinned the old label and was updated. Verified first that nothing branches on `error.name`: the only non-test read is a diagnostic log breadcrumb at `app/api/invoices/route.ts:294`. Reverting was rejected because the class is now shared — a DOKU failure stringifying as `XenditApiError` would be actively misleading in production logs. Ops log-greps keyed on the literal string `XenditApiError` (as opposed to the `[XENDIT …]` prefixes, which are unchanged) would need updating; none are known to exist in this repo.

## Verification

- **T1: gates passed.** `npx vitest run` → 239 files passed, 2 skipped; 2255 tests passed, 0 failed, 42 todo (re-run by the driver, not taken on the subagent's word). `npm run build` → exit 0, all routes compiled. `npx tsc --noEmit` → clean (requires `npx prisma generate` first in a fresh worktree; without the generated client, tsc reports 336 pre-existing module-resolution errors on untouched `staging` too).
- **T1: review passed.** `superpowers:code-reviewer` diffed `lib/payments/xendit/client.ts` against `git show HEAD:lib/xendit/client.ts` line by line and confirmed **no behaviour drift**: request body keys, `pickSessionId` fallback order, `parseRetryAfter` (seconds-only, 3000 ms cap), the status→code classification table, `retriable` flags, `DEMO_MODE` short-circuit, E.164 normalisation, `expires_at` computation and all `[XENDIT …]` log prefixes are verbatim; `PAYMENT_LINK_ERROR_PREFIXES` byte-identical in contents and order; retry constants and backoff precedence unchanged; every shim export accounted for; no `XENDIT_SECRET_KEY` path into a log, error message or response body. Sole finding was the `error.name` deviation, consciously accepted above.

## Ship Notes

<!-- /ship fills this. Pre-seeded with what is already known: -->

### Blocked on

- **Notification URL registration** — the staging and production notification URLs must be registered in DOKU Back Office before any callback arrives. Nothing in the code path can compensate for an unregistered URL: no notification means no payment is ever credited.

### Not used

The DOKU RSA public key supplied during specification belongs to the SNAP asymmetric flow. DOKU Checkout is non-SNAP (symmetric HMAC with the Secret Key). No code reads it, and it is not an env var.

### Credential handling

The Secret Key was pasted into a chat transcript during specification. Treat it as disclosed and rotate it in DOKU Back Office before production use. No credential is written to any tracked file in this repo; `.env.example` carries names only, and real values go into `.env.local` and Vercel environment variables by hand.

### Known debt (deliberate, from the adapter decision)

`Invoice.xenditSessionId`, `Invoice.xenditPaymentUrl` and `Payment.xenditPaymentId` retain Xendit-branded names while holding DOKU data. Renaming them to `paymentSessionId` / `paymentUrl` / `gatewayPaymentId` is a follow-up cycle, to be done together with deleting the Xendit adapter once DOKU has run clean through a full billing period.
