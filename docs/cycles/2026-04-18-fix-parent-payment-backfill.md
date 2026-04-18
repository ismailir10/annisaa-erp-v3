# Fix Parent Payment Backfill + Reports Perf

## Context

UAT on 2026-04-18 (`docs/uat/reports/2026-04-18-parent.md`, persona Pak Budi as Ibu Nurul, INV-2026-0201) surfaced **2 blockers**:

1. **BLOCKER — JTBD-PARENT-INV-01:** Invoice detail dialog still shows `"Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat."` with no "Bayar" CTA. Only "Tutup" button available. Parent has zero payment path. The 2026-04-17 cycle (`parent-uat-fixes`) fixed the seed code but **not** the existing staging rows — `app/api/admin/seed/route.ts:239-242` checks `if (existingInvoice) continue` and skips without backfilling `xenditPaymentUrl` on the already-created null rows. Re-running `POST /api/admin/seed` after the fix shipped left all pre-existing invoices untouched.

2. **BLOCKER — JTBD-PARENT-REP-01 (timing):** `/parent/reports` takes 5.3s full load on warm staging (threshold: 4s). Root cause: `app/parent/reports/page.tsx` deep-includes `template.categories → indicators` and `scores` for every assessment in the list, loading full rubric data needed only by the detail sheet. For N reports × 6 categories × M indicators + scores, this payload is large and blocks page render.

**Constraints from the requester:**
- Backfill must work for invoices seeded *before* the 2026-04-17 fix shipped (not just new-invoice path).
- Do not reintroduce the duplicate "sedang disiapkan" message removed in 2026-04-17.
- Parent payment flow step count must not increase.

**Root-cause chain:**
- Invoice backfill gap: seed's idempotency guard (`findFirst → continue`) protects row integrity but drops the URL update. Fix: patch null-URL payable invoices instead of continuing.
- Reports perf: list query loads detail-only data (categories/indicators/scores). Fix: defer to a lazy `/api/guardian/assessments/[id]` fetch, matching the pattern used by the invoice detail sheet.

**Assumptions:**
1. Patching `xenditPaymentUrl` on existing null-URL SENT/PARTIALLY_PAID invoices is safe — the URLs are deterministic (`checkout-staging.xendit.co/web/demo-<invoiceNumber>`), idempotent, and already used for newly-created seed invoices.
2. OVERDUE is not in the current seed status rotation but is a payable status — add it to `needsPaymentLink` so future seed expansions don't miss it.
3. The lazy assessment detail endpoint will be guardian-scoped (same auth pattern as `guardian/invoices/[id]`).
4. The assessment detail sheet currently receives all data as props from the list query — it will switch to fetching on open, matching the invoice-detail-sheet pattern. Export name `AssessmentsTable` is preserved.
5. No DB migration required — schema unchanged.

## Spec

**Acceptance criteria:**

- [ ] Re-running `POST /api/admin/seed` backfills `xenditPaymentUrl` on all SENT/PARTIALLY_PAID/OVERDUE invoices that currently have a null URL. Invoices already having a URL are untouched.
- [ ] Opening INV-2026-0201 (or any seeded SENT invoice) in the parent portal shows "Bayar Sekarang" button with the Xendit checkout URL.
- [ ] The status banner in the invoice detail sheet shows exactly one message per state — no duplicate "sedang disiapkan" copy (preserved from 2026-04-17 fix).
- [ ] `/parent/reports` list query fetches only `id`, `templateName`, `period`, `programName`, `status` — no categories, indicators, or scores.
- [ ] A new `GET /api/guardian/assessments/[id]` endpoint returns full assessment detail (categories, indicators, scores) for the authenticated guardian's child.
- [ ] Opening the assessment detail sheet lazy-fetches from the new endpoint; no data is missing vs. the current behaviour.
- [ ] `/parent/reports` page load drops below 4s on warm staging (blocker cleared).
- [ ] Admin, teacher, super-admin portals unchanged.
- [ ] Between-task gate green: `npm run build && npx vitest run`.
- [ ] End-of-cycle gate green: `npm run build && npx vitest run && npx playwright test`.

**Non-goals:**
- No weekly attendance summary (JTBD-PARENT-ATT-01 — deferred since 2026-04-17).
- No changes to the invoice detail sheet UI beyond what's already in the 2026-04-17 fix.
- No changes to bulk invoice generator or production Xendit auto-create hook.
- No schema migration.
- No Xendit real-payment integration testing (placeholder URLs are acceptable for UAT).

## Tasks

- [x] **Task 1 — Backfill xenditPaymentUrl in seed idempotency guard**
  Edit `app/api/admin/seed/route.ts` at lines 238-242: when an existing invoice is found with `xenditPaymentUrl === null` and its status is SENT, PARTIALLY_PAID, or OVERDUE, issue a `prisma.invoice.update` to set the deterministic URL (`https://checkout-staging.xendit.co/web/demo-${invoiceNumber}`), then `invoiceCount++; continue`. If the URL is already set, skip as before. Also extend `needsPaymentLink` at line 249 to include OVERDUE.
  _Acceptance: run seed twice; first run patches nulls, second run skips (URL already set). Opening any seeded SENT/PARTIALLY_PAID invoice in parent portal shows "Bayar Sekarang" button._

- [x] **Task 2 — Add `/api/guardian/assessments/[id]` detail endpoint**
  Create `app/api/guardian/assessments/[id]/route.ts`: guardian-scoped GET, same auth pattern as `guardian/invoices/[id]`. Verify the assessment belongs to one of the guardian's children via student ownership. Return full detail: `id`, `templateName`, `period`, `programName`, `categories` (with `indicators`), `scores`. Serialize all Decimal/Date fields.
  _Acceptance: `GET /api/guardian/assessments/<id>` with GUARDIAN session returns full rubric; 403 for SCHOOL_ADMIN; 404 for other guardian's child._

- [ ] **Task 3 — Slim the reports list query + wire up lazy detail fetch**
  In `app/parent/reports/page.tsx`: change `prisma.studentAssessment.findMany` to select only `id`, `template.name`, `template.program.name`, `period`, `status` — drop `categories`, `indicators`, `scores` from the list query. Update the data shape passed to `<AssessmentsTable>`. In `app/parent/assessments-table.tsx`: accept the slimmed list prop; when "Lihat" is clicked, fetch from the new `/api/guardian/assessments/[id]` endpoint (same fetch+loading pattern as `invoice-detail-sheet.tsx`). Show `Skeleton` while loading. Export name `AssessmentsTable` unchanged.
  _Acceptance: network tab shows list request returns ~10× less payload; detail sheet still shows all six rubric domains._

- [ ] **Task 4 — End-of-cycle gate + docs**
  Run `npm run build && npx vitest run && npx playwright test`. Update `docs/uat/jobs/parent.md` to mark INV-01 backfill path as fixed (reference this cycle). Stage `docs/uat/reports/2026-04-18-parent.md` via `git add -f`. Fill Verification + Ship Notes below.
  _Acceptance: 25/25 Playwright green; all vitest green; cycle doc complete._

## Implementation

- Task 2: Assessment detail endpoint — `app/api/guardian/assessments/[id]/route.ts` (new) — guardian-scoped GET returning full rubric (categories/indicators/scores); tenant+child ownership check mirrors invoice pattern.
- Task 1: Seed backfill — `app/api/admin/seed/route.ts`, `app/api/__tests__/seed-invoice-url.test.ts` — changed idempotency guard from hard-skip to conditional backfill: when an existing invoice has `xenditPaymentUrl === null` and status is SENT/PARTIALLY_PAID/OVERDUE, issues a `prisma.invoice.update` to set the deterministic URL. Added 7 new unit tests for `shouldBackfill` decision logic (116 tests total).

## Verification

- Task 2: build ✅ clean, vitest ✅ 116/116. Endpoint type-checks; auth pattern mirrors guardian/invoices/[id].
- Task 1: build ✅ clean, vitest ✅ 116/116. Backfill logic unit-tested: SENT/PARTIALLY_PAID/OVERDUE with null URL → backfills; already-set URL → skips; PAID/DRAFT/CANCELLED → skips.

## Ship Notes

<!-- /ship fills this section -->
**Migrations:** none.
**New env vars:** none.
**Seed:** run `POST /api/admin/seed` after deploy — backfills null xenditPaymentUrls on existing staging invoices.
**Rollback:** all changes are seed logic + API + UI only; `git revert` is safe at any point.
