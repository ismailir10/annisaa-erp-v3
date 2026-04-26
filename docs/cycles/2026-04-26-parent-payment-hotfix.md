# Hotfix — Parent Payment Redirect + Webhook $queryRaw void

## Context

Two production-blocking bugs surfaced via a real Xendit sandbox payment immediately after PR #144 merged:

1. **Double-slash in `success_return_url` / `cancel_return_url`** — Xendit webhook payload showed `https://annisaa-erp-v3.vercel.app//payment/success?invoice=...` (note `//`). Caused parent's auto-redirect from Xendit checkout to fail and the "Kembali ke Portal" button on `/payment/success` to behave inconsistently. Root cause: `NEXT_PUBLIC_APP_URL` in Vercel env carries a trailing slash; `lib/xendit/helpers.ts:4` did `${APP_URL}/payment/...` directly, producing the double slash.

2. **Webhook returns 200 with `error: "Failed to deserialize column of type 'void'"`.** All four `pg_advisory_xact_lock(...)` sites in this repo used `tx.$queryRaw` — Postgres returns `void` for the lock function, which Prisma 7.6 cannot deserialize as a row. `$executeRaw` is the correct API for void-returning statements. Affected sites: `app/api/xendit/webhook/route.ts` (×2), `app/api/invoices/[id]/void/route.ts`, `app/api/invoices/[id]/payments/route.ts`, `app/api/employees/route.ts`. The Phase 2 catch in T5's webhook still returned 200 with `{ ok: true, error }` — so the receipt was durable but the invoice never flipped to PAID, and the parent saw "Belum Bayar" indefinitely.

## Spec

- Strip trailing slash from `APP_URL` at module load.
- Replace all `tx.$queryRaw\`SELECT pg_advisory_xact_lock(...)\`` with `tx.$executeRaw` (5 sites).
- Regression test for double-slash. Existing webhook tests updated for `$executeRaw` mock alongside `$queryRaw`.

## Tasks

- [x] T1: APP_URL trailing-slash strip + regression test
- [x] T2: $queryRaw → $executeRaw at 5 sites + tx mock fixtures updated

## Implementation

- `lib/xendit/helpers.ts` — APP_URL now `(env || default).replace(/\/+$/, "")`.
- `app/api/xendit/webhook/route.ts` — both advisory-lock sites switched to `$executeRaw`.
- `app/api/invoices/[id]/void/route.ts`, `app/api/invoices/[id]/payments/route.ts`, `app/api/employees/route.ts` — same swap.
- `app/api/__tests__/xendit-webhook.test.ts` — added `$executeRaw` mock to all 6 in-test tx fixtures.
- `lib/__tests__/xendit-helpers-app-url.test.ts` (NEW) — regression test asserting redirect URLs have no double slash when APP_URL ends with `/`.

## Verification

- `npm run build` → green
- `npx vitest run` → 690 passed (was 689 → +1 regression), 42 todo

## Ship Notes

- No migration. No env var change.
- Behavior: webhook now correctly flips invoice to PAID via the advisory-locked tx; redirect URLs are slash-clean regardless of how Vercel env is configured.
- Rollback: revert merge commit; pre-#144 webhook had the same `$queryRaw` shape but a different deserialization path that historically worked — Prisma 7.6 broke it. Don't roll back; this is the forward fix.
