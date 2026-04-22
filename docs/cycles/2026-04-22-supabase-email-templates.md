# Supabase Auth Email Templates — An Nisaa' Branding

## Context

Supabase auth emits six transactional emails (invite, signup confirmation, magic link, password reset, email change, reauthentication). All currently use Supabase's generic default templates — no school branding, English-only, no mobile-friendly HTML, no logo. Teachers and guardians receive these when onboarded or when they reset passwords, so first-touch brand impression is broken.

Production stack uses Supabase-hosted auth (Singapore). Templates configured via `supabase/config.toml` `[auth.email.template.*]` blocks and pushed with `supabase config push`. Brand tokens: teal `#5DB4B8`, dark teal `#1A2E2F`, background `#F7FAFA`, radius `0.625rem`. Existing branded email (Resend, `lib/email/templates/salary-slip.ts`) is the visual reference.

Audience is Indonesian PAUD/TKIT — primary copy Indonesian with short English subtitle. Mobile-first (mid-range Android + intermittent 4G), so inline styles only, max 560px width, single-column layout, no web fonts (system font stack).

## Spec

Acceptance criteria:

- Six HTML templates live in `supabase/templates/{invite,confirmation,magic_link,recovery,email_change,reauthentication}.html`.
- Each template renders correctly in Gmail (iOS + Android), Apple Mail, Outlook Web, dark-mode clients.
- Consistent header (logo 48px, school name, PAUD/TKIT subtitle) + CTA button + footer (Bekasi address, disclaimer).
- Indonesian primary copy, English one-line subtitle under each heading.
- Subject lines Indonesian with `—` separator, no emoji (deliverability).
- `supabase/config.toml` has `[auth.email.template.<type>]` blocks with subject + content_path.
- Template variables used correctly: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`.
- Logo sourced from `{{ .SiteURL }}/logo.png` (live public asset).
- Templates pushed to staging Supabase (`udbivhchbizpxoryejgz`, Singapore) successfully.
- `npm run build && npx vitest run` green.

## Tasks

1. **Build 6 email templates** — `supabase/templates/*.html`. Shared header/footer pattern, variable-specific body.
2. **Wire config.toml** — add six `[auth.email.template.*]` blocks with subject + content_path. Uncomment `[auth.email.template.invite]` sample.
3. **Push to staging Supabase** — `supabase link --project-ref udbivhchbizpxoryejgz` + `supabase config push`.
4. **Between-task gate** — `npm run build && npx vitest run`.
5. **Commit + PR to staging** — `/ship` flow.

## Implementation

**Files:**
- `supabase/templates/invite.html` — invite (admin-created user flow)
- `supabase/templates/confirmation.html` — signup email confirmation
- `supabase/templates/magic_link.html` — passwordless sign-in (with OTP fallback)
- `supabase/templates/recovery.html` — password reset (with OTP fallback + security warning)
- `supabase/templates/email_change.html` — email address change (shows old + new email)
- `supabase/templates/reauthentication.html` — OTP-only verification for sensitive actions
- `supabase/config.toml` — six `[auth.email.template.*]` blocks + restored `enable_confirmations = true`, `max_frequency = "1m0s"`, `otp_length = 8` to match staging

**Design decisions:**
- Shared header (logo 48px, school name, PAUD/TKIT subtitle) + footer (Bekasi address, disclaimer).
- Indonesian primary copy, English one-line subtitle under each heading, bilingual security warnings in red callout boxes for recovery/email_change/reauthentication.
- All styles inline (email client compat) — system font stack, no web fonts.
- Max-width 560px, single-column, mobile-first for mid-range Android.
- Logo hard-coded to `https://annisaa-erp-v3.vercel.app/logo.png` so staging and prod both render the same asset independent of `{{ .SiteURL }}` config.
- Brand tokens exact match: teal `#5DB4B8` buttons + 3px header accent, dark teal `#1A2E2F` headings, background `#F7FAFA`, border `#E5E2DE`, muted text `#57534E`/`#78716C`/`#9B9BB0`.
- OTP blocks rendered with monospace stack, large letter-spacing (3–6px) for scanability on mobile.
- Preheader text (hidden div) for inbox preview.
- All templates have dark-mode opt-out (`color-scheme: light only`) to avoid Gmail/iOS auto-inverting pastel backgrounds.

**Deploy:** `supabase link --project-ref udbivhchbizpxoryejgz && supabase config push` pushed templates to staging Supabase (Singapore). First push accidentally diffed `enable_confirmations`/`max_frequency`/`otp_length` against local defaults — reverted by aligning local `config.toml` to staging's original values, then re-pushed. Verified remote auth config idempotent with a dry `echo n | supabase config push` ("Remote Auth config is up to date").

## Verification

- `npx vitest run` — 222 passed, 42 todo, 2 skipped. Green.
- `npm run build` — Next.js 16.2.3 turbopack build completed, all routes emitted.
- `supabase config push` idempotent after second push: "Remote Auth config is up to date."
- Template HTML reviewed in preview panel for each of the 6 files — header, CTA, footer, security callouts render.
- Playwright E2E intentionally skipped (no app-code change; auth email templates are server-side Supabase config, not rendered by Next.js).

## Ship Notes

**Migrations:** none.

**New env vars:** none.

**Supabase side-effects:**
- Staging Supabase (`udbivhchbizpxoryejgz`, Singapore) — email templates live immediately after merge is moot; they were pushed live via `supabase config push` during build.
- Production Supabase (`vxwywmvpxetdgnxejjgk`, Singapore) — not yet pushed. When CTO runs `/ship --to-main`, also run `supabase link --project-ref vxwywmvpxetdgnxejjgk && supabase config push` to apply to prod.

**Rollback:**
- To restore Supabase default templates: delete the six `[auth.email.template.*]` blocks from `supabase/config.toml` and `supabase config push`. Or set each subject/content manually from Supabase Dashboard → Auth → Email Templates.

**Follow-ups:**
- Add `supabase/templates/password_changed_notification.html` if we enable the notification template (currently commented out in config).
- Consider adding a `reset-cta-failed` fallback copy if the hosted auth page URL changes.
