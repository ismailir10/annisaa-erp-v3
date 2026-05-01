# Finance E2E Test Fixes — Unblock Staging CI

## Context

After [#158](https://github.com/ismailir10/annisaa-erp-v3/pull/158) (`feat/seed-invoice-number-sequence-fix`) cut staging CI failures from 8 to 3 by syncing `InvoiceNumberSequence`, three pre-existing test failures remain — none related to product code, all stale assertions against components that drifted:

1. `e2e/admin.spec.ts:429` — `bulk generate plans, confirms, runs sequential batches, lands all in PENDING_PAYMENT_LINK`. Times out at 30s waiting for `tagihan dibuat (` toast. The post-chunk auto-sweep added in cycle `2026-04-26-finance-robustness-a-b-c` re-runs `runBulkRetry` on every PENDING row landed by the chunk loop. With ~50 seeded students and a fake Xendit key, the sweep cycles through its full 3-strike abort before `phase: "done"` flips. Empirically lands at 35-45s on CI.

2. `e2e/admin.spec.ts:559` — `header bulk-retry button visible when stats.pendingPaymentLink > 0 and confirms`. The "Coba Lagi Link (N)" header surface was wrapped in `PendingLinkBreakdownPopover` by [#151](https://github.com/ismailir10/annisaa-erp-v3/pull/151) (`aa35b21`). Clicking the trigger now opens the popover, NOT the confirm dialog. The confirm dialog is opened by the inner "Coba Lagi Sekarang" button. Test never clicks the inner button → confirm dialog never opens → `Membuat ulang link` text never appears.

3. `e2e/admin.spec.ts:691` — `manual create dialog: combobox search → select student → submit → toast`. The student picker's combobox uses a Radix-style `Popover` that portals its `PopoverContent` to `document.body`. The test scopes `getByPlaceholder("Cari nama siswa...")` to `dialog`, so the locator resolves to zero matches even though the search input is rendered (just outside the dialog's DOM subtree).

4. `e2e/parent.spec.ts:98` — `parent can open Penghubung tab with Di Sekolah/Di Rumah/Catatan tabs`. Strict-mode violation: `page.locator("text=Buku Penghubung")` matches both the page heading and the sidebar nav link.

## Spec

- All four tests must pass under the same CI fixture used by every other admin/parent suite.
- No product-code changes — the popover, portal, sweep, and sidebar-nav behaviors are all intentional.
- The 30s → 60s timeout bump on test 429 is scoped narrowly with an inline comment so future readers know the empirical basis.

## Tasks

1. `e2e/admin.spec.ts:429` — bump the final `expect(...toBeVisible)` timeout from 30_000ms to 60_000ms with an inline comment citing the auto-sweep cycle.
2. `e2e/admin.spec.ts:559` — after clicking the `Coba Lagi Link (N)` header trigger, click the inner "Coba Lagi Sekarang" button to open the confirm dialog, then assert.
3. `e2e/admin.spec.ts:691` — re-scope `search` and `studentItem` locators from `dialog` to `page` (they live in a portaled `PopoverContent` outside the dialog's DOM subtree).
4. `e2e/parent.spec.ts:98` — switch the `Buku Penghubung` text selector to `getByRole("heading", { name: /^Buku Penghubung$/ })` to avoid the sidebar-nav-link strict-mode collision.

## Implementation

- **`e2e/admin.spec.ts`** — three small in-place edits, each with a comment explaining why.
- **`e2e/parent.spec.ts`** — one selector swap with comment.

## Verification

- `npx vitest run` — 96 files / 826 tests pass, 0 failures (sanity — vitest doesn't run e2e but confirms nothing else regressed).
- The real verification of record is this PR's own Playwright run going green, since all four edits are e2e-only.
- Cross-checked `.claude/standards/design-system.html` — no visual change; e2e selector edits only.

## Ship Notes

- No migrations.
- No env vars.
- No dependencies.
- Depends on [#158](https://github.com/ismailir10/annisaa-erp-v3/pull/158) — without the seed fix the suite still hits the original P2002 errors. Branch is rebased onto `feat/seed-invoice-number-sequence-fix` so the dependency is explicit.
- Rollback: revert the four selector/timeout edits. CI returns to the 3-failing-tests state of #158.
- Once green: this PR's merge unblocks [#156](https://github.com/ismailir10/annisaa-erp-v3/pull/156) and [#157](https://github.com/ismailir10/annisaa-erp-v3/pull/157).
