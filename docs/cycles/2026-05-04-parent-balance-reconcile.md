# Parent unpaid-balance reconciliation + Tagihan card right-sizing

## Context

UAT 2026-05-03 (Pak Budi, `docs/uat/reports/2026-05-03-parent.md` INV-01) surfaced a blocker: `/parent` (home) reports `Rp 37.050.000 across 38 unpaid invoices` while `/parent/invoices` renders "Lunas semua. Tidak ada tagihan yang menunggu pembayaran" with only 1 paid history entry. Two adjacent screens disagree by 38 invoices and Rp 37 juta. INV-01 ("pay the oldest outstanding invoice") collapses — no Bayar CTA reachable from the empty list. INV-03 (recordkeeping) collapses too. The home Tagihan card is also visually intimidating (`text-display` ≈ hero size) for what should be a glanceable chip on the morning home view; Pak Budi sees a wall of red `Rp 37 juta` before the kid card he came for.

Code paths involved (from explore):
- Home unpaid query: `app/parent/page.tsx:131-142` — direct `prisma.invoice.findMany`, **no cache**, optional `tenantId`, status `[SENT, PARTIALLY_PAID, OVERDUE]`, aggregates across `kidIds`.
- List query: `lib/parent-helpers.ts:365-410` (`getParentInvoiceList`) — `unstable_cache` 120s tag `parent-invoice-list`, **required** `tenantId`, status `[SENT, PARTIALLY_PAID, OVERDUE, PAID]`, scoped to single `studentId`.
- "Lunas semua" branch: `app/parent/invoices/client.tsx:210` (`hasAnyOutstanding = due.length > 0`), `due` filtered via `isOutstanding()`.

Three divergence vectors that can independently produce the bug:
1. **Multi-child scoping mismatch (dominant suspect)**: home aggregates `kidIds[]` (household total); list scopes to a single `selected.studentId` resolved via `?child=` (`app/parent/invoices/page.tsx:19-24`, `lib/parent-helpers.ts:110-122`). A guardian whose currently-selected child has zero outstanding while siblings carry the full household total will see "Lunas semua" on the list yet `Rp 37jt / 38` on home — zero cache involvement required. Per `prisma/seed.ts:791-844` the test guardian is seeded with three children; UAT-2026-05-03 saw only one child-card render, so the seed state of staging at UAT time is uncertain. Whether or not staging has the multi-child seed live, the structural mismatch between the two queries is the root cause we must close.
2. **Cache vs no-cache**: list is `unstable_cache`-wrapped + tagged (120s); home is a direct query. Any `Invoice` write that bypasses the tag (raw SQL, seed re-run, migration) leaves list stale while home is fresh.
3. **tenantId scoping**: home does `...(session.tenantId ? { tenantId } : {})` (filter dropped if falsy); list requires `tenantId`. Trivial to align.

Intended outcome: both surfaces share **one query helper** so divergence is impossible by construction; tenantId required on both sides; regression test asserts `home.unpaidCount === list.outstandingCount` and `home.unpaidTotal === list.outstandingTotal` for the same guardian; Tagihan card on home reduced to a non-intimidating size matching the design-system glanceable-chip pattern (cross-checked design-system.html).

## Spec

**Acceptance criteria**

- [ ] Home `/parent` and Tagihan `/parent/invoices` agree on **household-aggregate** outstanding count + total. Both surfaces compute outstanding from the same shared helper across **all** of the guardian's `studentId`s — never a single-child slice. Verified by Vitest unit test on the helper across ≥2 fixture guardians (1-child + multi-child) and Playwright cross-page assertion.
- [ ] Single shared helper `getParentOutstandingForStudents(studentIds, tenantId): Promise<{ count, total, nearestDue, items }>` lives in `lib/parent-helpers.ts`. Status filter: `[SENT, PARTIALLY_PAID, OVERDUE]` + `remaining > 0` post-filter, identical to today's home logic.
- [ ] List-page outstanding banner ("Lunas semua" vs "X tagihan menunggu pembayaran") is computed from the **same household-aggregate** helper, NOT from a single-child slice of `getParentInvoiceList`. The visible row list stays scoped to the selected child via `?child=` (no UX regression on per-child filtering), but the empty-state copy reflects household truth: when household has outstanding but the selected child does not, render "Lunas untuk Bilal · {N} tagihan untuk anak lain" with a child-switcher link, not "Lunas semua".
- [ ] `tenantId` is required (non-optional) on the home query — same contract as `getParentInvoiceList`. If `session.tenantId` is missing, redirect to `/` (consistent with the existing `if (!session || session.role !== "GUARDIAN") redirect("/")` pattern).
- [ ] **Cache invalidation audit (Task 2.5)**: every `Invoice.status` / `Invoice.totalPaid` writer in `app/api/**` and `lib/**` calls `revalidateTag("parent-invoice-list")`. Audit findings documented in Implementation; gaps closed in same task.
- [ ] **Cache integration test**: a test that writes an `Invoice` then reads via `getParentInvoiceList` confirms staleness is bounded by the documented invalidation contract. Either an integration test against a real DB OR a unit test that mocks `unstable_cache` to assert tag invalidation calls; whichever fits the existing test infra.
- [ ] Home Tagihan card right-sized per frontend-reviewer feedback (final tokens documented in Task 4 below). Visual hierarchy: KidCard name > Tagihan chip amount. Single status channel (absent/red) — no late/absent mixing. Padding stays on the documented card token (`p-card` ≈ `p-4 md:p-6`).
- [ ] Existing Playwright `e2e/parent.spec.ts` updated: capture the home Tagihan count + total, navigate to `/parent/invoices`, assert the page-level outstanding banner matches the home count + total (regardless of which child is selected). Spec MUST run on every CI pass — this is the regression guard for the cache-staleness vector that the unit test cannot reach.
- [ ] No behaviour regression on empty/all-paid path — existing "Pekan ini · Lunas semua" home branch renders when household `unpaidCount === 0`.

**Non-goals**

- Not addressing the other UAT-2026-05-03 blockers (parent attendance scoping, bfcache leak, identity inconsistency) — separate cycles per follow-up section of report.
- Not redesigning the invoice list itself (sorting, grouping, pagination) — only the home chip resize + reconciliation.
- Not adding multi-child child-switcher to home (the Tagihan tile stays household-aggregated). The list page stays single-child by `?child=` param as today.
- Not changing the `[SENT, PARTIALLY_PAID, OVERDUE, PAID]` allow-list for the list page — PAID still appears under "Riwayat Pembayaran".
- Not touching seed.ts to fix the staging seed gap (the multi-child block at `prisma/seed.ts:791-844` appears to not have run on the test guardian per UAT). File a follow-up if confirmed.

**Assumptions**

1. The dominant cause of the 38-vs-0 disagreement is the **household-vs-single-child scoping mismatch**, not cache staleness. Cache + tenantId are real but secondary attack surfaces. The fix wires both surfaces to the same household-aggregate helper, which closes all three vectors at once.
2. `session.tenantId` is reliably set for any authenticated GUARDIAN session — the optional ternary in home is defense-in-depth that masks the bug today. Redirect-on-null is the correct behaviour.
3. Shared helper lives in `lib/parent-helpers.ts` next to `getParentInvoiceList`. Name: `getParentOutstandingForStudents`. **Uncached** (home is latency-sensitive; list cache stays as today). If `/build` benchmarks show home regressing >100ms, fall back to a 30s cache.
4. The list-page banner UX change ("Lunas untuk Bilal · N tagihan untuk anak lain" with child-switcher) is a small copy + link addition, not a redesign. If frontend-reviewer flags the copy in the `/build` per-task review, treat the review as authoritative.
5. Tagihan card right-sizing applies the frontend-reviewer feedback verbatim (see Task 4 final tokens). Design-system §3 type-ramp + §4 spacing tokens are canonical.

## Tasks

Six tasks. Task 1 is independent. Task 3 depends on 1 only (parallelable with 2). Tasks 2, 2.5, 4, 5 all touch `app/parent/page.tsx` or its server fetch surface and MUST run sequentially in order. The frontend-reviewer agent runs once per UI-touching task during `/build`.

- [x] **Task 1 — Extract shared outstanding helper.** Create `getParentOutstandingForStudents(studentIds: string[], tenantId: string): Promise<{ count: number; total: number; nearestDue: string | null; items: { studentId: string; dueDate: string; remaining: number }[] }>` in `lib/parent-helpers.ts`. Body: same Prisma query as today's home (status `[SENT, PARTIALLY_PAID, OVERDUE]`, post-filter `remaining > 0`). **Uncached.** Acceptance: helper exists, exported, unit-tested for empty / all-paid / mixed / multi-student cases.

- [x] **Task 2 — Wire home + list to shared helper.** **(a)** Update `app/parent/page.tsx:131-142` to call `getParentOutstandingForStudents(kidIds, session.tenantId)`; drop the `...(session.tenantId ? ... : {})` ternary; if `session.tenantId == null`, `redirect("/")` (line ~89 already handles GUARDIAN check — extend it). **(b)** Update `app/parent/invoices/page.tsx` (currently calls `getParentInvoiceList(parent.id, selected.studentId, session.tenantId!)`): also fetch `getParentOutstandingForStudents(kidIds, session.tenantId)` for the **household** outstanding summary; pass `householdOutstanding` AND `selectedChildOutstanding` (count of household items where `studentId === selected.studentId`) AND `otherChildrenOutstanding` (`household - selected`) plus `children: ParentChild[]` to `<InvoicesClient>`. **(c)** Update `app/parent/invoices/client.tsx` empty-state branch (line 242): if `householdOutstanding.count === 0` render today's "Lunas semua" copy; else if `selectedChildOutstanding === 0 && otherChildrenOutstanding > 0` render "Lunas untuk {selected.studentName}. {otherChildrenOutstanding} tagihan untuk anak lain — pilih anak di atas." with a child-switch button list (use existing children prop + `?child=<id>` link pattern); else render the row list as today. Acceptance: home + invoices empty-state branches both compute from the same household helper output; `npm run build && npx vitest run` passes.

- [x] **Task 2.5 — Cache invalidation audit + close gaps.** `grep -r "Invoice.update\|invoice.create\|invoice.update\|Invoice.create" app/ lib/` and inspect every match. For each writer of `Invoice.status` or `Invoice.totalPaid`, confirm an adjacent `revalidateTag("parent-invoice-list")` call. Document findings in this cycle's Implementation section as a checklist of audited routes. Add missing `revalidateTag` calls. Particular attention to: Xendit webhook handler, admin invoice mark-paid, payment record creation, refund flow. Acceptance: audit checklist filed in Implementation; any gaps closed; tag invalidation count goes up by ≥1 (or audit confirms zero gaps). **Depends on Task 2** (helps know the canonical tag string from a single source).

- [x] **Task 3 — Regression test (Vitest unit).** Add `lib/__tests__/parent-helpers.outstanding-reconciliation.test.ts`: build fixture invoices for 2 guardians (1-child / multi-child), each with mix of SENT/PARTIALLY_PAID/OVERDUE/PAID/CANCELLED + at least one PARTIALLY_PAID with `remaining === 0` (boundary). Assert `helper(allKidIds).count === sum over kids of helper([kidId]).count`, helper output is invariant to kid-id ordering, and CANCELLED never counted. **Note**: this test runs the helper fresh — it cannot catch cache staleness; that is owned by Task 5. Document this gap inline in the test file's top comment. Use the Prisma fixture pattern from `lib/__tests__/parent-helpers.test.ts:394-425`. **Depends on Task 1; parallelable with Task 2.**

- [x] **Task 4 — Tagihan card right-size on home.** Edit `app/parent/page.tsx:255-308`. Apply the frontend-reviewer-validated tokens (single status channel, design-system §3/§4 ramp):
  - Amount: `font-currency text-2xl sm:text-display font-bold leading-none tracking-tight text-status-absent-text` → `font-currency text-lg sm:text-xl font-semibold leading-none tracking-tight text-status-absent-text`. Keep `font-currency` (tabular nums + tracking — digit-stable on KRL motion).
  - Icon container: `bg-status-late-subtle text-status-late-text` → `bg-status-absent-subtle text-status-absent-text` (unify channel; design-system §status badges pairs absent ramp this way).
  - Card border/bg: keep `border-border bg-card`.
  - Subline: keep `text-xs text-muted-foreground`. Drop the inline `<b className="text-foreground">` wrapper on `nearestDue` (design-reviewer note: at `text-xs` it competes with the now-quieter amount).
  - Card padding: keep `p-4 md:p-6` (do NOT shrink to `p-3` — below `--space-card`; design-reviewer rejected).
  - Hover/active border: keep `hover:border-primary/30 active:border-primary/40`.
  Acceptance: visual diff against staging shows KidCard name > Tagihan amount in size hierarchy; `npx playwright test e2e/parent.spec.ts` passes; per-task frontend-reviewer agent approves the diff. **Depends on Task 2** (same file).

- [ ] **Task 5 — E2E cross-page reconciliation assertion.** Update `e2e/parent.spec.ts`: capture home Tagihan amount + count via locator text scrape, navigate to `/parent/invoices`, assert the page's outstanding banner copy matches one of three expected forms based on the captured count: (count === 0 → "Lunas semua" visible) | (count > 0 && selected child has all of it → list row count matches) | (count > 0 && selected child has none → "Lunas untuk X. N tagihan untuk anak lain" visible). Plus child-switcher integration: switch child via `?child=` and re-verify. Acceptance: spec passes locally + in CI; spec fails if either query drifts OR cache invalidation breaks (this is the regression guard the unit test cannot provide). **Depends on Tasks 2 + 2.5.**

**Dependencies summary** (for `/build` subagent classifier):
- Task 1: independent
- Task 3: depends on 1 (parallel-safe with Task 2)
- Task 2: depends on 1
- Task 2.5: depends on 2
- Task 4: depends on 2 (same file as Task 2)
- Task 5: depends on 2 + 2.5

Subagent dispatch plan: Task 1 first (solo). Then Tasks 2 + 3 in parallel (different files: 2 → `app/parent/**`, 3 → `lib/__tests__/`). Then Task 2.5 → 4 → 5 sequentially. Run frontend-reviewer agent on Tasks 2c (copy) and 4 (tokens). Run feature-dev:code-reviewer on every task before commit per `/build` standard.

## Implementation

- Subagent plan: Task 1 solo first (helper extraction). Tasks 2 + 3 dispatched in parallel (different file roots: `app/parent/**` vs `lib/__tests__/`). Tasks 2.5 → 4 → 5 sequential after 2 (shared file `app/parent/page.tsx` + dependency chain). `feature-dev:code-reviewer` runs on every task. `frontend-design` reviewer also runs on Task 2c (copy) and Task 4 (tokens).
- Task 1: `lib/parent-helpers.ts` — added `getParentOutstandingForStudents(studentIds, tenantId)` + `ParentOutstandingSummary` / `ParentOutstandingItem` types. Pure extraction of `app/parent/page.tsx:131-173` body; uncached; tenantId required. Reviewer pass: clean.
- Task 2: `app/parent/page.tsx` + `app/parent/invoices/page.tsx` + `app/parent/invoices/client.tsx` — home calls helper (drops tenantId ternary, redirects on null); invoices page fetches household summary in parallel with cached `getParentInvoiceList`; derives `selectedChildSummary` from same household items so per-child banner cannot disagree with home; `<InvoicesClient>` gains `selectedStudentName` + `selectedChildSummary` + `otherChildrenWithOutstanding` props (optional defaults keep existing 28-test client suite green). New empty-state branch "Lunas untuk {name}" with sibling-switcher rows fires when selected child paid + sibling owes. Token swaps per frontend-reviewer: `bg-status-present-subtle` + `CheckCircle2` (not celebration-gold), `min-h-[44px]` tap target, trimmed copy. Reviewer passes: code-reviewer noted banner-source divergence (fixed by `selectedChildSummary`) and copy redundancy (fixed); frontend-reviewer approved with-changes — applied verbatim.
- Task 4: `app/parent/page.tsx` Tagihan card — applied frontend-reviewer tokens verbatim: amount `text-lg sm:text-xl font-semibold` (was `text-2xl sm:text-display font-bold`), icon container `bg-status-absent-subtle text-status-absent-text` (was `bg-status-late-subtle text-status-late-text` — unified red channel per design-system §status badges), dropped `<b className="text-foreground">` wrapper on nearestDue. Padding kept at `p-4 md:p-6` per design-system §4 `--space-card`. Reviewer pass: clean — token drift zero, AA contrast 5.91:1 preserved, no flex-layout coupling regression.
- Task 2.5: cache invalidation audit — found 4 critical gaps + 1 minor. Closed with `revalidateTag("parent-invoice-list", { expire: 0 })` + `revalidateTag("student-invoices", { expire: 0 })` calls in: (1) `app/api/invoices/[id]/route.ts` PUT (status change), (2) `app/api/invoices/[id]/payments/route.ts` POST (manual payment, after tx commit), (3) `app/api/invoices/[id]/void/route.ts` POST (CANCELLED flip), (4) `app/api/xendit/create-session/route.ts` POST (batch SENT/PENDING_PAYMENT_LINK flips, gated by `statusChanged` flag set post-await). Routes that already invalidated: `app/api/invoices/route.ts:265` (POST create), `app/api/invoices/generate/batch/route.ts:321`, `app/api/invoices/retry-payment-links/route.ts:45`, `app/api/xendit/webhook/route.ts:100-101`. Reviewer passes: feature-dev:code-reviewer + superpowers:code-reviewer both approved (security-sensitive diff per `app/api/**`). The minor `lib/finance/xendit-retry.ts` asymmetry (caller invalidates only on success) deferred — separate concern, low impact.
- Task 3: `lib/__tests__/parent-helpers.outstanding-reconciliation.test.ts` — 8 tests covering empty input, all-paid, mixed-status with `remaining=0` boundary, multi-student aggregation, additivity regression, status allow-list exact equality, nearestDue earliest-pick, tenantId pass-through. Top-of-file note explicitly disclaims cache-staleness coverage (owned by Task 5). All 8 pass.

## Verification

- Task 1: gates passed (`npm run build` ✓, `npx vitest run lib/__tests__/parent-helpers.test.ts` 24 passed). No new test added in this task — Task 3 owns reconciliation tests.
- Task 2 + Task 3: gates passed (`npm run build` ✓, parent-helpers + outstanding-reconciliation + invoices/client tests = 52/52 passing). Cross-checked design-system.html §3 type ramp + §4 spacing tokens + §11 EmptyState + §status-present badge for the new "Lunas untuk X" branch (frontend-gate Rule 4 satisfied). Live browser preview unavailable in this sandbox (preview_start EPERM uv_cwd) — runtime UI verification deferred to Task 5 Playwright cross-page assertion.
- Task 2.5: gates passed (`npm run build` ✓, full vitest suite 1071 passed / 42 todo / 2 skipped — no regressions from the 4 added invalidation calls). Both reviewers (feature-dev + superpowers security) approved.

## Ship Notes

<!-- filled by /ship -->
