# Fix: admin-raport E2E tolerant of an existing Term

## Context

`e2e/admin-raport.spec.ts` "raport surface loads" asserted the "Buat Triwulan"
create-term card, assuming the seed ships **no** Term. On a fresh-seeded CI database
that holds, but on a DB that has a Term (drifted staging — the 2026-06 parent-raport bug
repro manually created + published a Triwulan raport there), `app/admin/raport/page.tsx`
renders the Triwulan/Kelas selector instead and the assertion fails. Pre-existing
test-brittleness (seed-state coupling), not a product bug.

## Spec

- The smoke asserts the "Raport" h1 always, then accepts **either** surface: the
  "Buat Triwulan" create card (no Term) **or** the "Triwulan" term selector (Term exists).
- Passes on both a fresh seed (CI) and a Term-bearing DB (drifted staging).
- No product/page change. Test-only.

## Tasks

1. Make "raport surface loads" tolerant of either surface; update the file header comment.

## Implementation

`e2e/admin-raport.spec.ts`: replaced the hard `getByRole("heading", { name: "Buat
Triwulan" })` assertion with `createCard.or(termSelector).first()` where `termSelector =
getByLabel("Triwulan", { exact: true })` (exact so it doesn't also match the "Buat
Triwulan" heading). Header comment updated to describe the either-surface contract.

## Verification

- `npm run build` ✓ (worktree production build for the Playwright webServer).
- `E2E_ALLOW_REMOTE_DB=1 npx playwright test e2e/admin-raport.spec.ts` ✓ **2/2 passed**
  against drifted staging (Term exists → selector branch), Chromium, workers:1. Verbatim:
  ```
  ✓ 1 …admin-raport.spec.ts:27 › raport surface loads (1.7s)
  ✓ 2 …admin-raport.spec.ts:37 › raport APIs respond for an authorized admin (1.5s)
  2 passed (5.2s)
  ```
  The fresh-seed "Buat Triwulan" branch is covered by the same `.or` (and is what CI's
  fresh-seeded ephemeral Postgres exercises).
- Vitest unaffected (e2e-only change).

## Ship Notes

- **Migrations / env / deps:** none. Test-only.
- **Rollback:** revert the PR.
- **No preview-verify:** test-only cycle, no UI surface changed.
