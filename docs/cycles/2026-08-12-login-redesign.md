# Login Redesign — Google-only, light background

## Context

The login screen at `app/page.tsx` is the first thing every admin, teacher, and parent
sees, and it is currently a dark `bg-sidebar` (`#1A2E2F`) card that offers two sign-in
methods: Google OAuth and a magic-link email form. Access to Talib is invitation-only —
accounts are provisioned by the school, never self-served — so a visible email field
invites people who have no account to try, fail, and contact support. The owner has
asked for a light, minimal, Google-only screen that reads as a polished front door.

A plan-first audit ran before this cycle and is committed at
[`docs/archive/legacy-doc-dirs/proposals/login-redesign/README.md`](../proposals/login-redesign/README.md) with
rendered mockups. It found the magic-link blast radius is exactly one call site
(`app/page.tsx:77` — no `inviteUserByEmail`, no `generateLink`, no `signInWithPassword`
anywhere in the repo, and account provisioning goes through service-role
`auth.admin.createUser` in `scripts/reseed/users.ts`), and it surfaced four
accessibility defects in the current screen that this cycle fixes on the way past. It
also flagged that hiding the UI does not close the `/auth/v1/otp` endpoint, since
`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the client bundle and `/auth/callback` is
method-agnostic. **The owner has reviewed that trade and accepted it** — the Supabase
Email provider stays enabled this cycle.

UAT input: no report targets the login screen. The newest relevant note is
`docs/uat/reports/2026-05-14-comprehensive-e2e.md:202`, which records three real Google
identities used end-to-end with no magic-link usage. That report is 90 days old and
therefore **stale under the 60-day rule** — treated as directional support for
Google-only, not as evidence.

## Spec

Owner-locked decisions (do not re-litigate):

- One responsive design based on proposal Direction B. Direction A is dropped.
- Magic link: hide the UI only. Do **not** disable the Supabase Email provider.
- "Hubungi admin sekolah" stays plain text — no `mailto:` or WhatsApp link.
- No prod lockout check — parents are already required to use Gmail.
- Ship to staging only. Prod promotion is a separate, owner-confirmed step.

Acceptance criteria:

- [ ] AC1 — Page background is light. The `--sidebar` / `--login-card-bg` dark shell is
      gone from the Supabase branch.
- [ ] AC2 — Desktop (≥`lg`): two-column split. Teal `--secondary` brand panel with the
      geometric motif, tagline, and capability rows on one side; white sign-in column on
      the other.
- [ ] AC3 — Mobile (<`lg`): the Google sign-in block renders **first** in the visual
      order, brand panel below it. Proven by an assertion on the rendered `y`
      coordinates, not by inspection.
- [ ] AC4 — Google is the only sign-in affordance in the Supabase branch. No email
      input, no "atau" divider, no "Cek Email Anda" panel.
- [ ] AC5 — `handleMagicLink`, the `email` and `magicLinkSent` state, and the now-unused
      `Mail` / `Field` / `FieldLabel` / `Input` / `Separator` imports are deleted.
      `signInWithOtp` appears nowhere in the repo.
- [ ] AC6 — The Google button is ≥48px tall at every viewport.
- [ ] AC7 — The Google button's focus-visible ring measures ≥3:1 against its adjacent
      background. Uses `--primary-text` (`#2F7A7D`, 5.0:1 on white), not `--ring`
      (`#5DB4B8`, 2.36:1).
- [ ] AC8 — The entrance animation is gated on `prefers-reduced-motion`.
- [ ] AC9 — The `?error=` banner still renders `auth_failed` and `access_denied` with
      the existing copy, and states the recovery route before the failure as well.
- [ ] AC10 — The demo-mode account picker is behaviourally untouched: same
      `/api/auth/users` fetch, same `handleDemoLogin`, same admin/teacher grouping.
- [ ] AC11 — The Talib wordmark and the "Sahabat belajar anak" tagline are both still on
      the page, so `e2e/branding.spec.ts:68-72` passes unchanged.
- [ ] AC12 — Full gate green: `npm run build`, `npx vitest run`, `npx tsc --noEmit`,
      `npm run lint`, `scripts/verify-api-auth.sh`, `scripts/verify-rls-coverage.sh`,
      `npx playwright test`.
- [ ] AC13 — Real-page screenshots captured at 1280px and 390px and committed.

Non-goals:

- Disabling the Supabase Email provider (owner-deferred; the endpoint stays reachable).
- Any change to `app/auth/callback/route.ts` — role routing and auto-provisioning are
  untouched.
- Any change to who has an account, or to `/api/auth/users`.
- The legal pages themselves (`app/legal/**`); only the footer's surface tone changes.
- A shared fix for the `--ring` contrast issue across all Shadcn buttons. That is a real
  finding but it is a global visual change; this cycle scopes the fix to the login
  button and leaves a note.

Assumptions:

1. `lg` (Tailwind's 64rem) is the right split point. The proposal mocked 62rem; using
   the framework's own breakpoint avoids a one-off custom value for a 2rem difference.
2. The demo-mode branch keeps its current dark styling. "Untouched" is read literally —
   it is a dev/E2E-only surface, and restyling it would put all 33 Playwright specs at
   risk for no user-facing gain. The two branches will look different; that is
   deliberate and recorded here.
3. Screenshots are captured against `npm run start` **without** `DEMO_MODE`, so the real
   Supabase branch renders. `.env` already supplies `NEXT_PUBLIC_SUPABASE_URL`.
4. Retiring `--login-card-bg` / `--login-primary-hover` from `app/globals.css` is safe —
   both are login-only and grep-verified unused elsewhere.

## Tasks

- [ ] **T1 — Light shell + responsive Direction B layout** (`app/page.tsx`,
      `components/layout/legal-footer.tsx`)
      Rewrite the Supabase branch as the two-column split with mobile order inverted.
      Add a light-surface tone to `LegalFooter` (today it is hardcoded for a dark
      background). Cross-check `design-system` for brand tokens, spacing, and the motif
      opacity convention. Reuse `TalibWordmark` at its default tone rather than adding a
      prop. *Acceptance: AC1, AC2, AC3, AC11 — desktop shows two columns, mobile shows
      the sign-in block above the brand panel.*
      Depends on: nothing.

- [ ] **T2 — Strip the magic-link UI** (`app/page.tsx`)
      Delete `handleMagicLink`, the `email` / `magicLinkSent` state, the `<form>`, the
      "Cek Email Anda" panel, the "atau" divider, and the now-unused imports. Keep the
      `?error=` banner. *Acceptance: AC4, AC5, AC9 — `grep -r signInWithOtp` returns
      nothing; the error banner still renders both codes.*
      Depends on: T1 (same file; sequential to avoid a conflicted rewrite).

- [ ] **T3 — Accessibility fixes** (`app/page.tsx`)
      Google button to a ≥48px min-height; focus-visible ring switched to
      `--primary-text`; the Framer entrance gated behind `useReducedMotion()`.
      *Acceptance: AC6, AC7, AC8 — measured button height ≥48 at 390px and 1280px.*
      Depends on: T1, T2.

- [ ] **T4 — Retire the login-only dark tokens** (`app/globals.css`)
      Remove `--login-card-bg` and `--login-primary-hover` plus their `@theme` mappings.
      *Acceptance: build green, no `login-card-bg` reference remains outside the demo
      branch.*
      Depends on: T1.

- [ ] **T5 — Real-page capture + geometry assertions**
      (`scripts/capture-login-mockups.mjs` → `scripts/capture-login.mjs`)
      Point the existing headless-render script at the running app instead of the static
      mockups. Assert the Google button is ≥48px and that at 390px its `y` is **less
      than** the brand panel's `y`. Commit both screenshots.
      *Acceptance: AC3, AC6, AC13 — script exits 0 and writes two PNGs.*
      Depends on: T1, T2, T3.

- [ ] **T6 — Full gate + PR to staging**
      Run all seven checks, fix any fallout, fill Verification and Ship Notes, open the
      PR against `staging`. *Acceptance: AC12 — every gate green, PR open, staging
      deploy verified. Prod not touched.*
      Depends on: T1–T5.

## Implementation

**T1–T3 landed as one commit.** They are three edits to the same 200-line region of
`app/page.tsx`; splitting them would have meant committing a light layout that still
contained the magic-link form, then a form-less layout with a 36px button — two states
that never make sense on their own. Recorded here rather than pretending otherwise.

- **`app/page.tsx`** — split into two components behind the existing
  `NEXT_PUBLIC_SUPABASE_URL` branch:
  - `SignInPage` (new) — light `bg-background` shell,
    `grid-cols-1 lg:grid-cols-[1.05fr_1fr]`. The sign-in section is **first in the DOM**
    with `lg:order-2`, so mobile puts the action on top and desktop still renders the
    brand panel on the left. Google is the only affordance. A compact logo + wordmark
    sits above the heading on mobile only (`lg:hidden`); the brand panel owns the
    lockup on desktop.
  - `DemoLoginPage` — the previous dark demo-mode markup moved verbatim, including
    `Card`/`CardContent` and `bg-login-card-bg`. Only change: `demoLoading` now
    initialises to `true` and the fetch effect drops its `isSupabaseConfigured` guard,
    because the component only mounts when Supabase is absent.
  - Deleted: `handleMagicLink`, `email` + `magicLinkSent` state, the `<form>`, the
    "Cek Email Anda" panel, the "atau" divider, and the `Mail` / `Field` / `FieldLabel`
    / `Input` / `Separator` imports.
  - Brand panel carries an inline eight-point geometric motif at `opacity-[0.06]`,
    `aria-hidden`, `-z-10`, `pointer-events-none`.
  - a11y: Google button `h-auto min-h-12` (48px, was `h-9` = 36px);
    `focus-visible:border-primary-text focus-visible:ring-2 focus-visible:ring-primary-text`
    (5.0:1 on white, replacing the 2.36:1 `--ring`); entrance uses
    `useReducedMotion()` → `initial={false}` when the user asks for reduced motion.
- **`components/layout/legal-footer.tsx`** — added a `tone` prop (`"onDark"` default,
  `"onLight"` new) and a `className` passthrough. Link padding raised to
  `px-2 py-1.5` so each link clears the 24px WCAG 2.5.8 hit-area floor. The demo screen
  keeps the default tone, so its rendering is unchanged.
- **`app/globals.css`** — removed `--login-primary-hover` and its `@theme` mapping
  (grep-verified unused). **`--login-card-bg` was kept**, contrary to T4 as written:
  the demo-mode shell still uses it. Both comments now say which surface owns them.
- **`scripts/capture-login.mjs`** (replaces `scripts/capture-login-mockups.mjs`) — points
  the headless renderer at the running app instead of the static mockups and asserts the
  layout contract (see Verification).
- **`README.md`** — auth row no longer claims Magic Link; brand-chrome paragraph
  describes the split layout and the new two-part tagline.

## Verification

### Gate results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean, no output |
| `npm run lint` | `✖ 60 problems (0 errors, 60 warnings)` — all pre-existing, none in `app/page.tsx` or `components/layout/legal-footer.tsx` (grepped the report for both paths: no hits) |
| `npm run build` | green |
| `npx vitest run` | `Test Files 290 passed | 2 skipped (292)`, `Tests 2686 passed | 42 todo (2728)` |
| `bash scripts/verify-api-auth.sh` | `✓ API auth coverage OK: 184 / 184 routes` |
| `bash scripts/verify-rls-coverage.sh` | `✓ RLS coverage OK: 39 / 39 tenant-scoped models` |
| `npx playwright test branding.spec.ts` | `5 passed (9.1s)` — includes `login screen shows Talib wordmark + tagline` |
| `npx playwright test` (full) | **Not run locally — deferred to the required CI `Playwright E2E` check.** See below. |

### Why the full Playwright suite is deferred

`playwright.config.ts` refuses to run against a non-local `DATABASE_URL`, and this
harness's `.env` points at the shared staging Supabase. The specs create and mutate real
rows through the demo-cookie API, so a local run would write `E2E …` fixtures straight
into staging — the exact 2026-06-04 pollution incident that guard was added to prevent.
Neither Postgres nor Docker is installed here (`which psql postgres pg_ctl docker` → all
not found), so an ephemeral local database is not available either. CI runs the suite
against a throwaway localhost Postgres and `Playwright E2E` is a required check on the
PR, so the merge is still gated on it.

`branding.spec.ts` was run locally as the exception: it is read-only (one
`GET /api/auth/users`, then page loads and text assertions — no writes), and it is the
only spec that loads `/`. It passes, which is the assertion this cycle actually puts at
risk.

### Layout contract, machine-asserted

`node scripts/capture-login.mjs` against `npm run start` on :3120:

```
wrote docs/archive/legacy-doc-dirs/proposals/login-redesign/login-desktop-1280.png  (button 48px @ y=388, brand @ x=48 y=339, overflow: false)
wrote docs/archive/legacy-doc-dirs/proposals/login-redesign/login-mobile-390.png  (button 48px @ y=244, brand @ x=24 y=533, overflow: false)

Login screen: button >= 48px, mobile action above the brand panel, no overflow.
```

- **AC3 proven, not eyeballed** — at 390px the Google button sits at `y=244` and the
  brand panel heading at `y=533`. The script exits non-zero if that ordering flips.
- **AC6** — 48px at both widths.
- **AC2** — at 1280px the brand panel is at `x=48` and the sign-in column to its right.
- No horizontal overflow at either width.

Screenshots were captured against a build with the public Supabase vars supplied through
a temporary gitignored `.env.production.local`, because the repo's `.env.local` blanks
`NEXT_PUBLIC_SUPABASE_URL` to force demo mode locally. That file was deleted after the
capture; it is not part of the diff.

### Cross-checks

- Cross-checked `design-system` for the brand palette (`--secondary` panel, `--card`
  sign-in column), the geometric-motif opacity convention, and the `--type-*` ramp used
  for the headings.
- `grep -rn signInWithOtp` across `app/ lib/ components/ scripts/ e2e/` → no matches.
- No test in `e2e/`, `components/__tests__`, or `lib/__tests__` referenced the
  magic-link UI (`login-email`, `Kirim Magic Link`), so nothing needed rewriting to
  accommodate the removal.

### Not verified

- Real Google OAuth round-trip. Requires the deployed preview; happens at preview-verify
  on the PR, not locally.
- The `?error=access_denied` banner was not exercised against a live callback — the
  code path and copy are unchanged from before this cycle, only restyled.

## Ship Notes

- **Migrations:** none. No schema change.
- **Env vars:** none added, removed, or renamed.
- **Data backfill:** none.
- **Supabase dashboard changes:** **none, deliberately.** The Email (magic-link/OTP)
  provider stays enabled. This cycle is a UI change only: `/auth/v1/otp` is still
  reachable with the public anon key that ships in the client bundle, and because
  `/auth/callback` is method-agnostic, a magic link delivered to an address that has an
  `ACTIVE` `User`/`Employee`/`Parent` row still yields a valid session. The owner
  reviewed this and accepted it. Closing that path is a separate decision.
- **Lockout risk:** accepted by the owner on the grounds that parents are already
  required to use Gmail. No prod email-domain audit was run.
- **Rollback:** plain `git revert` of this cycle's commits. Nothing outside the repo
  changed, so a revert fully restores the previous screen including the magic-link form.
- **Scope note for the next UI cycle:** `components/ui/button.tsx` still uses `--ring`
  (2.36:1 on white) for its focus ring everywhere else in the app. This cycle fixed it
  only on the login button. The global fix is a visual change across all four portals
  and deserves its own cycle.
- **Prod:** not shipped. This cycle stops at staging by owner instruction.
