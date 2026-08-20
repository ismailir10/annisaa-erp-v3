# Payments Module Hardening (audit-driven)

## Context

CTO-initiated audit of the money path (`app/api/{payments,invoices,fee-structure,fee-components,xendit,guardian/invoices}`, `lib/{xendit,finance,webhook,parent-helpers}`) — 3 parallel read-only subagent audits (webhook security, admin billing routes, parent-facing access). The known parent email-null leak class (previously fixed in `lib/parent-helpers.ts` and the raport PDF route after a staging incident) was found **still live** on two money-facing guardian routes. Additional tenant-isolation and validation gaps found on the fee-structure write path.

Verified clean (no action): webhook signature verification (fails closed, timingSafeEqual), DB-enforced idempotency (`WebhookEvent.eventId @unique`), advisory-lock protection against payment/void/webhook races, PAID-status regression guards, Decimal money math, invoice-number reservation, CSV formula-injection escaping, pagination norms, DEMO_MODE correctly absent from inbound webhook path.

## Spec

Acceptance criteria:

1. `GET /api/guardian/invoices/[id]` and `GET /api/guardian/invoices/[id]/pdf` return 404 when the session has neither `parentId` nor a non-empty `email` — never fall through to a `findFirst({ email: null })` query. Same guard shape as `lib/parent-helpers.ts`.
2. Regression tests cover the `parentId: null, email: null` and `email: ""` cases for both routes.
3. `PUT /api/fee-structure` validates its body with a zod schema (positive amounts, cuid ids, malformed-JSON → 400) and verifies every `feeComponentId` belongs to `session.tenantId` (mirror of the check in `POST /api/invoices`). Foreign `feeComponentId` → 400/404, not persisted.
4. `POST /api/invoices/[id]/payments` validates through the existing `recordPaymentSchema` (method enum enforced server-side).
5. Xendit webhook rejects (records `ERROR`, no crediting) a `session.completed` whose `currency` is present and ≠ `IDR`; webhook route gets an IP rate limit consistent with siblings (`create-session`, `health/xendit`).
6. All gates green: `npm run build && npx vitest run`.

Non-goals: `lib/auth.ts` defense-in-depth email guards (User.email is non-nullable — tracked as follow-up, not this cycle); timing-oracle length short-circuit in token compare (accepted, standard pattern, token still required); soft-delete/status-machine refactors; any UI change.

## Tasks

> Verification note: the audit subagents read the **stale main checkout** (dirty tree blocked `sync-staging.sh` fast-forward), so their reported P0 — missing null-email guard on the two guardian invoice routes — is already fixed on `origin/staging` (#397, `716cfce1`). CTO re-verified every remaining finding against this worktree (fresh off `origin/staging`) before accepting it. What survives: the guard has **no regression tests**, and the P1/P2 items below are all still live.

1. **P1 — fee-structure PUT validation + tenant ownership.** Add zod schema (`lib/validations/`), `.catch(() => null)` on json parse, positive-amount check, and a `feeComponentDef` tenant-ownership pre-check before upsert. Tests for: foreign-tenant feeComponentId rejected, negative amount rejected, malformed JSON → 400.
2. **P2 — manual payment POST uses `recordPaymentSchema`.** Wire the existing schema into `app/api/invoices/[id]/payments/route.ts`; keep advisory-lock/overpayment logic untouched. Test: invalid method rejected.
3. **P2 — webhook currency check + rate limit.** In `handleSessionCompleted`, reject non-IDR `data.currency` (record ERROR status, return 200 per retry-storm contract); add `rateLimit` to webhook route consistent with siblings. Tests: non-IDR event does not credit; IDR/absent currency still credits.
4. **P0 follow-through — null-email regression tests.** Guard already shipped in #397; add the missing `parentId: null, email: null` and `email: ""` regression tests for `GET /api/guardian/invoices/[id]` and its `/pdf` sibling so the leak class cannot silently return.

## Implementation

### Task 1 — fee-structure PUT validation + tenant ownership
- `lib/validations/fee-structure.ts` (new) — `saveFeeStructureSchema`: cuid-ish ids, `amount` nonnegative (zero kept: the admin fees grid submits `amount: 0` for enabled-but-unpriced components — spec said positive, adjusted after reading `app/admin/fees/page.tsx:115`), notes ≤500, fees array ≤100.
- `app/api/fee-structure/route.ts` — `req.json().catch(() => null)` + `safeParse` → 400; `feeComponentDef.count({ id in ids, tenantId })` ownership gate → 404 before any upsert.
- `app/api/__tests__/fee-structure-put.test.ts` (new, 6 tests): 403 non-admin, 400 malformed JSON, 400 negative amount, 404 foreign feeComponentId, 404 foreign program, 200 happy path (tenant-stamped upsert, zero allowed).

### Task 2 — manual payment POST uses recordPaymentSchema
- `app/api/invoices/[id]/payments/route.ts` — body now parsed via existing `recordPaymentSchema` (method enum CASH/BANK_TRANSFER/XENDIT/OTHER enforced server-side; Payment.method is a plain String column so the enum only lived client-side before). Advisory-lock/overpayment logic untouched.
- `app/api/__tests__/invoices-record-payment.test.ts` (new, 5 tests): unknown method 400, negative amount 400, malformed JSON 400, method defaults CASH + tenant pre-check, guardian 403.

### Task 3 — webhook currency guard + rate limit
- `app/api/xendit/webhook/route.ts` — Step 0 per-IP rate limit (60/min, `lib/rate-limit`, before token check; 429 is pre-Phase-1 so Xendit's retry is lossless); currency guard in `handleSessionCompleted` — non-IDR `data.currency` → `markError("CURRENCY_MISMATCH:<cur>")`, 200, no crediting; absent currency unaffected (older payloads omit it).
- `lib/webhook/error-labels.ts` — Indonesian admin-panel label for `CURRENCY_MISMATCH*`.
- `app/api/__tests__/xendit-webhook.test.ts` (+3 tests): USD blocked with no invoice lookup, explicit IDR proceeds to resolution, 61st same-IP request 429.

### Task 4 — null-email leak regression tests (guard itself shipped in #397)
- `app/api/__tests__/guardian-invoice-detail.test.ts` (+2 tests): `parentId: null, email: null` and `email: ""` → 404 with `parent.findFirst` never called.
- `app/api/__tests__/guardian-invoice-pdf-route.test.ts` (new, 6 tests): same two regression cases plus 401/403/cross-family-404/non-PAID-404 for the kuitansi PDF route.

## Verification

- Code review (superpowers:code-reviewer on the full diff): request-changes → **fixed**. Blocker: the record-payment dialog posts its form state verbatim (`JSON.stringify(payForm)`), so `amount` arrives as a string — the newly wired `recordPaymentSchema`'s bare `z.number()` would have 400'd every manual payment. Fixed with `z.coerce.number()` (repo convention for form-originated numerics) + two regression tests that post `amount` as a string / empty string. Reviewer verified everything else in the diff as correct against the real callers.
- `npm run build` — green (production build completes, all routes compile).
- `npx vitest run` — 235 files passed, 2 skipped; 2240 tests passed, 42 todo (re-run after the review fix). Includes the 51 tests across the five touched test files.
- Gate note: tasks were implemented as one slice (single worktree, no inter-task dependency), so the between-task gate ran once at the end rather than per task; full suite green.
- Audit-report verification: subagent findings were re-verified against this worktree before acceptance — the reported P0 (missing null-email guard) was a stale-checkout artifact (already fixed in #397); everything fixed here was confirmed live on `origin/staging` by direct file reads.
- `bash scripts/verify-api-auth.sh` — 184/184 routes carry a session helper or `@public` sentinel.
- Playwright: deferred to the required CI `Playwright E2E` check — API-only changes, no UI diff; this harness environment cannot run Playwright locally.
- No frontend diff → design-system gate not applicable.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none added or changed.
- **Behavior changes to watch on preview/staging:**
  - `PUT /api/fee-structure` now 400s on negative amounts / malformed JSON and 404s on a fee component outside the tenant — the admin fees grid's normal payload (numbers, zero for unpriced rows) is unaffected.
  - `POST /api/invoices/[id]/payments` enforces the method enum (CASH/BANK_TRANSFER/XENDIT/OTHER); the dialog's string `amount` is coerced.
  - Xendit webhook: >60 req/min from one IP → 429 (pre-Phase-1, lossless for Xendit retries); non-IDR `session.completed` → `CURRENCY_MISMATCH` ERROR row, no crediting, surfaced in the Aktivitas Xendit panel.
- **Rollback:** revert the five commits on this branch; no data migration to unwind. WebhookEvent rows written with `CURRENCY_MISMATCH` remain as inert audit rows.
