# Fix Teacher First-Login Auto-Provision Loop

## Context

Pilot audit (2026-06-02) found teachers can get stuck in a silent login loop.
When a teacher signs in with Google, the app bounces `/teacher` → `/` forever
and never lets them in — with no error surfaced anywhere a human can see.

Root cause (confirmed by differential repro on staging + a deterministic unit
test): `_getSession` in `lib/auth.ts` auto-provisions the Prisma `User` on
first login by calling `prisma.user.create({ employeeId })` **unconditionally**.
`User.employeeId` is `@unique` (`User_employeeId_key`). When the matched
`Employee` **already has a `User` row** whose email has diverged from the
verified Google auth email (seeded account, admin-created invite, or the
Employee email was edited after the User was created), the `create` violates
the unique constraint. The exception is swallowed by a bare `catch {}` that
logged only `"[AUTH] Session retrieval failed"` with no detail, so
`getSession()` returns `null`, middleware (`proxy.ts` → `updateSession`)
redirects to `/`, and the loop is undiagnosable.

Differential evidence: manually `UPDATE`-ing the *existing* User row's email to
the auth email (instead of creating) made login work immediately — proving the
Supabase session + `getUser()` were always valid and the blind `create` was the
sole failure. A genuinely fresh Employee (no linked User) was never affected;
the earlier "all new teachers loop" framing was contaminated by reusing a
seeded teacher that already owned a User.

## Spec

- A teacher whose Employee already has a linked User (email divergent from the
  verified Google email) signs in → resolves to their existing User, email
  reconciled to the verified auth email, lands on `/teacher`. No loop.
- A genuinely fresh Employee (no linked User) signs in → a TEACHER User is
  created as before. No regression.
- The existing row's **role is preserved** (admin intent) — only the stale
  email is synced.
- A swallowed session-resolution exception is always logged with its detail so
  any future silent-bounce is diagnosable.

Non-goals / assumptions:
- Guardian branch is unaffected: `parentId` is NOT `@unique`, so the parent
  `create` cannot hit this collision. Left as-is.
- Security: reconciling is safe — the gate is `Employee.email === authUser.email`
  (admin-assigned + Google-verified), so the divergent linked row belongs to the
  same intended identity; no account takeover surface.

## Tasks

1. [x] Reconcile-by-`employeeId` in `_getSession` teacher branch (findUnique →
   sync email / reuse, else create). Stop logging a detail-free error string.
2. [x] Failing-first regression test for both paths.

## Implementation

- `lib/auth.ts`
  - Teacher auto-provision branch: replaced the unconditional
    `prisma.user.create({ employeeId })` with a reconcile — `prisma.user.findUnique({ where: { employeeId } })`,
    then reuse (email match), update (email diverged), or create (no linked
    User). Preserves the linked row's role.
  - `catch (err)` now logs `console.error("[AUTH] Session retrieval failed", err)`
    so a swallowed exception is diagnosable in server logs.
- `lib/__tests__/auth-teacher-autoprovision.test.ts` (new)
  - Drives the production (Supabase) path via a mocked `createClient`.
  - Test A: Employee already has a User with divergent email → reconciles
    (update email), no `create`, returns TEACHER session. Failed before the fix
    (null + `[AUTH] Session retrieval failed`), passes after.
  - Test B: fresh Employee (no linked User) → `create` called, TEACHER session.

## Verification

- `npx vitest run lib/__tests__/auth-teacher-autoprovision.test.ts`: failing
  test reproduced the exact bug pre-fix (`expected null not to be null`,
  stderr `[AUTH] Session retrieval failed`); both pass post-fix.
- `npm run build`: green.
- `npx vitest run`: 1887 passed / 42 todo / 0 failed (one earlier run showed 2
  flaky env-timeout failures under a slow 462s setup; clean re-run at 87s = 0
  failures). 17 transient "lib/generated/prisma/client" transform failures were
  a fresh-worktree missing-client artifact — resolved by `npx prisma generate`,
  unrelated to the change.
- `npx playwright test` (local, against this worktree's prod build): **119
  passed / 2 failed / 7 skipped (5.1m)**. Verbatim failures:
  - `e2e/admin.spec.ts:437 › Admin tagihan flows › bulk generate ... PENDING_PAYMENT_LINK`
  - `e2e/parent.spec.ts:91 › Parent flows › home and /parent/invoices agree on outstanding (UAT-2026-05-03 INV-01)`
  Both are billing/invoice specs, deterministic in isolation. They run
  `DEMO_MODE=true` → `getDemoSession` (cookie path), which this change does NOT
  touch — the diff is confined to `_getSession`'s production Supabase
  auto-provision branch + the catch. They are therefore outside this change's
  reach. Local e2e is non-hermetic (symlinked `.env` DATABASE_URL → shared DB
  with live data), whereas CI runs against a fresh Postgres + seed and Playwright
  passed on the base commit (#314 staging→main). **CI Playwright is the
  authoritative gate; it runs on this PR.** Initial run also hit a stale
  `next-server` squatting on :3000 (reuseExistingServer=true locally) — killed
  it and re-ran against the correct build before recording the above.
- Live teacher-OAuth re-verify happens in preview-verify against a fresh
  Employee with no pre-existing User (auto-create path) + a divergent-email
  Employee+User (reconcile path).

## Ship Notes

- No migration. No env var change. Code-only fix to `lib/auth.ts`.
- Rollback: revert the single `lib/auth.ts` commit — restores prior behavior
  (the loop). No data migration to undo.
- Staging note: `ismail10rabbanii@gmail.com` was registered as TEACHER (linked
  to Employee "Guru Dua") during the audit and left in place for testing; once
  this fix deploys, that manual reconcile is no longer required but is harmless.
- Post-merge verification: on the preview/staging, point a fresh Employee's
  email at a controllable Google account with NO pre-existing User, sign in,
  confirm `/teacher` loads (auto-create path) — then confirm a divergent-email
  Employee+User also resolves (reconcile path).
