# Teacher salary-slip Playwright strict-mode fix

## Context

`e2e/teacher.spec.ts:46 salary slips page loads` was failing with a Playwright strict-mode locator violation: `text=Tersedia` resolves to 21 elements (one badge per seeded slip), but `.toBeVisible()` requires a single match unless `.first()` is used. Pre-existing — file was identical to `origin/staging` and the failure surfaced when seed data grew. Discovered while running `/ship` end-of-cycle gate on `feat/parent-balance-reconcile`; that branch was blocked because gates would not pass on a broken commit. One-line fix in its own cycle to keep the parent-balance-reconcile cycle history clean.

## Spec

- [ ] `e2e/teacher.spec.ts:46` passes against current seed shape (any number of slips visible).
- [ ] No other Playwright spec regresses.

**Non-goals**: rewriting the slips page, changing the test's intent (still asserts either Tersedia or empty-state), touching unrelated specs.

## Tasks

- [x] **Task 1 — Add `.first()` to the strict-mode locator on line 53.** Acceptance: `npx playwright test e2e/teacher.spec.ts:46` passes.

## Implementation

- Task 1: `e2e/teacher.spec.ts:51-58` — wrapped the `.or()` chain in `.first()` so the strict-mode assertion targets one element regardless of how many slips the seed renders. Inline comment explains why.

## Verification

- `npm run build` ✓
- `DEMO_MODE=true npx playwright test e2e/teacher.spec.ts:46` ✓ (1.2s)
- `DEMO_MODE=true npx playwright test` full suite — 77 tests / 70 passed / 7 skipped / 0 failed.

## Ship Notes

- **Migrations**: none.
- **Env vars**: none.
- **Rollback**: revert the single commit on this branch — `e2e/teacher.spec.ts` returns to the strict-mode-violating form.
- **Manual smoke**: none required (test-only).
