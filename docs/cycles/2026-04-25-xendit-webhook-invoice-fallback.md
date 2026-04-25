# Xendit Webhook — Invoice Fallback Lookup

## Context
Vercel logs (preview deployment, 2026-04-25 04:38–04:42 UTC) show repeated `200 { "error": "Invoice not found" }` responses from `POST /api/xendit/webhook`. Sender visible in Xendit dashboard: real account events (not synthetic test fires alone).

Current handler matches invoice strictly by `data.reference_id == invoice.id`. Two real failure modes hit this:
- UAT reseed regenerates invoice rows with new UUIDs while old Xendit checkout sessions retain the original `reference_id`. Webhook fires post-reseed → invoice row gone → "not found".
- Xendit dashboard "resend webhook" replays a session with a stale reference.

Net effect: paid invoice in Xendit, unmarked invoice in our DB. Silent revenue-recognition gap.

## Spec
- Webhook MUST attempt fallback lookup by `xenditSessionId` when primary `reference_id` lookup misses.
- Fallback uses `data.payment_session_id` (preferred) or `data.id` from payload.
- "Invoice not found" log line MUST include `reference_id`, `sessionId`, `paymentId` for triage.
- Idempotency / advisory-lock / decimal handling unchanged.
- No DB schema change (`invoice.xenditSessionId` already populated by `lib/xendit/helpers.ts:54`).
- Existing tests stay green; two new tests cover the fallback path and double-miss path.

## Tasks
1. Edit [app/api/xendit/webhook/route.ts](app/api/xendit/webhook/route.ts) — add `findFirst({ where: { xenditSessionId } })` fallback + richer not-found log.
2. Extend [app/api/__tests__/xendit-webhook.test.ts](app/api/__tests__/xendit-webhook.test.ts) — add `findFirst` to prisma mock; cover fallback hit and double-miss.

## Implementation
- `app/api/xendit/webhook/route.ts` — extracted `xenditSessionIdFromPayload` (= `data.payment_session_id ?? data.id`); switched `invoice` to `let`; on `null`, attempt `prisma.invoice.findFirst({ where: { xenditSessionId } })`. Warn-log on fallback hit; rich error-log on full miss. Downstream `sessionId` (idempotency key) untouched — still `data.payment_session_id` only, per existing comment.
- Tests — added `findFirst: vi.fn()` to invoice mock. New cases: (a) primary miss + fallback hit → 200 PAID + verifies `findFirst` called with `xenditSessionId`; (b) primary + fallback both miss → 200 with `error: "Invoice not found"`.

## Verification
- `npx vitest run app/api/__tests__/xendit-webhook.test.ts` → 4/4 pass.
- `npm run build` → clean.
- `npx vitest run` → 460 passed, 42 todo, 2 skipped (full suite).
- Playwright: not run — change is server-only, no UI surface; Xendit webhook path lives outside e2e scope (no demo-mode harness for external POST).
- Cross-checked design-system not applicable (backend-only).

## Ship Notes
- No migration. No new env vars.
- Rollback: revert single commit on `feat/xendit-webhook-invoice-fallback`.
- Operational: after merge, replay any backlogged Xendit webhooks from dashboard for invoices Era Zamona Chattar's account flagged 04:38–04:42 UTC; the fallback should now mark them PAID. If still missing, the new error log line will print `sessionId` for manual `Invoice.findFirst({ where: { xenditSessionId } })` reconciliation.
- Follow-up watchlist: deferred orphan-recovery item from `docs/cycles/2026-04-24-comprehensive-code-review.md` §T7-#6 still open — `createXenditSessionForInvoice` dual-write retry. Out of scope here.
