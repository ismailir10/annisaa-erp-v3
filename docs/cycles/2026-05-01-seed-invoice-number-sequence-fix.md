# Seed InvoiceNumberSequence Sync — Unblock Staging CI

## Context

Every CI run on `staging` since `aa35b21 feat(finance): invoice creation auto-retry — kill PENDING_PAYMENT_LINK accumulation (#151)` has been red on the same eight Playwright tests under `e2e/admin.spec.ts › Admin tagihan flows (bulk + manual + retry)`. Postgres logs show repeated `duplicate key value violates unique constraint "Invoice_tenantId_invoiceNumber_key"` for `(tenantId, invoiceNumber)=(<tenant>, INV-2026-0001)`. The retry loop in `app/api/invoices/route.ts:150-202` exhausts after three P2002 collisions and the route returns 409, so `expect(create.status()).toBe(201)` fails.

Root cause: `prisma/seed.ts` creates real `Invoice` rows with hand-coded `invoiceNumber` values (`INV-2026-0001`, `…0002`, `…0005`, plus sibling prefixes `…1001`, `…1002`, `…2001`, `…2002`) but never seeds `InvoiceNumberSequence`. The atomic allocator at `lib/finance/invoice-numbers.ts:54-79` does `INSERT … ON CONFLICT DO UPDATE` against `InvoiceNumberSequence`. With no row, it inserts `lastNumber=1` and returns `INV-2026-0001` — which already exists in the seeded data → P2002. Bumping to `0002`, `0003` collides too. The retry loop only burns three numbers, so the route hits the seed's lower band and gives up.

This blocks every PR that targets `staging`. Today's two open PRs ([#156](https://github.com/ismailir10/annisaa-erp-v3/pull/156), [#157](https://github.com/ismailir10/annisaa-erp-v3/pull/157)) inherit the failure even though neither touches finance.

## Spec

- After the seed creates its hand-numbered invoices, `InvoiceNumberSequence` MUST hold a row per `(tenantId, year)` whose `lastNumber` is at least the highest seeded suffix for that year.
- The next `nextInvoiceNumber()` call after seeding must return a number strictly greater than every seeded `Invoice.invoiceNumber` for the same year.
- No schema change. No allocator change. Pure seed-data fix.

## Tasks

1. After the existing seed loops finish (just before the "🎉 Seed complete!" log), iterate every tenant, parse all of its `Invoice.invoiceNumber` values matching `^INV-(\d{4})-(\d+)$`, group by year, and upsert `InvoiceNumberSequence(tenantId, year, lastNumber=max)`.
2. Stage `lib/db.ts` alongside `prisma/seed.ts` to satisfy the seed-drift pre-commit rule.

## Implementation

- **`prisma/seed.ts`** — appended a single `for` block that walks `prisma.tenant.findMany`, runs `prisma.invoice.findMany` per tenant, parses `INV-YYYY-NNNN` with a regex, computes `max(NNNN)` per year via `Map<number, number>`, and `prisma.invoiceNumberSequence.upsert`s each `(tenantId, year)` pair. Idempotent — reseeding clobbers `lastNumber` to the recomputed max, never lower. ~25 lines.
- **`lib/db.ts`** — re-staged unchanged (seed-drift hook requirement).

## Verification

- `npx tsc --noEmit` — clean under project config.
- `npx vitest run` — 96 files / 826 tests, 0 failures.
- `npm run build` — green.
- Logical check: with the seed's highest year-2026 suffix being `2002` (sibling unpaid invoice), the upsert sets `lastNumber=2002`. The first `POST /api/invoices` after seed → `INSERT INTO InvoiceNumberSequence … ON CONFLICT DO UPDATE SET lastNumber = lastNumber + 1` → returns `2003` → no collision with any seeded number.
- Will be confirmed when this PR's own Playwright run goes green — that is the real verification of record. If it stays red on the same eight tests, the diagnosis is wrong and we re-investigate; if it passes, this is the fix.

## Ship Notes

- No migrations.
- No env vars.
- No dependencies.
- Rollback: revert the seed block. Staging Playwright goes back to red on the same tests. No production impact — sequence-syncing is seed-only logic; production data went through the allocator and is already consistent.
- Merge order: this PR should land first to unblock staging CI; once green, [#156](https://github.com/ismailir10/annisaa-erp-v3/pull/156) and [#157](https://github.com/ismailir10/annisaa-erp-v3/pull/157) can be rebased and merged.
