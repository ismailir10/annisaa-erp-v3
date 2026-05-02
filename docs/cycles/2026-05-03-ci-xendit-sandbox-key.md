# CI Xendit Sandbox Key Hookup

## Context
Playwright runs on CI surfaced `[XENDIT ERROR] Create session failed: INVALID_API_KEY` on every admin-tagihan test (admin.spec.ts:429–706) since the start. Root cause: `.github/workflows/ci.yml` Playwright step only sets `DEMO_MODE`, `DATABASE_URL`, `NEXTAUTH_SECRET` — `XENDIT_SECRET_KEY` is undefined. `lib/xendit/client.ts` then hits the live Xendit API with an empty key and gets rejected. Failing tests have been tolerated/ignored; closing the gap so CI signal is real.

## Spec
- [x] GitHub repo secret `XENDIT_SECRET_KEY` set to the existing sandbox key (`xnd_development_*` prefix, same value Vercel preview already uses).
- [x] `.github/workflows/ci.yml` Playwright step injects the secret as `XENDIT_SECRET_KEY: ${{ secrets.XENDIT_SECRET_KEY }}`.
- [x] Build step left alone — build doesn't need it.

### Non-goals
- Add `XENDIT_WEBHOOK_TOKEN` to CI. Webhook flows aren't exercised by any current test; defer until a webhook test exists.
- Refactor `lib/xendit/client.ts` to no-op when key is missing. Real fix is a real key in CI.

## Tasks
1. [x] `gh secret set XENDIT_SECRET_KEY` with sandbox value.
2. [x] Patch ci.yml Playwright step env block.

## Implementation
- `gh api repos/.../actions/secrets` confirms 1 secret stored (`XENDIT_SECRET_KEY`, created 2026-05-02 17:00 UTC).
- `.github/workflows/ci.yml:127-138` Playwright step adds 5 lines (1 env var + 4-line comment explaining the why).

## Verification
- Repo secret presence: `gh api repos/ismailir10/annisaa-erp-v3/actions/secrets` → `total_count: 1`.
- ci.yml diff is the only code change. No tests added — the test pass/fail itself is the signal once CI runs.
- Watch first PR CI run after merge: admin.spec.ts:429–706 should flip green.

## Ship Notes
- Rotation: when the Xendit dev key is rotated, run `gh secret set XENDIT_SECRET_KEY` with the new value. No code change needed.
- Production / Preview Vercel envs already have their own copy of the key (separate from this repo secret). Three sources of truth now: Vercel Production, Vercel Preview, GitHub Actions.
- Future tightening: move all three to a single secrets manager (Vercel Edge Config, Doppler, etc.) so rotation is one-click.
