# Fix Parent Invoice Page Cold-Nav Performance

## Context

UAT reports from 2026-04-16 (`docs/uat/reports/2026-04-16-parent.md`) surfaced 3 blockers on the parent portal. Two are already fixed and merged to staging:
- Attendance crash (PR #42) — fixed
- No payment button / Xendit auto-creation (PR #44) — fixed

The remaining unaddressed blocker is **cold-nav performance on `/parent/invoices`**: TTFB 4.6s, full load 5.5s (thresholds: <2s TTFB, <4s full load). Warm reloads are fine (662ms TTFB, 1.5s full load), so the issue is query execution on a cold DB connection + complex Prisma query.

**Root cause analysis:**
The invoices page (`app/parent/invoices/page.tsx`) executes a `prisma.invoice.findMany` with 4-level nested includes (invoice → payments, lines → feeComponent, student → enrollments → classSection → program). All data fetched upfront — no pagination, no projection, no caching.

A previous perf cycle added `unstable_cache` to `getParentWithChildren`, but it was removed in the business-logic audit because the cache key `["parent-children"]` was static — all parents shared the same entry, causing cross-parent data leakage. The cached `getStudentInvoices` helper (2-min TTL) exists but is only used on the dashboard, not the invoices page itself.

**Gap: Teacher UAT not run.** Only admin, super-admin, and parent were tested. Suggest running `/run-uat teacher` separately.

## Spec

- [ ] `/parent/invoices` cold-nav TTFB drops below 2s threshold (currently 4.6s)
- [ ] `/parent/invoices` cold-nav full load drops below 4s threshold (currently 5.5s)
- [ ] No cross-tenant or cross-parent data leakage — cache keys must be scoped to `[parentId, studentId]`
- [ ] Warm-nav performance stays within current acceptable range (<1.5s full load)
- [ ] Invoice detail sheet still loads correctly (lines, payments, student info)
- [ ] Between-task gate passes: `npm run build && npx vitest run`
- [ ] Playwright e2e passes (parent spec, 6 tests)

**Non-goals:**
- No changes to admin invoice pages or Xendit integration
- No changes to `getParentWithChildren` (already working correctly)
- No database schema changes

## Tasks

- [x] **Task 1 — Replace heavy include with select-based projection in invoices page**
  Refactor `app/parent/invoices/page.tsx` to use explicit `select` instead of deep `include` chains. Only fetch fields needed for the invoice list view (id, invoiceNumber, totalAmount, status, dueDate, createdAt, student name). Move heavy data (lines, payments, full enrollment) to the detail sheet — lazy-load when the user opens it.
  _Acceptance: Prisma query on the invoices page touches ≤2 relation levels; no 4-level includes._

- [x] **Task 2 — Add safe caching with parent-scoped keys**
  Wrap the invoice list query in `unstable_cache` with a key scoped to `["parent-invoices", parentId, studentId]` and a 2-minute TTL with revalidation tags. This prevents the cross-parent leak that caused the previous cache removal.
  _Acceptance: cache key includes both parentId and studentId; warm reload hits cache; cold nav triggers at most one Prisma query._

- [ ] **Task 3 — Run between-task gate + end-of-cycle smoke**
  `npm run build && npx vitest run` must pass. Then run `npx playwright test` (25 tests) to confirm no regressions.
  _Acceptance: all 25 Playwright tests pass; build output clean._

## Implementation

- Task 1: Replace heavy includes with select-based projection — `app/parent/invoices/page.tsx`, `app/parent/invoices/client.tsx`, `app/parent/invoices/invoice-detail-sheet.tsx`, `app/api/guardian/invoices/[id]/route.ts` (new) — Replaced 4-level nested Prisma include with scalar-only `select` on the list page. Created a new guardian-scoped API endpoint (`GET /api/guardian/invoices/[id]`) for lazy-loading invoice detail (lines, payments, student enrollment) when the user opens the detail sheet. The detail sheet now fetches on open instead of receiving all data inline.
- Task 2: Add safe caching with parent-scoped keys — `lib/parent-helpers.ts`, `app/parent/invoices/page.tsx` — Added `getParentInvoiceList` cached function using `unstable_cache` with 2-min TTL. Cache key automatically scoped per `[parentId, studentId, tenantId]` via function arguments (prevents the cross-parent data leak from the previous `["parent-children"]` static key). Page now calls the cached function directly — no inline Prisma query.

## Verification

- Task 1: `npm run build` ✓ clean, `npx vitest run` ✓ 90/90 tests pass
- Task 2: `npm run build` ✓ clean, `npx vitest run` ✓ 90/90 tests pass

## Ship Notes

<!-- /ship fills this -->
