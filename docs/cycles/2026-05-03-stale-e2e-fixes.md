# Stale Playwright E2E Fixes

## Context

Three Playwright specs failing on staging after recent merges. User flagged
all three but mis-diagnosed (2) and (3) — the actual root causes are
narrower than reported. Investigation summary:

**(1) `e2e/admin.spec.ts:473, 520, 567, 616` — confirmed.**
PR #167 era added a `DEMO_MODE` short-circuit to `lib/xendit/client.ts:182-189`:
when `process.env.DEMO_MODE === "true"`, `createXenditSession()` returns a
synthetic `{ id: "demo_session_<ref>", payment_link_url: "https://demo.xendit.local/...", status: "ACTIVE" }`
without hitting the real Xendit API. Reasons documented in client.ts:167-172
(localhost http URLs rejected with `INVALID_URL`; sandbox rate-limit blocks
bulk tests with `RATE_LIMIT_EXCEEDED`).

E2E runs against the production build with `DEMO_MODE=true npm run start`
(CLAUDE.md, "Testing gates"). Effect: every invoice creation in DEMO_MODE
synthetically succeeds → `Invoice.status = SENT`, never
`PENDING_PAYMENT_LINK`, no `paymentLinkError`, no `Link Gagal` badge, no
`Coba Lagi Link (N)` header button. Four tests built around the failure
contract collapse:

- `:473` "manual create surfaces alert card …" — asserts `created.status === "PENDING_PAYMENT_LINK"` and `created.xenditError`. DEMO_MODE → SENT, no error.
- `:520` "bulk failure leaves PENDING_PAYMENT_LINK rows …" — asserts `batch.results[].status === "PENDING_PAYMENT_LINK"`. DEMO_MODE → all SENT.
- `:567` "header bulk-retry button visible …" — depends on `stats.pendingPaymentLink > 0` to render the trigger.
- `:616` "pending-payment-link breakdown popover …" — same dependency.

**(2) `e2e/design-system.spec.ts:25` — NOT a CSP/X-Frame-Options issue.**
User's hypothesis incorrect. Static HTML serves fine (verified by
inspection — `public/admin/design-system-reference.html` exists; test 2
GETs it directly with a 200 expectation and is unaffected). Real failure:
selector drift after Talib rebrand. Page renders
`<iframe title="Talib Design System reference">` at
`app/admin/design-system/page.tsx:62`, but the test still queries
`iframe[title="An Nisaa' ERP Design System reference"]` (spec:42-44) →
zero matches → `toBeVisible()` fails.

**(3) `e2e/teacher.spec.ts:79` — NOT a logout selector drift.**
`aria-label="Keluar"` still wired correctly at
`components/portal/portal-header.tsx:94`. The click works; the
post-logout assertion at spec:82 fails: `await expect(page.locator("text=An Nisaa")).toBeVisible();`.
Landing page (`app/page.tsx:121`) replaced the legacy wordmark with
`<TalibWordmark size="lg" showSublabel … />`. Visible text on the
post-logout landing is now "Talib" (with "by An Nisaa' Sekolahku" sublabel
at `app/page.tsx:262`). Selector matches the sublabel only when present,
which is unreliable; the wordmark "Talib" is the stable anchor.

Why this matters now: master CI gate (`npm run build && npx vitest run && npx playwright test`) is the merge guard for `staging → main`. Six failing specs block every cycle's `/ship`. Pure-docs cycles can skip Playwright per CLAUDE.md, but anything touching `app/**`/`lib/**` cannot.

## Spec

**Acceptance criteria:**

1. `e2e/admin.spec.ts` — the four Xendit-failure tests (`:473`, `:520`, `:567`, `:616`) `test.skip()` when `process.env.DEMO_MODE === "true"`, with a one-line skip reason citing the short-circuit and stating real-Xendit failure paths are validated manually on staging deploys (echoing the rationale comment in `lib/xendit/client.ts:167-172`). The other Xendit tests in the file (DEMO_MODE-compatible: combobox happy-path, validation, breakdown shape mock) are not modified.
2. `e2e/design-system.spec.ts:42-44` — iframe selector updated to `iframe[title="Talib Design System reference"]`. No other behavior change. Test 2 (static HTML GET) untouched.
3. `e2e/teacher.spec.ts:82` — post-logout assertion updated from `text=An Nisaa` to a stable Talib-brand anchor. Use `getByText("Talib", { exact: true })` against the wordmark, OR scope to the landing-page `h1`/wordmark container. Avoid asserting against the `app/page.tsx:262` sublabel (gated on `isSupabaseConfigured`).
4. **Local end-of-cycle gate green:** `npm run build && npx vitest run && npx playwright test` all pass on this worktree.
5. **CI green on the PR:** `Lint, Typecheck & Test`, `Build`, `Playwright E2E` all pass before `/ship` merges.

**Non-goals:**

- Not rewriting Xendit failure tests against the SENT-success path. Their job is to cover the failure contract, not assert that DEMO_MODE behaves; coverage of the synthetic happy-path is already implicit in the four other tests in `admin-school-admin.spec.ts` and the combobox happy-path at `admin.spec.ts:706+`.
- Not removing the `DEMO_MODE` short-circuit. It is load-bearing for CI determinism (rate-limit + INVALID_URL).
- Not auditing X-Frame-Options / CSP frame-ancestors. The `/admin/design-system` iframe loads same-origin — no header surgery needed.
- No README change (no module/route/entity change; test file fixes only).
- No `design-system` token required in cycle-doc Verification — frontend gate (pre-commit Rule 4) only triggers on `app/**/*.{tsx,css}`, `components/**/*.tsx`, or `tailwind.config.*` diffs. This cycle stages `e2e/**` and `docs/cycles/**` only.

## Tasks

Three independent file edits, then one verification pass. Subagent-driven
not warranted — total diff is ~12 lines across 3 files, sequential is
faster.

### Task 1 — `e2e/admin.spec.ts`: skip Xendit-failure tests in DEMO_MODE

Add `test.skip(process.env.DEMO_MODE === "true", "Xendit short-circuit in DEMO_MODE returns synthetic SENT — failure-path coverage validated manually on staging. See lib/xendit/client.ts:167.")` as the first line inside each of the four test bodies (`:473`, `:520`, `:567`, `:616`).

Skip is per-test (not `describe.skip`) so the file's other Xendit tests still run.

Gate: `npx playwright test e2e/admin.spec.ts --grep "Xendit fails|stillFailed|header bulk-retry|breakdown popover" --reporter=list` shows 4 skipped, 0 failed.

### Task 2 — `e2e/design-system.spec.ts`: update iframe title selector

Edit spec:42-49 — replace `An Nisaa' ERP Design System reference` with `Talib Design System reference`. The `toHaveAttribute("src", "/admin/design-system-reference.html")` assertion is unchanged.

Gate: `npx playwright test e2e/design-system.spec.ts --reporter=list` → 2 passed, 0 failed.

### Task 3 — `e2e/teacher.spec.ts`: update post-logout brand assertion

Edit spec:82 — replace `await expect(page.locator("text=An Nisaa")).toBeVisible();` with an assertion that matches the rebranded landing wordmark. Preferred: `await expect(page.getByText("Talib").first()).toBeVisible();` (the `.first()` disambiguates wordmark from sublabel + footer occurrences).

Gate: `npx playwright test e2e/teacher.spec.ts --grep "logout works" --reporter=list` → 1 passed.

### Task 4 — End-of-cycle gate + Verification fill

Run the full gate locally: `npm run build && npx vitest run && npx playwright test`. Capture pass counts in Verification. If any unrelated test fails, treat as scope creep — surface to user before fixing.

Fill cycle doc Implementation + Verification + Ship Notes sections. Commit per task (4 commits) per `/build` rule (one commit per task, not per cycle).

## Implementation

- Subagent plan: 4 tasks executed sequentially inline (each diff <12 lines; dispatch overhead > sequential cost).
- Task 1: Skip Xendit-failure tests in DEMO_MODE — `e2e/admin.spec.ts` (+16 lines, 4 `test.skip()` blocks at the four originally-failing test bodies). Each skip cites `lib/xendit/client.ts:167` + manual-staging-validation rationale.
- Task 2: Update design-system iframe selector — `e2e/design-system.spec.ts:43` (1-line change). Title string `An Nisaa' ERP Design System reference` → `Talib Design System reference` to match rebranded `app/admin/design-system/page.tsx:62`.
- Task 3: Update teacher post-logout brand assertion — `e2e/teacher.spec.ts:79-84` (assertion + 2 comment lines). Replaced `text=An Nisaa` (broken since rebrand — string only present in conditional sublabel) with `getByText("Talib", { exact: true }).first()`. Logout button selector `[aria-label='Keluar']` left untouched — verified still wired at `components/portal/portal-header.tsx:94`. Reviewer flagged initial draft (`getByText("Talib")`) substring-matched the footer "Talib by An Nisaa' Sekolahku" → swapped to `exact: true`.

## Verification

- Task 1: `npm run build` ✓; `npx vitest run` → 974 passed / 0 failed / 42 todo / 2 skipped (115 files). `feature-dev:code-reviewer` agent: no high-confidence issues.
- Task 2: `npm run build` ✓; `npx vitest run` → same counts (Playwright-only change, vitest unaffected). `feature-dev:code-reviewer` agent: title string verified identical to `app/admin/design-system/page.tsx:62` source.
- Task 3: `npm run build` ✓; `npx vitest run` → same counts. `feature-dev:code-reviewer` agent: caught substring-match fragility on first draft, fixed via `exact: true`.

## Ship Notes

_(filled by `/ship`)_
