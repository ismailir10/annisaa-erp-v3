# Hotfix — Bulk generate "Illegal invocation" on fetch property-access

## Context

User reproduced bulk-generate failure on staging: clicked Buat Tagihan → confirmed dialog "179 siswa akan ditagih. Lanjutkan?" → toast "Dibatalkan setelah 0/179 tagihan dibuat". Vercel logs showed `/api/invoices/generate/plan` POST 200 but ZERO `/api/invoices/generate/batch` calls. Network tab via Chrome MCP confirmed: 3 batch attempts ALL failed client-side with `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`. Three-strike retry exhausted → orchestrator marked aborted, snapshot.created=0, xenditFailed=0.

Root cause: in `lib/finance/run-bulk-generate.ts:113` and `run-bulk-retry.ts:137`, native `fetch` was assigned to `fetchImpl = input.fetchImpl ?? fetch`. Plan call worked because top-level `fetchImpl(...)` invocation has `this` bound to the enclosing scope (works on most browsers). Batch call failed because `callBatchWithRetry` receives fetchImpl as object property and invokes it as `input.fetchImpl(...)` — property access binds `this === input`, violating WHATWG fetch's `this === window` requirement.

## Spec

- Bind native `fetch` to `globalThis` when assigning the alias: `fetch.bind(globalThis)`.
- Apply to both orchestrators (generate + retry).
- No test changes — existing tests use mock fetchImpl which bypasses the bug.

## Verification

- `npm run build` → green
- `npx vitest run` → 690 passed
- Manual: Chrome MCP retry — see commit body trace.

## Ship Notes

No env, no migration. Pure client-side library fix.
