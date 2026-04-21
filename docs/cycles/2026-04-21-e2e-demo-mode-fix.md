# E2E Demo-Mode Fix — Seed Reset Completeness

## Context

The cycle was opened on the premise that 10 Playwright e2e tests were failing on `origin/staging` and blocking CI. Investigation found the premise false: the latest staging CI run (`24712230904`, HEAD `01044a1`) passed 27/27 e2e tests, and recent PR runs are also green. CI spins up a fresh Postgres service, runs `prisma db push --force-reset` + `prisma db seed`, builds, and runs Playwright — and stays green today.

The failures the user saw were local-only, driven by two separate issues on the shared Supabase staging DB:

1. **Staging DB drift** (out of scope of this cycle): two orphan GUARDIAN users created by the Supabase auth auto-provisioning path (`lib/auth.ts:108`) with `parentId: null` and zero Parent rows, plus `u_school_admin` promoted to `SUPER_ADMIN` (seed sets `SCHOOL_ADMIN`). Needs manual DB cleanup.
2. **Seed `deleteMany` gap** (fixed here): `prisma/seed.ts` wipes the DB at the top of `main()`, but its list of `deleteMany` calls was missing every model added since the payments and assessments modules shipped. Attempting `npx prisma db seed` against any DB that had Invoices/Payments/Assessments/etc. failed with `P2003 ForeignKeyConstraintViolation` (Student → Invoice → Payment chain), leaving the DB in a half-torn-down state. CI never hit this because CI always starts from an empty DB.

This cycle only fixes issue 2 — the local developer/reseed story. The staging DB drift and the broader question of whether local dev should point at shared Supabase vs a local Postgres are deferred.

## Spec

`npx prisma db seed` must succeed idempotently against any DB state that matches the current Prisma schema, regardless of which downstream tables contain rows. No CI behavior changes (CI was already green). No test changes. No product code changes.

## Tasks

1. Extend the `deleteMany` chain in `prisma/seed.ts` to cover every model that was missing, in FK-safe order (children before parents).

## Implementation

- [prisma/seed.ts:18](prisma/seed.ts) — added 13 `deleteMany` calls for models that were missing from the wipe list: `Payment`, `InvoiceLine`, `Invoice`, `ProgramFeeStructure`, `FeeComponentDef`, `Admission`, `StudentAssessmentScore`, `StudentAssessment`, `AssessmentIndicator`, `AssessmentCategory`, `AssessmentTemplate`, `LeaveRequest`, `Role`. Payments → InvoiceLines → Invoices ordering respects the `Invoice_studentId_fkey` and `InvoiceLine_invoiceId_fkey` constraints that caused the original `P2003`.

## Verification

- `npm run build` — passes (Next.js production build green).
- `npx vitest run` — 174 tests passed across 19 files.
- `npx prisma db seed` — succeeds against the shared Supabase staging DB (which previously had 37 invoices blocking). Completes in ~5s with the usual `✅ Seed complete!` trailer.
- `DEMO_MODE=true npx playwright test` — **27/27 passed** locally against a fresh `npm run start` server after reseed. Matches the CI pass count on `origin/staging`.
- Test plan for the reviewer: check out this branch, `npm ci`, `npx prisma generate`, `npx prisma db seed`, `npm run build`, `DEMO_MODE=true npx playwright test` — expect 27 green.

## Ship Notes

- **Migrations:** none. Schema unchanged.
- **Env vars:** none added.
- **Seed data:** no new rows; only the wipe step was extended. Seeded row counts for existing fixtures are unchanged.
- **Rollback:** revert the single commit on `prisma/seed.ts`. No runtime artifacts affected.
- **Follow-ups (not in this cycle):** (a) clean up the two orphan GUARDIAN users and reset `u_school_admin` back to `SCHOOL_ADMIN` on the shared Supabase staging DB; (b) decide whether local dev should run against a dedicated local Postgres rather than shared Supabase to avoid drift recurring.
