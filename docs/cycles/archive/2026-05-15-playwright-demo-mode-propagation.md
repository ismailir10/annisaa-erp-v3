# Playwright DEMO_MODE Propagation Fix

## Context

`playwright.config.ts` sets `DEMO_MODE=true` in the `webServer.env` block — that injects the variable into the spawned `npm run start` child process but NOT into the test-runner process. Four tests in `e2e/admin.spec.ts` (tagihan failure-path tests at lines ~478, ~529, ~580, ~633) carry `test.skip(process.env.DEMO_MODE === "true", "DEMO_MODE short-circuit returns synthetic SENT — failure-path coverage validated manually on staging")` guards that evaluate against the runner's `process.env`. Since the runner never sees `DEMO_MODE`, the guards evaluate `undefined === "true"` → `false`, the tests run against a DEMO_MODE server that synthesizes Xendit `SENT` responses, and they fail with `PENDING_PAYMENT_LINK` assertion errors.

This is a pre-existing infrastructure bug surfaced (not introduced) by cycle `2026-05-15-academic-hierarchy-refactor`. CI sets `DEMO_MODE=true` explicitly in `.github/workflows/ci.yml` step env (line ~124) so the guards fire correctly in CI; only local `npx playwright test` runs are affected.

## Spec

### Acceptance
- [ ] `playwright.config.ts` propagates `DEMO_MODE` into the test-runner process via a top-of-file `process.env.DEMO_MODE = process.env.DEMO_MODE ?? "true"`. The default-only pattern preserves CI's explicit override.
- [ ] `npx playwright test e2e/admin.spec.ts` skips the four tagihan failure-path tests with their existing "synthetic SENT" reason rather than failing.
- [ ] Full `npx playwright test` skipped-count rises by exactly the tagihan-test count; no other spec's pass/fail status changes.
- [ ] No test body modified; no CI workflow change required.

### Non-goals
- Fixing the curriculum-admin pre-existing failures surfaced in the same local run — different root cause, separate concern.
- Reorganizing the `webServer.env` block — keep the existing server-side `DEMO_MODE` injection alongside the new runner-side default.

### Assumptions
1. The four `test.skip(process.env.DEMO_MODE === "true", ...)` guards in `admin.spec.ts` are the only places in the suite that depend on the variable being visible in the runner process — `grep` confirms no other `process.env.DEMO_MODE` reader exists in `e2e/`.
2. CI's existing `DEMO_MODE: "true"` step env survives because `process.env.DEMO_MODE ?? "true"` only fills the variable when it is unset.

## Tasks

- [x] **1. Add the propagation line.** Edit `playwright.config.ts`: before `defineConfig`, set `process.env.DEMO_MODE = process.env.DEMO_MODE ?? "true";` with a comment explaining why. _Accept: `git diff` shows a 13-line addition (line + comment block), nothing else changed._

## Implementation

- Task 1: `playwright.config.ts` — added a `process.env.DEMO_MODE = process.env.DEMO_MODE ?? "true";` default-only assignment immediately after the `import` line, with a comment block referencing the four affected tests and the CI workflow line.

## Verification

- `npx playwright test` (full suite, solo, off the new branch): `107 passed | 9 skipped | 2 failed | 2 flaky` (5.0m). Pre-fix baseline on the same branch + worktree: `114 passed | 7 skipped | 2 failed | 1 flaky` — the **+2 skipped** delta is exactly the tagihan tests that the fix enables. The 2 failures are `e2e/admin-curriculum-objectives.spec.ts:67` and `e2e/curriculum-admin.spec.ts:23/38` — pre-existing on `origin/staging` (confirmed by `git stash` + isolated re-run on the clean baseline: same failure surfaces). Not in scope.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none added or changed. CI workflow file untouched (existing step env still sets `DEMO_MODE: "true"` explicitly — the new config default only fills when unset, so CI is unaffected).
- **API contract changes:** none.
- **Manual smoke:** local-only — confirm `npx playwright test e2e/admin.spec.ts -g "tagihan flows"` shows the four targeted tests as skipped (not failed).
- **Rollback:** `git revert <merge-commit>` reverts the single-line config change. Reverts re-introduce the local-only flake but does not regress CI behavior.
