# Xendit DEMO_MODE Short-Circuit

## Context
After PR #164 hooked the sandbox `XENDIT_SECRET_KEY` into CI, two new errors appeared in admin tagihan tests: `INVALID_URL` (Xendit rejects the `http://localhost:3000` redirect URLs Playwright sends — only HTTPS allowed) and `RATE_LIMIT_EXCEEDED` (sandbox throttles bulk-tagihan tests that fire many session creations in quick succession). CI doesn't actually verify Xendit responses or webhook delivery — those flows are validated manually on staging deploys. The remaining CI value is exercising the route handlers, DB writes, and UI flows, all of which work fine with a synthetic Xendit response. Skipping the live Xendit call under `DEMO_MODE=true` (already set in CI) eliminates both errors and removes a flaky external dependency.

## Spec
- [x] `createXenditSession()` returns a synthetic `{ id, payment_link_url, status, expires_at }` without calling `fetch` when `process.env.DEMO_MODE === "true"`.
- [x] `pingXenditBalance()` no-ops in demo mode (health check meaningless without real backend).
- [x] Production / staging behavior unchanged — short-circuit only fires when `DEMO_MODE=true`.
- [x] Unit tests cover both branches (demo on → synthetic, demo off → real path).

### Non-goals
- Mock the webhook receive flow (`POST /api/xendit/webhook`). Webhook tests would need a separate fixture; not in CI today.
- Refactor `XENDIT_SECRET_KEY` plumbing. Key still required when `DEMO_MODE` unset.

## Tasks
1. [x] Add `DEMO_MODE` early-return at the top of `createXenditSession()` returning a synthetic response with id `demo_session_<referenceId>` and payment URL `https://demo.xendit.local/checkout/<referenceId>`.
2. [x] Same in `pingXenditBalance()` — early return undefined.
3. [x] Extend `lib/__tests__/xendit-client.test.ts` with 3 new tests (synthetic path, real-path env-missing throw, ping no-op).

## Implementation
- `lib/xendit/client.ts`: `createXenditSession` short-circuits before fetch when `DEMO_MODE=true`. Returns deterministic synthetic session shape matching `CreateSessionResponse`. `pingXenditBalance` returns immediately under same flag.
- `lib/__tests__/xendit-client.test.ts`: 3 new cases covering both branches via `vi.spyOn(globalThis, "fetch")` to assert no network calls.

## Verification
- `npm run build`: ✓ green.
- `npx vitest run`: ✓ 970 passed | 42 todo (was 967 before — 3 new tests landed).
- CI Playwright admin tagihan tests will now succeed against the synthetic session — no `INVALID_URL`, no `RATE_LIMIT_EXCEEDED`. First merged-CI run is the actual proof.

## Ship Notes
- Vercel Production has `DEMO_MODE` unset → real Xendit calls preserved.
- Vercel Preview has `DEMO_MODE` unset by default. Branches that want demo-mode preview (e.g., for screenshots without real keys) can set `DEMO_MODE=true` via `vercel env add` per-branch.
- Webhook flow still hits the real route handler in CI — only outbound session creation is mocked.
- Rollback: revert this commit. Real Xendit calls return regardless of `DEMO_MODE`.
