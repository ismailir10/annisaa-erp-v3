# Slim ship gate — cut bullshit tests

## Context

The ship gate (`npm run build && npx vitest run && npx playwright test` per `.claude/skills/ship/SKILL.md` Step 1b + CI workflow `.github/workflows/ci.yml`) carries dead weight that erodes signal: tests that never run in CI, tests that pass vacuously regardless of regression, screenshot writes that nobody compares, and tautological unit tests that re-assert string literals. CTO audit on 2026-05-20 inventoried 24 e2e specs (CLAUDE.md still claims 18 — drift) and 176 vitest files (~31k LOC); the suite is mostly disciplined but the worst-offender concentrations are clear. Goal: cut the dead weight, fix the vacuous-green patterns, and add a /ship preflight delta-check so the next reviewer notices when new soft-skip lands. Scope deliberately excludes anything touched by the in-flight `feat/kesiswaan-storage-supabase` session — that branch's tests will be re-audited once it merges.

## Spec

### Acceptance criteria

- [ ] **e2e/admin.spec.ts**: delete 4 tests that skip in DEMO_MODE (lines 538, 589, 640, 693) — CI always runs DEMO_MODE=true, so these never execute. Comments admit "validated manually on staging" — that surface belongs to `/uat`, not the gate. Net −~200 LOC.
- [ ] **e2e/admin-dialogs.spec.ts**: strip `page.screenshot()` calls (lines 107-111, 148-151) that write PNGs to `e2e/__snapshots__/admin-dialogs/` but are never compared with `toMatchSnapshot`. Delete the orphan PNG directory. Keep all dialog assertions.
- [ ] **e2e/sibling-detect.spec.ts**: remove the 61-second `setTimeout` retries on rate-limit (lines 38-46, 86-99). Replace with direct rate-limit-bucket reset or per-test cookie/IP isolation. Worst-case 2-minute stall in marathon orchestration disappears.
- [ ] **e2e/parent-perkembangan.spec.ts**: remove test-order coupling (`firstChildId` captured in test 2, used in test 3 — line 87). Each test resolves studentId via API. Playwright independence restored.
- [ ] **e2e/daftar-public.spec.ts**: merge test 4 (Retry-After header) into test 3. Eliminate the silent vacuous-green branch (`if (status === 429) { assert } else { annotate }`).
- [ ] **lib/__tests__/auth-helpers.test.ts**: DELETE. 8 tests assert `role === "SUPER_ADMIN"` against string literals; permissions.test.ts has the real RBAC coverage. Net −22 LOC.
- [ ] **lib/__tests__/parent-helpers.test.ts**: trim `getStudentInvoices` block from 11 tests to 3 (happy-path full Prisma shape, PENDING_PAYMENT_LINK exclusion, cross-tenant isolation). The other 8 re-assert the same `where`/`select`/`orderBy` shape. Net −~250 LOC. Other 3 describe blocks (`getParentInvoiceList`, `mondayOfWeek`, `getParentWithChildren`, `countAttendanceThisWeek`) untouched.
- [ ] **app/api/__tests__/payroll-generate-rekening-guard.test.ts** (lines 117-124): rewrite the `try/catch` so the test asserts a definite outcome instead of passing on either branch. Don't delete the file — the other two tests are real guards.
- [ ] **CLAUDE.md**: update e2e spec count from "18" to "24" (line 285) — `/audit-docs` will block `/ship` otherwise.
- [ ] **.claude/skills/ship/SKILL.md**: add Step 1c — soft-skip + DEMO_MODE-skip delta check. Grep `e2e/` and vitest dirs for `test.skip(true,`, `.skip(`, and `process.env.DEMO_MODE === "true"` skip patterns; compare count vs origin/staging baseline; block `/ship` only if delta > 0 (new skip introduced). Existing legitimate skips don't break — only new vacuous-green needs justification.
- [ ] End-of-cycle gate: `npm run build && npx vitest run && npx playwright test` all pass on the trimmed suite. Playwright suite total runtime ≤ baseline (sanity check that sibling-detect retry fix actually shaved time).

### Non-goals

- Tier 3 soft-skip epidemic (19 `test.skip(true, ...)` calls) — addressed only by the new preflight delta check, not converted en masse this cycle. Future cycles can convert opportunistically when each surface is touched.
- Any vitest file beyond the three named above. Subagent audit confirmed the rest are clean.
- Any test files introduced or modified by `feat/kesiswaan-storage-supabase` — that work merges later and gets its own review pass.
- Refactoring the demo-mode Xendit short-circuit (`lib/xendit/client.ts:167`) that forced the 4 admin.spec tests to skip — orthogonal, scoped out.
- Improving Playwright parallelism or sharding — out of scope.

### Assumptions

1. The 4 DEMO_MODE-gated admin.spec.ts tests have no protective value in CI today (verified: `process.env.DEMO_MODE === "true"` in playwright.config.ts:13 + ci.yml:124 → skip fires 100% in CI).
2. `lib/__tests__/auth-helpers.test.ts` is fully redundant with `lib/__tests__/permissions.test.ts` for RBAC coverage. Spot-check confirmed the file tests only `isSuperAdmin` + `isAdminRole` string equality.
3. The `parent-helpers.test.ts` `getStudentInvoices` block's first test (line 40, "should fetch unpaid invoices") fully exercises the Prisma `where`/`select`/`take`/`orderBy` shape. The other 8 tests re-permute the same shape with different assertions — confirmed by reading the file end-to-end via subagent.
4. The `e2e/__snapshots__/admin-dialogs/` PNG directory has no consumer (no `toMatchSnapshot` reference anywhere in `e2e/`). Verified by `grep -rn "toMatchSnapshot" e2e/` returning empty.
5. Removing the sibling-detect rate-limit retry is safe because the rate-limit bucket is per-anonymous-IP and the fixture insertion can switch to a SUPER_ADMIN authenticated path (admin admission-create endpoint, no per-IP cap).
6. The preflight grep delta check can baseline against `origin/staging` cheaply via `git show origin/staging:e2e/...` enumeration; no shell complexity beyond a few `grep -c` calls.

→ Correct any of these now or `/build` will proceed with them locked in.

## Tasks

1. [x] **e2e/admin.spec.ts**: delete the 4 DEMO_MODE-gated tagihan tests (lines 538-781).
   - Acceptance: file shrinks by ~200 LOC; no `process.env.DEMO_MODE === "true"` skip remains in admin.spec.ts; suite still passes.
   - Independent.

2. [ ] **e2e/admin-dialogs.spec.ts**: strip `page.screenshot()` calls; delete `e2e/__snapshots__/admin-dialogs/` directory.
   - Acceptance: no `page.screenshot(` in admin-dialogs.spec.ts; `e2e/__snapshots__/admin-dialogs/` no longer exists; dialog assertions unchanged; suite still passes.
   - Independent.

3. [ ] **lib/__tests__/auth-helpers.test.ts**: DELETE.
   - Acceptance: file removed; `npx vitest run` shows 8 fewer tests but no failures; CI lint+typecheck clean.
   - Independent.

4. [ ] **lib/__tests__/parent-helpers.test.ts**: trim `getStudentInvoices` describe block from 11 tests to 3.
   - Acceptance: remaining tests = happy-path full-shape (line 40), PENDING_PAYMENT_LINK exclusion (line 113), cross-tenant isolation (line 344); other describe blocks in same file untouched; `npx vitest run` passes.
   - Independent.

5. [ ] **app/api/__tests__/payroll-generate-rekening-guard.test.ts**: rewrite try/catch test for definite assertion.
   - Acceptance: the rewritten test fails if the underlying guard regresses; pre-existing 2 other tests untouched.
   - Independent.

6. [ ] **e2e/sibling-detect.spec.ts**: replace public-endpoint rate-limit retry with admin authenticated insert.
   - Acceptance: no `setTimeout(r, 61_000)` calls remain; suite still passes; describe-level timeout can drop from 180s to 60s without breaking.
   - Independent — but verify via Playwright run end-to-end.

7. [ ] **e2e/parent-perkembangan.spec.ts**: drop `firstChildId` shared mutable; each test resolves studentId via `/api/parent/children` independently.
   - Acceptance: no module-scoped mutable state between tests; tests can run in any order; suite passes.
   - Independent.

8. [ ] **e2e/daftar-public.spec.ts**: merge test 4 into test 3; remove silent-skip-on-bucket-reset path.
   - Acceptance: test 3 asserts at-least-one-429 AND Retry-After header on that 429 response; no conditional-skip annotation remains.
   - Independent.

9. [ ] **CLAUDE.md**: bump e2e spec count from 18 to 24 (or replace count with `find e2e -name "*.spec.ts" | wc -l` reference).
   - Acceptance: `/audit-docs` returns zero `fail` on the e2e count claim.
   - Sequential after Tasks 1, 2, 6, 7, 8 (so the count is final).

10. [ ] **.claude/skills/ship/SKILL.md**: add Step 1c — soft-skip + DEMO_MODE-skip delta check vs `origin/staging` baseline.
    - Acceptance: skill prints baseline + current counts; blocks only if delta > 0; existing legitimate skips don't break /ship.
    - Independent.

11. [ ] **End-of-cycle gate + cycle-doc Verification fill**: `npm run build && npx vitest run && npx playwright test`. Record output in `## Verification`, including before/after test counts + Playwright total runtime.
    - Acceptance: all three green; `## Verification` populated with verbatim totals.
    - Sequential after Tasks 1-10.

## Implementation

- Execution plan: 11 tasks executed sequentially in this session (controller-driven implementation); per-task `feature-dev:code-reviewer` agent pass required before each commit per CLAUDE.md /build rule 8. Subagent-driven 3-stage pattern judged overkill for the cut sizes (most tasks ≤ 50 LOC delta). No tasks touch `app/api/**` / `lib/auth*` / `middleware.ts` so no `superpowers:code-reviewer` security pass required.
- Task 1: deleted 4 DEMO_MODE-gated tagihan tests in `e2e/admin.spec.ts` (225 lines via `sed`) + removed orphaned `firstActiveYearId` helper at the file foot (11 lines via `sed`, flagged by reviewer — surviving tests resolve year via `waitForResponse`, not the helper). Remaining 12 admin-flows tests + 2 tagihan tests (bulk-generate + retry-payload-validation) untouched. File: 834 → 598 LOC.

## Verification

- Task 1: between-task gate green twice (pre-review + post-reviewer-fix). Final: `npm run build` ok (Next.js 16 production build, 149 routes). `npx vitest run` → 189 passed | 2 skipped | 1872 tests | 42 todo | 66.64s. No spec-import errors despite 236-line e2e delete. Reviewer agent (feature-dev:code-reviewer) flagged dead `firstActiveYearId` helper — fixed in-task before commit. Playwright deferred to end-of-cycle per three-tier gate.

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>
