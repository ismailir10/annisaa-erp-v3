# UAT Quick Wins — Teacher & Parent Portal

## Context

UAT on 2026-04-16 surfaced 4 blockers and 2 majors across the parent and teacher portals (admin and super-admin are clean). This cycle picks the **code-fixable quick wins** — small, self-contained changes that eliminate the highest-friction findings without requiring new infrastructure.

**Parent portal** (reports: `docs/uat/reports/2026-04-16-parent.md`):
- JTBD-PARENT-INV-01 (blocker): No payment button on invoices — "contact admin" dead end. Root cause: `PUT /api/invoices/[id]` can set status to SENT without creating a Xendit link, creating a backdoor where parents see invoices with no pay button. Fix: auto-create Xendit link when transitioning to SENT via PUT, and improve the fallback message for genuine API failures.
- JTBD-PARENT-ATT-01 (blocker): Attendance page crash from missing `isVoided` column. **Already fixed in PR #42** (merged to staging before this branch). No code change needed; requires `npx prisma db push` on the DB.

**Teacher portal** (report: `docs/run-uat/reports/2026-04-16-teacher.md`):
- JTBD-TEACHER-ATT-01 (major): Class selector shows raw DB ID (`cs_kb_aster`) instead of class name. Pure UI fix.
- JTBD-TEACHER-SLIP-01 (major): Salary amounts are intentionally PDF-only — not in scope.

**Not in scope this cycle:**
- JTBD-TEACHER-PROFILE-01 (blocker): Profile photo upload — needs new API endpoint + file upload infrastructure. Separate cycle.
- JTBD-TEACHER-SLIP-01 (major): Salary slip in-app summary — intentionally PDF-only per product decision.
- JTBD-PARENT-ATT-01 (blocker): Attendance crash — already fixed by PR #42. Ops step only.
- Parent invoice cold-nav perf (TTFB 4.6s) — likely Prisma cold-start on local dev; needs profiling on Vercel.
- Minor: no "Terlambat" status in attendance cycle.

## Spec

- [ ] Teacher class attendance selector displays human-readable class name (e.g. "KB Aster") in its collapsed state, not the raw `classSection.id`
- [ ] `PUT /api/invoices/[id]` auto-creates Xendit payment link when status transitions to SENT and no link exists yet (reuses existing `createXenditSession()` from `lib/xendit/client.ts`)
- [ ] Parent invoice detail sheet shows a softer fallback message when no payment link exists (edge case: Xendit API failure): "Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat." — single message, no duplicate, no "hubungi admin" dead end
- [ ] No new API endpoints or DB schema changes
- [ ] All existing tests pass (`npm run build && npx vitest run`)
- [ ] Playwright e2e suite passes (`npx playwright test`)

### Non-goals
- Teacher profile photo upload (separate cycle)
- Teacher salary slip in-app summary (intentionally PDF-only)
- Adding Terlambat/Late status to attendance cycle
- Fixing parent attendance crash (already fixed in staging — ops step only)
- Parent invoice cold-nav perf optimization

### Assumptions
1. The Shadcn `SelectValue` component can be made to display custom text by finding the matching assignment object from state (the current code stores the raw ID in `selectedClass`)
2. The existing `createXenditSession()` function from `lib/xendit/client.ts` can be called server-side from the PUT invoice handler without additional setup
3. If Xendit session creation fails during PUT, the invoice status should still update to SENT but without a payment URL — the parent sees the softer fallback message

## Tasks

- [x] **1. Fix teacher class selector display** — In `app/teacher/class-attendance/page.tsx`, find the selected assignment from `assignments` array by matching `selectedClass`, and render the class name directly in the `SelectTrigger` instead of relying on `SelectValue` auto-display.
  - _Acceptance: collapsed selector shows "KB Aster — Kelompok Bermain", not "cs_kb_aster"_
  - Files: `app/teacher/class-attendance/page.tsx`

- [x] **2. Auto-create Xendit link on invoice send** — In `app/api/invoices/[id]/route.ts` PUT handler, when `body.status === "SENT"` and the invoice has no `xenditPaymentUrl`, call `createXenditSession()` and store the result. Reuse the same logic from `app/api/xendit/create-session/route.ts` (fetch invoice details, create session, update fields). If Xendit fails, still update status but log the error.
  - _Acceptance: PUT /api/invoices/[id] with status=SENT creates Xendit link automatically; parent sees pay button_
  - Files: `app/api/invoices/[id]/route.ts`, possibly `lib/xendit/helpers.ts` (extract shared session creation logic)

- [x] **3. Improve parent invoice fallback message** — In `app/parent/invoices/invoice-detail-sheet.tsx`, replace the "Hubungi admin untuk membuat link pembayaran" dead end with a softer message: "Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat." Remove the duplicate (it appears in both the status banner and the payment section).
  - _Acceptance: single, softer fallback message; no duplicate; no "hubungi admin"_
  - Files: `app/parent/invoices/invoice-detail-sheet.tsx`

- [x] **4. Update UAT jobs library** — Update `docs/uat/jobs/teacher.md` to reflect the class selector fix. Stage consumed UAT reports via `git add -f`.
  - _Acceptance: JTBD entries updated_
  - Files: `docs/uat/jobs/teacher.md`

## Implementation

- Task 1: Fix teacher class selector display — `app/teacher/class-attendance/page.tsx` — Find selected assignment by ID and render class name + program name as SelectValue children instead of relying on default value display
- Task 2: Auto-create Xendit link on invoice send — `lib/xendit/helpers.ts` (new), `app/api/invoices/[id]/route.ts`, `app/api/xendit/create-session/route.ts` — Extracted per-invoice session creation into shared helper; PUT /api/invoices/[id] auto-calls it when transitioning to SENT
- Task 3: Improve parent invoice fallback message — `app/parent/invoices/invoice-detail-sheet.tsx` — Replaced "Hubungi admin" dead end with softer "sedang disiapkan" message in both status banner and payment section
- Task 4: Update UAT jobs library — `docs/uat/jobs/teacher.md` — Updated JTBD-TEACHER-ATT-01 known friction note to reflect class selector fix
- Task 5 (CI fix): Fix seed script for PostgreSQL CI — `prisma/seed.ts` — Replaced hardcoded LibSQL adapter (`file:dev.db`) with PrismaPg adapter using `DATABASE_URL` env var, matching `lib/db.ts` pattern
- Task 6 (CI fix): Parent dashboard empty state — `app/parent/page.tsx` — Added "Semua tagihan lunas" message when no unpaid invoices exist; Playwright test expected this text but the page rendered nothing in the empty case

## Verification

- Task 1: gates passed (build + vitest: 9 files, 90 tests green)
- Task 2: gates passed (build + vitest: 9 files, 90 tests green)
- Task 3: gates passed (build + vitest: 9 files, 90 tests green)
- Task 4: no gate needed (doc-only update)
- End-of-cycle: build ✅, vitest 9/9 files 90/90 tests ✅, playwright 25/25 tests ✅ (17.1s)
- CI fix: build ✅, vitest 9/9 files 90/90 tests ✅ (seed script fix will be validated by CI on PR)

## Ship Notes

- **No migrations needed** — no schema changes in this cycle
- **No new env vars** — reuses existing `XENDIT_SECRET_KEY` and `NEXT_PUBLIC_APP_URL`
- **New file:** `lib/xendit/helpers.ts` — shared Xendit session creation helper
- **Seed fix:** `prisma/seed.ts` now uses PrismaPg adapter + DATABASE_URL instead of hardcoded LibSQL adapter — this is what was causing the CI e2e job to fail (`role "root" does not exist`)
- **Manual smoke on preview:** Verify the class selector on `/teacher/class-attendance` shows class name, and that PUT `/api/invoices/[id]` with `{ status: "SENT" }` auto-creates a Xendit link (check invoice row in DB for `xenditPaymentUrl`)
- **Rollback:** Revert the 4 commits. The `lib/xendit/helpers.ts` file can be deleted — the create-session route will fall back to its old inline logic if reverted independently (but reverting the whole branch is cleaner)
