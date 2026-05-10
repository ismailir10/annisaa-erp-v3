# Phase 0.2 — Finance Backlog Drain + Parent Attendance Scoping

> **Source-of-truth plan:** [`docs/plans/2026-05-10-v1-incremental-evolution.md`](../plans/2026-05-10-v1-incremental-evolution.md) §3 + §5 Phase 0 cycle 0.2.
> **Phase:** 0 — Stop Bleeding (UAT blockers).
> **Branch:** `feat/phase0-finance-backlog-drain` (off `origin/staging` @ `31dc344` — post-PR-#222).
> **Prior cycle:** [`2026-05-10-phase0-admin-hydration-and-bfcache.md`](2026-05-10-phase0-admin-hydration-and-bfcache.md) — pattern reference for Verification + Ship Notes shape.

---

## Context

Two UAT BLOCKERS from the §3 BLOCKERS table remain open on the rolled-back staging tip:

- **U2 — finance backlog (364 / 544 invoices stuck `PENDING_PAYMENT_LINK`).** UAT 2026-04-25-admin (re-confirmed 2026-05-02) reports a sandbox seed that completed the invoice row writes but failed the Xendit `/sessions` POST for ≈ 67% of rows. Existing infra to drain the backlog is already in place (cycle 2026-04-26 finance-robustness, cycle 2026-04-27 invoice-create-auto-retry, cycle 2026-04-28 finance-bulk-throttle): `scripts/backfill-pending-payment-links.ts` iterates the orchestrator until cleared, stalled, or capped, with `--dry-run` and full structured logs. The unknown is **why** the original Xendit batch failed — diagnose first, then drain. Likely candidates per CTO brief: (a) missing/invalid `XENDIT_SECRET_KEY` on staging Vercel env, (b) sandbox 60-req/min ceiling hit, (c) webhook callback URL drift, (d) Vercel 60s function timeout, (e) stale Xendit account state requiring ops support. The 364 figure has not been re-validated post-rollback to PR #177; the breakdown endpoint (`GET /api/invoices/pending-payment-link/breakdown`) is the authoritative count.

- **U10 — parent attendance scoping wrong query.** UAT 2026-05-03-parent flagged the parent attendance page as showing data for the wrong scope (the report was not committed to origin/staging — same gap as U6 last cycle). The exact symptom is unclear from the plan row; reproduction on the current Vercel preview drives diagnosis. The candidate query lives in `app/parent/attendance/page.tsx` (`prisma.studentAttendance.findMany` with `student: { tenantId }` defense join) + `lib/parent-helpers.ts:getParentWithChildren` (resolves `children` from `prisma.parent.findFirst → guardians.student`). Plausible fault modes: a homeroom teacher's attendance write does not land on the studentId the parent's `getParentWithChildren` resolves; or an enrollment status filter on the children list excludes a real ACTIVE child; or a `?child=` URL param with a non-owned studentId silently falls through to a different parent's child (the current `resolveSelectedChild` falls back to `children[0]` when not found, which is safe for a non-owned id but masks the symptom).

**Provenance caveat (carry-over from cycle 0.1).** The 2026-05-03 parent UAT report is missing from origin/staging, so U10's exact wording / evidence is unrecoverable. Task 1 reproduces against the live Vercel preview as the ground-truth source. If U10 does not reproduce, scope shrinks to U2 only and the U10-related tasks become a negative-reproduction record, mirroring how cycle 0.1 handled U1.

**Reuse caveat (key /spec finding).** `scripts/backfill-pending-payment-links.ts` already exists with full vitest coverage (`scripts/__tests__/backfill-pending-payment-links.test.ts`) and uses the existing `retryPaymentLinks` orchestrator + `getPendingPaymentLinkBreakdown` summary. Cycle scope is therefore **NOT** "create a new drain script" but rather "diagnose why the existing infra has not already drained the backlog, fix the gap if any, then run the drain as a Ship Note ops step against staging." The plan §5 string "scripts/drain-pending-payment-links.ts (NEW one-off; tsx)" is corrected here — the script exists under a different name and supersedes this cycle's would-be additions.

**Scope explicitly excludes** (per user-confirmed §7 of plan):
- U3 / U7 / U8 / U9 (perf sweep) — separate cycle `phase0-perf-sweep` (next, plan §5 cycle 0.3).
- U4 / U5 (feature gaps, salary slip mobile + profile photo upload) — Phase 4.
- Any prisma migration. Any change to the Xendit checkout SDK contract. Any other admin page.

**Hooks reminder.** This cycle's commits will touch `lib/parent-helpers.ts` or `app/parent/attendance/page.tsx`. The frontend gate (pre-commit Rule 4) does NOT fire on `lib/**` but DOES fire on `app/**/*.tsx`; if the U10 fix lands in the page file, this cycle doc must contain the literal token `design-system` somewhere in the staged diff (see Verification §"Frontend gate" — adding a one-line "design-system: no visual changes; query-only diff" bullet satisfies the gate). Commit subject `^(fix):` does NOT trip the narrow doc-sync rule, so README staging is required only for the wrap commit (which adds the ADR row anyway).

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** `GET /api/invoices/pending-payment-link/breakdown` against the staging Vercel preview returns the current pending count + per-prefix breakdown. Recorded in Verification §"Task 1 — Reproduction" with the exact JSON, route URL, and timestamp. The number replaces the stale "364" figure from the plan row. Closes the diagnostic half of UAT U2.
- [ ] **AC2.** Root cause of the original Xendit failure is named in Verification — one of (a) env var gap, (b) sandbox rate-limit ceiling, (c) webhook URL drift, (d) Vercel function timeout, (e) Xendit account state, OR (f) a category not in the brief's list. Evidence: at minimum the breakdown's `byPrefix` distribution + a representative `paymentLinkError` string copied from one stuck row + (if env-related) `npx tsx scripts/audit-vercel-env.ts` output.
- [ ] **AC3.** Drain action documented in Ship Notes — either:
  - **Live drain plan:** post-merge ops step `npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts --tenant <id> --confirm` (preceded by a `--dry-run` for breakdown read), OR
  - **Drain blocked:** ops dependency named (e.g. "rotate `XENDIT_SECRET_KEY` on Vercel staging env first; drain post-rotation"). The cycle still merges with the diagnosis + fixes; the drain itself is gated on the ops dependency.
- [ ] **AC4.** U10 reproduction status recorded in Verification §"Task 4 — Reproduction" with the exact preview URL + persona + DOM evidence. Either:
  - **Reproduces:** root cause named + smallest viable fix landed in `lib/parent-helpers.ts` or `app/parent/attendance/page.tsx`. Existing 5 e2e specs unaffected.
  - **Does NOT reproduce:** negative finding recorded; `e2e/parent-attendance-scoping.spec.ts` still ships as a long-lived regression guard against the most plausible scoping fault mode (e.g. cross-parent `?child=` leak).
- [ ] **AC5.** New e2e spec `e2e/parent-attendance-scoping.spec.ts` passes against `DEMO_MODE=true npm run start` and is constructed to fail loud if a parent ever observes attendance for a student outside their `getParentWithChildren` set.
- [ ] **AC6.** No regression on the existing 11 e2e specs (full suite green via end-of-cycle gate; CI is the canonical authority per cycle 0.1 marathon-flake learning).
- [ ] **AC7.** README.md gains a single ADR row dated 2026-05-10 (cell ≤ 400 chars per pre-commit hook) summarising the drain decision + U10 fix surface in one line.

### Spec Assumptions

1. **Existing drain infra is the canonical surface.** `scripts/backfill-pending-payment-links.ts` + `lib/finance/xendit-retry.ts` + `/api/invoices/pending-payment-link/breakdown` already solve U2's drain need. This cycle does not introduce a parallel script. If Task 1's diagnosis surfaces a defect inside `withXenditRetry` or `retryPaymentLinks`, the fix lands inside the existing module — never as a one-off script bypass.
2. **The orchestrator is hit via the script (server-side, no HTTP), not via the admin endpoint.** CTO brief Q4 recommended hitting `/api/admin/finance/invoices/[id]/retry-payment-link` per row, but that endpoint does not exist — the admin UI funnels per-row + bulk through the same `POST /api/invoices/retry-payment-links` (verified by grep in `app/admin/invoices/page.tsx:578` + `[id]/page.tsx:143`). The script's `retryPaymentLinks(tenantId, null)` direct call exercises the same code path the bulk endpoint hits, so test coverage stays honest without an extra HTTP layer.
3. **No drain runs against the live Supabase staging DB during `/build`.** Per CTO brief Q5, `/build` exercises the script against vitest mocks (test file already exists). The live drain is a post-merge Ship Note ops step.
4. **Diagnose-first ordering matters.** Running the drain blind risks burning Xendit sandbox quota on rows whose underlying failure is ops-side (env or account state). Task 1 (breakdown read) MUST land before Task 2 (any retry-layer change) and before the ops drain step.
5. **U10 fix surface is the existing parent-helpers / page query.** No new abstraction layer. If `getParentWithChildren` cache key or filter is wrong, fix the helper. If the page query has a stale `student.tenantId` join shape, fix the page. No new RLS policy, no new Prisma model.
6. **Permission to retry against staging post-merge belongs to the operator, not `/build`.** The cycle merges in a "ready to drain" state; the human (CTO) runs `--dry-run` first, reads the breakdown, then `--confirm` (or rotates the env key first if Task 1 named that).
7. **Pre-existing CSP duplication note from cycle 0.1 (Ship Notes) is still out of scope.** Same defer-to-future-hardening posture.

### Non-goals

- No change to the Xendit Checkout Session API call shape (already covered by ADR 2026-04-26).
- No change to the bulk-retry endpoint contract (`POST /api/invoices/retry-payment-links` body / response).
- No new admin UI surface — the existing "Coba Lagi Link (N)" header button is unchanged.
- No prisma schema change. No new column. No additive migration.
- No reseed of the staging DB. The drain operates on the existing rows.
- No webhook re-delivery probe. If Task 1 names webhook URL drift as the root cause, the fix is env-side (Vercel `XENDIT_WEBHOOK_URL` or its equivalent), not a code change.
- No Safari / Firefox parent-portal test (Chromium-only per CLAUDE.md).

---

## Tasks

Each task = 1 commit. `npm run build && npx vitest run` must pass between tasks (between-task gate). The end-of-cycle gate adds Playwright on the LAST commit.

### Task 1 — Diagnose: U2 backlog breakdown + U10 reproduction (no code)

**Goal:** ground-truth two unknowns before touching code.

**Steps:**
1. Open the Vercel preview URL spawned by this branch. Sign in as admin (real Google OAuth `ismailir10@gmail.com`).
2. **U2 breakdown:** `curl -H "Cookie: <admin-session>" '<preview>/api/invoices/pending-payment-link/breakdown'` and record the JSON: `total`, `byPrefix` distribution, sample `paymentLinkError` strings. Also record the breakdown of `byPrefix` ratios — which Xendit error class dominates? (`xendit_401` → key issue; `xendit_429` → rate limit; `xendit_5xx` → incident; `xendit_422` → request shape; `network` → DNS/TLS; `unknown` → no classification). For the env-side check, run `vercel env ls preview --environment=preview | grep -E '(XENDIT|NEXT_PUBLIC_APP_URL)'` against the staging-linked Vercel project and record presence/absence of `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `NEXT_PUBLIC_APP_URL`. **Do NOT use `scripts/audit-vercel-env.ts`** — it hard-codes `vercel env ls production` and would give a misleading clean read for a staging-only env gap (the script's own header documents this; cycle 2026-04-28 T6 wrote it for prod-promotion gates, not for staging env audits).
3. **U10 reproduction:** sign in as parent (demo cookie `school-erp-session=u_parent_seed1` or real Google OAuth on the seeded parent account `rightjet.hq@gmail.com`). Visit `/parent/attendance`. Capture: rendered child name, week range, statusByDate values, and `document.querySelectorAll('table tr').length`. Compare against what `prisma.studentAttendance.findMany` should return for that child + tenant + week — does the rendered table match the DB? If not, where does the divergence start (children resolution, child selection, attendance query)?
4. Append the findings to this cycle doc's `## Verification` section as `### Task 1 — Reproduction`. Include the preview URL + ISO timestamp.

**Files:** none (investigative). Cycle doc Verification block gets the report appended in the Task 6 wrap commit.

**Exit:**
- U2: root cause named with evidence. Either (a) a code/config gap that a follow-up task can land, OR (b) an ops dependency that gates the drain.
- U10: reproduces with named fault → continue to Task 4 with confidence; OR does not reproduce → Task 4 becomes a negative-reproduction record + the long-lived regression guard still ships.

### Task 2 — (Conditional) Retry-layer or breakdown tweak

**Skipped if** Task 1 surfaces an ops-only gap (env, account state) — those are Ship Note items, not code changes.

**Files (TBD):** the smallest viable surface in `lib/xendit/with-retry.ts`, `lib/finance/xendit-retry.ts`, `lib/finance/pending-breakdown.ts`, or `scripts/backfill-pending-payment-links.ts` — only if the diagnosis surfaces a missed retriable category, an off-by-one cap, or a misclassified prefix that would silently masquerade as "hard fail" and prematurely stall the drain.

**Verification:** existing vitest cases for the touched module remain green; new case added if the fix changes a branch covered by a test.

**Commit message:** `fix(finance): <named gap> in retry layer`.

### Task 3 — (Folded into Task 6) Drain post-merge ops step

**Not a separate commit.** The ops drain step + any ops dependency is written into Ship Notes as part of Task 6's wrap commit — keeping it as a standalone task would either fire an unnecessary between-task gate on a docs-only diff or violate the "each task = 1 commit" rule. Listed here only for traceability against the CTO brief's scope bullets. The ops step itself runs post-merge (CTO runs `npx tsx scripts/backfill-pending-payment-links.ts --tenant <id> --dry-run` then `--confirm` once the breakdown looks healthy and any ops dependency named in Task 1 has cleared).

### Task 4 — U10 fix (conditional on Task 1 finding)

**If Task 1 reproduces U10:**

**Files (most likely):**
- `lib/parent-helpers.ts` — likely fault zone for `getParentWithChildren` cache key, tenant filter, or guardian/enrollment join. If the bug is in the children resolution layer, a single-file change fixes the symptom across `/parent`, `/parent/attendance`, `/parent/invoices`, `/parent/reports` simultaneously.
- OR `app/parent/attendance/page.tsx` — only if the bug is page-local (e.g. the `student: session.tenantId ? { tenantId: session.tenantId } : undefined` defense join misbehaves when `session.tenantId` is falsy, or the `studentJournalNote` query mis-scopes by date string range).

**Vitest coverage:** add a case to `lib/__tests__/parent-helpers.test.ts` (or create the file if absent) for the named fault — at minimum:
- "given a parent with two ACTIVE children in tenant A, `getParentWithChildren` returns exactly two children both scoped to A"
- "given a parent with no `parentId` (email-fallback path), the same invariant holds"
- **cache-key isolation:** "calling `getParentWithChildren` with `parentId=null, email=X, tenantId=T` versus `parentId=<uuid>, email=X, tenantId=T` MUST never return the other parent's children — the `unstable_cache` key array `["parent-children"]` is static, so Next.js distinguishes entries solely by serialised function args; a `null` parentId vs. a real UUID with the same email + tenantId must therefore not collide. This is the most plausible live U10 fault mode and lacks coverage today."

**If Task 1 does NOT reproduce U10:** empty-stub commit recording the negative finding in Verification, mirroring cycle 0.1 Task 3. The e2e regression guard from Task 5 still ships.

**Commit message (reproducing case):** `fix(parent): <root cause> in attendance scoping (closes U10)`.
**Commit message (healed case):** `chore(uat): record U10 negative reproduction post-rollback`.

### Task 5 — e2e: parent attendance scoping regression guard

**File:** `e2e/parent-attendance-scoping.spec.ts` (NEW).

**Why a new spec rather than extending `e2e/parent.spec.ts`:** keeps the failure message scoped to "scoping" so a regression points at the data-access layer, not at parent-UI styling.

**Assertions:**
- Sign in as a guardian with at least one ACTIVE child (existing `e2e/parent.spec.ts` cookie shape).
- Navigate to `/parent/attendance`. Read the rendered child name + studentId from the `ChildSelectorTabs` data attribute or the page DOM. Assert the studentId is one of the parent's known student ids (cross-checked against the demo seed's `parent.guardians.student.id` set).
- Navigate to `/parent/attendance?child=<known-other-tenant-student-id>` (or a fabricated valid-looking studentId not owned by this parent). Assert the page does NOT render attendance for that id; either redirects to `/parent` (current behavior — `resolveSelectedChild` falls back to `children[0]`) or surfaces a clear empty state. The test name calls this out: `does NOT render attendance for a studentId outside the parent's children set`.
- Read the rendered week-grid statusByDate map; assert at least one cell renders the demo seed's known PRESENT row, AND no cell renders a status whose underlying StudentAttendance row's `studentId` differs from the resolved child.
- **Pin the test week explicitly.** Before writing the spec, read `prisma/seed.ts` to find the studentAttendance Monday date(s) seeded for the demo guardian's child. Use `?week=<seed-monday-date>` when navigating so the assertion runs against a known-populated week. Without this pin, a "current week" navigation could silently pass vacuously when the seed's attendance falls in a historical week (0 rows seen, 0 violations triggered, false green).

**Verification:** `npx playwright test e2e/parent-attendance-scoping.spec.ts` green against `DEMO_MODE=true npm run start`.

**Commit message:** `test(e2e): parent attendance scoping regression guard`.

### Task 6 — Wrap up: README ADR + cycle doc Verification + Ship Notes

**Files:**
- `README.md` — new ADR row dated 2026-05-10 (cell ≤ 400 chars). Single line summarising "U2 drain via existing `backfill-pending-payment-links.ts`; U10 fix in `<file>`; ops drain step in Ship Notes."
- `docs/cycles/2026-05-10-phase0-finance-backlog-drain.md` — fill Implementation, Verification (incl. Task 1 evidence + per-task gate output), Ship Notes (ops drain step + any ops dependency).

**End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test` — all green. Marathon-flake caveat (cycle 0.1) applies: if local Playwright stalls server CPU after ~25 min, re-run a moderate subset on a fresh server, then defer to CI as canonical authority.

**Code-review gate:** `feature-dev:code-reviewer` agent run TWICE per CTO brief — once on the cycle doc itself before `/build` runs (catches spec defects) and once on the cumulative diff before this wrap commit lands (catches implementation defects).

**Commit message:** `docs(phase0): wrap cycle phase0-finance-backlog-drain`.

---

## Implementation

<!-- filled by /build per task -->

## Verification

<!-- filled by /build: gate output, test names, manual smoke notes -->

## Ship Notes

<!-- filled by /ship: migrations, env vars, ops drain step, rollback plan -->
