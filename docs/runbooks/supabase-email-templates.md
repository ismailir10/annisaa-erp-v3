# Supabase Auth Email Templates — Talib

Talib-branded HTML mirrors of the 5 transactional auth emails Supabase sends. The Supabase dashboard owns the live copy that actually ships; these files are the version-controlled source of truth so future edits go through PR review and never silently drift.

## Why version-controlled

- **Audit trail.** Brand copy + colors evolve; git blame shows who changed which subject line and when.
- **PR review.** Voice (`voice.md`) + design tokens (`design-system.html`) are reviewed when copy changes, same as any other user-facing string.
- **Disaster recovery.** If a dashboard slot is wiped or a project is restored from a fresh provision, paste from these files to restore brand parity.

## Template → dashboard slot mapping

Open the prod project in Supabase: **Authentication → Email Templates**. Each file maps to one slot:

| File | Dashboard slot | Subject line (Indonesian) |
|---|---|---|
| `invite.html` | Invite User | `Anda diundang ke Talib` |
| `magic-link.html` | Magic Link | `Tautan masuk Talib Anda` |
| `recovery.html` | Reset Password | `Reset kata sandi Talib` |
| `confirm-signup.html` | Confirm Signup | `Konfirmasi email Talib` |
| `change-email.html` | Change Email Address | `Konfirmasi perubahan email` |

## Sender display config (one-time, prod project)

In Supabase: **Authentication → SMTP Settings**. Enable "Custom SMTP" and set:

- **Sender name:** `Talib by An Nisaa' Sekolahku`
- **Sender email:** `noreply@talib.annisaasekolahku.com`
- **Host / port / username / password:** Resend SMTP credentials (per Cycle B assumption #9 — Resend SMTP is wired into the prod project; sender domain `talib.annisaasekolahku.com` SPF/DKIM is authenticated per Cycle A risk-mitigation)

The sender email uses `noreply@` because these are transactional auth emails, not marketing — there is no unsubscribe link, and recipients should not reply to these messages. Point support inquiries at the footer's `support@annisaasekolahku.com` link instead.

## Sync procedure

Run **once per environment** (staging optional; prod = required during Cycle B Phase 2 ops). Repeat any time a template here changes.

For each of the 5 files:

1. Open the `.html` file locally and copy the entire contents (including `<!DOCTYPE html>`).
2. In the Supabase dashboard, navigate to **Authentication → Email Templates → \<slot\>** (per mapping above).
3. Paste the HTML into the **Message body** field. Supabase replaces `{{ .ConfirmationURL }}` and `{{ .Email }}` at send time — leave those placeholders intact.
4. Set the **Subject heading** field to the matching Indonesian subject line above.
5. Click **Save**.
6. Smoke test: trigger the corresponding flow once (e.g. invite a test user, request a magic link to your own address) and confirm the rendered email shows the teal `Talib` wordmark, the correct CTA button text, and the Indonesian body copy. Render in at least Gmail web + Outlook web (the two clients most likely to mangle inline-styled emails).

## Cross-check note + style alignment

These 5 templates share the SAME visual shell as `lib/email/templates/salary-slip.ts` (the existing Resend-sent payslip email). Any visual change to one MUST be mirrored in the other so all Talib emails feel like one product. The shell:

- 560px max-width centered table
- Light card (`#FFFFFF`) with 12px corner radius, 1px `#E5E2DE` border
- Header with 3px teal bottom border (`border-bottom:3px solid #5DB4B8`), 48px logo image (`https://talib.annisaasekolahku.com/logo.png`), 20px wordmark "Talib" in `#1A2E2F`, 12px sub-label "by An Nisaa' Sekolahku" in `#57534E`
- Greeting `#1A2E2F` 15px → body paragraph `#57534E` 14px line-height 1.6
- CTA button: teal (`#5DB4B8`) bg, white text, 12px 32px padding, 8px radius, 14px 600-weight
- URL fallback: muted "atau salin tautan" prompt + teal URL line `word-break:break-all`
- Closing: italic-ish dismissal line + Wassalamu'alaikum / Tim Talib
- Footer divider: 1px `#E5E2DE` hr → 11px `#9B9BB0` 3-line block (Dokumen resmi · location · auto-send notice)

| Token | Value |
|---|---|
| Brand teal (CTA + accent) | `#5DB4B8` |
| Heading dark | `#1A2E2F` |
| Body text muted | `#57534E` |
| Page background | `#F7FAFA` |
| Card background | `#FFFFFF` |
| Border / divider | `#E5E2DE` |
| Fine print | `#9B9BB0` |

Font stack: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) — email clients can't load webfonts.

Logo image: `<img src="https://talib.annisaasekolahku.com/logo.png">`. URL is hardcoded since Supabase Auth has no `appUrl` substitution; logo file lives at `public/logo.png` in this repo.

If `design-system.html` updates any token OR `salary-slip.ts` changes its shell, mirror across all 5 files here AND re-paste into Supabase dashboard. The CTA hex appears 4 times per template (CTA bg, wordmark `<h1>` color, URL fallback `<p>` color, header bottom border).

## Voice notes

Indonesian, Bu Sari voice (warm, polite, formal-friendly) per `.claude/standards/voice.md`. Every body opens with the full Islamic greeting `Assalamu'alaikum warahmatullahi wabarakatuh,` and closes with `Wassalamu'alaikum, / Tim Talib`. The closing reassurance line `Jika Anda tidak meminta email ini, abaikan saja — tidak ada perubahan yang akan terjadi.` matches Bu Sari's gentle parent-facing tone (compare voice.md error-table parent column: "Coba lagi sebentar ya."). The wordmark sub-label `by An Nisaa' Sekolahku` echoes the in-app sidebar brand line per the design-system reference.

## What this file is not

- Not a programmatic mailer. Supabase Auth does the substitution + sending — these files are static HTML.
- Not used for the application's own outbound email (`lib/email/**`). Those go through Resend directly with their own React-email templates.
- Not connected to any test runner. Validation is manual paste-and-smoke-test in the dashboard.
