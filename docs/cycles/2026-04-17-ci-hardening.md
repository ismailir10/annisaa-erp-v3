# CI Hardening — Prevent Seed Drift, Empty State Bugs, and Worktree Skips

## Context
After shipping cycle `2026-04-16-uat-quick-wins.md`, two preventable CI failures occurred:

1. **Seed drift** — `prisma/seed.ts` had a hardcoded `PrismaLibSql` adapter (`file:dev.db`) while `lib/db.ts` uses `PrismaPg` + `DATABASE_URL`. The seed diverged from the app's DB connection, causing CI failures.
2. **Empty state omission** — `app/parent/page.tsx` rendered nothing when no invoices existed, but the Playwright test expected "Semua tagihan lunas". The seed creates no invoices, so the test was guaranteed to fail.
3. **Worktree skip** — CTO sessions could work directly in the main checkout, risking state conflicts with parallel sessions. The worktree rule was only enforced for `product-builder`.

## Spec
- [x] Pre-commit hook blocks `prisma/seed.ts` commits unless `lib/db.ts` is also staged
- [x] CLAUDE.md has an explicit empty state contract: every conditional list render must have an else branch
- [x] Worktree isolation applies to ALL roles (cto + product-builder), enforced by `check-role.sh`

## Tasks
1. Add Rule 3 (seed drift) to `.githooks/pre-commit`
2. Add empty state contract subsection to `CLAUDE.md` under Portal Consistency Standard
3. Update worktree policy in `CLAUDE.md` to include all roles
4. Update `scripts/check-role.sh` to enforce worktree for all roles

## Implementation

### Task 1: Seed drift hook
- `.githooks/pre-commit` — added Rule 3: if `prisma/seed.ts` is staged but `lib/db.ts` is not, the commit is rejected with a clear error message
- Also updated the header comment from "Two rules" to "Three rules"
- Updated the pre-commit description in CLAUDE.md section 2

### Task 2: Empty state contract
- `CLAUDE.md` — added "Empty State Contract" subsection under Portal Navigation Standard
- Rule: every conditional list render MUST have an explicit else branch with visible content
- Includes correct/wrong code examples
- Applies to all portals and all page types

### Task 3: Worktree policy for all roles
- `CLAUDE.md` — changed section heading from "every product-builder session" to "every session"
- Changed rule: "Every session — regardless of role — MUST work in a worktree"
- Updated auto-creation text to be role-agnostic
- Updated `scripts/check-role.sh` — removed the `if [ "$ROLE" = "product-builder" ]` guard, now checks unconditionally
- Error message now includes the role for clarity

## Verification
- Pre-commit hook logic tested by reading the code (grep for seed/db patterns)
- check-role.sh logic: unconditional worktree check (no role guard)
- CLAUDE.md sections verified by reading the file

## Ship Notes
- No migrations, no env vars, no API changes
- This is purely a dev-experience / CI-hardening change
- Rollback: revert the three files (`.githooks/pre-commit`, `CLAUDE.md`, `scripts/check-role.sh`)
