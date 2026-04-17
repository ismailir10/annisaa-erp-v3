# Parent Portal UAT Fixes — Payment Blocker + Mobile UX

## Context

UAT on 2026-04-17 (`docs/uat/reports/2026-04-17-parent.md`, persona Pak Budi, mobile 375px) surfaced **1 blocker + 3 majors** on the parent portal. Teacher UAT the same day was clean (0 blockers/majors). This cycle addresses the blocker and the two highest-ROI majors; weekly-attendance-summary (JTBD-PARENT-ATT-01) is deferred — lower ROI per finding, and the existing flat list is usable for this cycle's scope.

**Findings addressed:**
1. **BLOCKER — JTBD-PARENT-INV-01:** opening an unpaid invoice (Rp 475.000, April 2026) shows *"Link pembayaran sedang disiapkan"* twice (top banner + bottom footer) with no pay button. Parent cannot pay. On a KRL commute Pak Budi closes the app and forgets; late fee follows.
2. **MAJOR — JTBD-PARENT-REP-01:** `/parent/reports` renders `AssessmentsTable` (5-col DataTable: Template, Periode, Program, Status, Actions) inside `max-w-md` layout. At 375px the `Lihat` button is off-screen; horizontal scroll clips the report name.
3. **MAJOR — JTBD-PARENT-HOME-01:** home `Kehadiran` quick-link card is icon + label only. Parent cannot tell if child was at school today without tapping through — one extra navigation while holding a handrail.

**Root cause of the blocker — it's a seed issue, not a production bug.** PR #44 (`899e985`) wired Xendit auto-create into `PUT /api/invoices/[id]` when status → `SENT`. The bulk billing generator (`app/api/invoices/generate/route.ts:131`) creates invoices in `DRAFT`, so production admins hit the PUT+SEND path and links get generated. But `app/api/admin/seed/route.ts:245` creates demo invoices **directly in `SENT`/`PARTIALLY_PAID`/`OVERDUE` status without hitting that PUT route** — every demo invoice is linkless. The UAT invoice (Rp 475.000, April 2026) was one of those. Plus the detail sheet renders the "sedang disiapkan" fallback **twice** (`invoice-detail-sheet.tsx:170` in the status banner, `:296` in the payment-action block).

**Fix approach:** patch the demo seed so SENT/PARTIALLY_PAID/OVERDUE invoices carry a deterministic placeholder `xenditPaymentUrl` (Xendit staging-checkout URL shape). Clean up the duplicate UI message. No lazy-gen on GET, no new API semantics, no migration — bulk-gen is already correct.

**Process gap — seed before UAT.** `/run-uat` does not currently require demo-seed hydration. Playwright CI uses `prisma/seed.ts` (no invoices); manual UAT hits `/api/admin/seed` for the richer dataset. Future UAT runs must verify seed state first or they'll keep finding seed artifacts and misclassifying them as product bugs. Addressed as a task this cycle.

## Spec

**Acceptance criteria:**

- [ ] Demo seed (`POST /api/admin/seed`) populates `xenditPaymentUrl` on every SENT / PARTIALLY_PAID / OVERDUE invoice it creates, using a deterministic placeholder of the form `https://checkout-staging.xendit.co/web/demo-<invoiceNumber>`. PAID and CANCELLED invoices get no URL (not applicable).
- [ ] Opening a seeded payable invoice in the parent portal shows the "Bayar Sekarang" button (no more "Link pembayaran sedang disiapkan" banner).
- [ ] Invoice detail sheet never shows two stacked fallback messages. Exactly one status indicator per state (PAID, OVERDUE, PARTIALLY_PAID, SENT-with-link, SENT-without-link, CANCELLED).
- [ ] `/parent/reports` at 375px viewport: no horizontal scroll, report name + period + status badge + full-width "Lihat" button all visible per item without sideways scrolling.
- [ ] `/parent` home `Kehadiran` quick-link card shows today's attendance status as a `StatusBadge`. When no record exists for today, show a neutral "Belum dicatat" indicator.
- [ ] `/run-uat` skill doc explicitly requires verifying demo-seed hydration before running UAT, so future runs don't re-surface seed artifacts as product bugs.
- [ ] Admin, teacher, and super-admin portals unchanged.
- [ ] Between-task gate green on every commit: `npm run build && npx vitest run`.
- [ ] End-of-cycle smoke green: `npx playwright test` (25 tests).

**Non-goals:**
- No weekly attendance summary (JTBD-PARENT-ATT-01 deferred).
- No lazy-gen of Xendit links on guardian read path. Bulk-gen creates in DRAFT → PUT+SEND hook fires → production is fine. Seed was the only linkless source.
- No changes to bulk invoice generator or the admin PUT+SEND auto-create hook.
- No "Minta Link Pembayaran" admin-ping CTA (UAT suggested it; unnecessary once seed is fixed).
- No migration/backfill for existing DB rows. Production DB is clean (tests confirm bulk-gen path is intact); staging/dev will be repopulated by the next seed run.
- Reports detail sheet (the sliding panel that opens on "Lihat") is not restyled this cycle — only the list view.
- No changes to `StatusBadge` component itself.
- Term-calendar weekend/holiday detection on home attendance badge — literal "today's" record only; "Belum dicatat" when empty.

**Assumptions I'm making:**
1. A deterministic placeholder `xenditPaymentUrl` is acceptable in demo seed. Tapping it will 404 on Xendit's real checkout, which is fine for UAT — the UAT test ends at "button is visible and tappable"; the real Xendit round-trip is a separate integration concern.
2. "Today's attendance" on the home card means **today's** `StudentAttendance` record if it exists; otherwise "Belum dicatat". No weekend/holiday/term-calendar inference.
3. Existing non-seed production invoices already have `xenditPaymentUrl` populated (because bulk-gen creates DRAFT and PUT+SEND auto-links). Not verifying in prod DB; if a stray linkless SENT exists, admin re-send regenerates it.
4. Updating the `/run-uat` skill doc to add a seed-hydration preflight step counts as a task (doc change only — no hook enforcement). Future UAT runs that skip it own the consequences.

→ Correct me now or `/build` will proceed with these.

## Tasks

- [ ] **Task 1 — Seed SENT/PARTIALLY_PAID/OVERDUE invoices with Xendit URL**
  Edit `app/api/admin/seed/route.ts` (around line 245): when creating invoices, set `xenditPaymentUrl: \`https://checkout-staging.xendit.co/web/demo-${invoiceNumber}\`` if the rolled status is `SENT`, `PARTIALLY_PAID`, or `OVERDUE`. Leave `null` for `PAID` / `DRAFT` / `CANCELLED`. Deterministic so repeat seeding is idempotent.
  _Acceptance: re-run seed in demo mode, open any unpaid invoice in parent portal, "Bayar Sekarang" button renders. Vitest covers the URL-shape logic if a unit seam is easy; otherwise rely on manual + Playwright smoke._

- [ ] **Task 2 — Clean up duplicate fallback in invoice detail sheet**
  Edit `app/parent/invoices/invoice-detail-sheet.tsx`: remove the bottom fallback block at lines 293–299 entirely. The top status banner (line 196) already carries the "sedang disiapkan" message — no need to duplicate it. When `isPayable && !hasPaymentLink`, render nothing in the Payment Action block (no button, no repeated copy). When `isPayable && hasPaymentLink`, render the "Bayar Sekarang" button as today. This is a pure UI cleanup — no state changes, no new fields.
  _Acceptance: snapshot/visual check — in every invoice state (SENT-with-link, SENT-without-link, PAID, CANCELLED, PARTIALLY_PAID) there is exactly one status indicator; never two stacked messages._

- [ ] **Task 3 — Replace /parent/reports DataTable with mobile card list**
  Rewrite `app/parent/assessments-table.tsx` as a card-list component. Each card: report template name (bold, truncated w/ ellipsis), period + program (muted subtitle), `StatusBadge` on the right, full-width "Lihat" button at the bottom opening the existing detail sheet. Use `space-y-3` stacking inside the `max-w-md` layout. Empty state uses `EmptyState` component per portal standard. Preserve the `<AssessmentsTable>` export name so `app/parent/reports/page.tsx` doesn't need updates.
  _Acceptance: Playwright resize to 375px — zero horizontal overflow, every "Lihat" button fully tappable. Existing detail sheet behavior unchanged._

- [ ] **Task 4 — Add today's-attendance badge to home Kehadiran quick-link**
  Add `getTodayStudentAttendance(studentId, tenantId)` helper to `lib/parent-helpers.ts` — scalar-only select of today's `StudentAttendance.status` for the student; returns `null` if no record. In `app/parent/page.tsx`, await it alongside the existing home fetches and pass the status into the Kehadiran card (lines 119–129). Render `<StatusBadge status={status} />` when a status exists, else a neutral muted "Belum dicatat" chip. Keep within the `grid grid-cols-3` layout; badge sits below icon+label; no card overflow at 375px.
  _Acceptance: mobile viewport — badge visible on home without scroll; manually flip demo student's attendance status between PRESENT/ABSENT, force-refresh home, confirm reflection._

- [ ] **Task 5 — Add seed-hydration preflight to /run-uat skill**
  Edit `.claude/skills/uat/SKILL.md`: add a preflight step before UAT execution that verifies the demo DB has been seeded via `POST /api/admin/seed` (or explicitly invokes it if missing). Note the distinction between `prisma/seed.ts` (minimal, used by CI Playwright) and the richer admin seed (invoices, payments, admissions — needed for UAT). One short section, ~10 lines.
  _Acceptance: skill doc shows the preflight step; next `/run-uat` run will read it and hydrate before probing._

- [ ] **Task 6 — End-of-cycle gate + docs**
  Run `npm run build && npx vitest run && npx playwright test` — all must pass. Update `docs/uat/jobs/parent.md` to mark INV-01, REP-01, HOME-01 as addressed this cycle (one-line reference each). Stage `docs/uat/reports/2026-04-17-parent.md` via `git add -f` so the consumed report enters history. README.md only needs updating if roadmap/ADR content shifts — not expected here.
  _Acceptance: 25/25 Playwright tests green; all vitest green; cycle doc Verification + Ship Notes filled._

## Implementation

### Task 1 — Seed xenditPaymentUrl (commit f54e7a0)
- `app/api/admin/seed/route.ts`: added `needsPaymentLink` check; sets deterministic `https://checkout-staging.xendit.co/web/demo-${invoiceNumber}` for SENT/PARTIALLY_PAID invoices.
- `app/api/__tests__/seed-invoice-url.test.ts`: 7 unit tests covering all invoice statuses.

### Task 2 — Remove duplicate payment-link fallback (this commit)
- `app/parent/invoices/invoice-detail-sheet.tsx`: collapsed `isPayable && (hasPaymentLink ? button : fallback-copy)` to `isPayable && hasPaymentLink && button`. The status banner already shows the "sedang disiapkan" message — no duplicate needed.

## Verification
<!-- filled by /build -->

## Ship Notes
<!-- filled by /ship -->
