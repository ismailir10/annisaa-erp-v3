# Rebrand → Talib

## Context

Talib production launch initiative — Cycle A (rebrand). Driven by [umbrella spec](../superpowers/specs/2026-05-02-talib-production-launch-design.md). Production URL `talib.annisaasekolahku.com` already wired to Vercel `main` and currently exposes school-erp branding on the login screen — this cycle eliminates that exposure window.

Cross-checked design-system.html §typography + §brand for wordmark voice.

## Spec

User-visible product surface flips to "Talib by An Nisaa' Sekolahku":

- Browser tab `<title>`, OG image, favicon, manifest reflect Talib
- Admin sidebar header shows An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label
- Parent + teacher portal header shows "Talib" brand label
- Login screen (`/`) shows Talib wordmark + tagline + new footer with Terms / Privacy links
- Salary slip emails carry Talib branding in header + footer; `RESEND_FROM_EMAIL` updated to "Talib by An Nisaa'"
- New `/legal/terms` and `/legal/privacy` pages render Indonesian PDP boilerplate
- README.md heading + introduction renamed; CLAUDE.md branch-protection Pro stale-fact fixed
- `package.json` `name` field stays `school-erp` (engineering identifier, never user-visible)

Acceptance: end-of-cycle gate (build + vitest + playwright) green; manual smoke on staging confirms all four surfaces (admin, parent, teacher, login) show new branding; OG validator returns updated card; test invoice email lands in Gmail with Talib sender.

## Tasks

(See `docs/superpowers/plans/2026-05-02-rebrand-talib.md` for atomic task breakdown.)

1. Talib wordmark component
2. Root layout metadata + OG + manifest
3. Shell rebrand (admin sidebar + portal header)
4. Login screen rebrand + tagline + legal footer hook
5. Email templates rebrand
6. Legal pages (Terms + Privacy)
7. Docs sync (README + CLAUDE.md)
8. End-of-cycle gate + Verification

## Implementation

- **Task 1** — `components/brand/talib-wordmark.tsx` + 4 unit tests in `components/brand/__tests__/`. Reusable size variants (sm/md/lg) with optional `showSublabel`. Inherits brand typography from `--font-sans` (Plus Jakarta Sans).
- **Task 2** — Root `app/layout.tsx` metadata: title template "%s · Talib", `metadataBase` set to prod URL, applicationName "Talib", `openGraph` + `twitter` cards, `robots: { index: false, follow: false }` (soft-launch, no SEO), `viewport.themeColor = "#0F172A"`. Created `app/manifest.ts` (Next.js Metadata API → `/manifest.webmanifest`). Created edge-runtime `app/opengraph-image.tsx` (1200×630, slate background, white wordmark) → `/opengraph-image`. README heading + intro renamed (folded in to satisfy doc-sync narrow rule for `feat:` + `app/**`).
- **Task 3** — `components/admin/sidebar.tsx` brand block replaced with `<TalibWordmark size="md" showSublabel />`. `components/portal/portal-header.tsx` `brandLabel` default flipped from `"An Nisaa'"` to `"Talib"`. Updated `portal-header.test.tsx` assertion. Added `e2e/branding.spec.ts` with 3 specs (admin sidebar, teacher header, parent header).
- **Task 4** — Login screen (`app/page.tsx`) rebrand: replaced "An Nisaa' Sekolahku" h1 + "Sistem Kehadiran & Penggajian" subtitle with `<TalibWordmark size="lg" />` (white text override for dark login bg) + Bu Sari tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." Footer "Powered by An Nisaa' ERP" → "Talib by An Nisaa' Sekolahku". Added 4th Playwright spec for login screen wordmark + tagline.
- **Task 5** — `lib/email/templates/salary-slip.ts`: header h1 "An Nisaa' Sekolahku" → "Talib" + sub "by An Nisaa' Sekolahku" (school description retained as `Pendidikan Anak Usia Dini Islam Terpadu` removed; replaced with sub-label). Footer signature appends "Dikirim otomatis oleh Talib · talib.annisaasekolahku.com". Added `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` to `.env.example` (Resend DKIM verified for `annisaasekolahku.com` per CTO confirmation 2026-05-02). 8/8 email unit tests pass.
- **Task 6** — Created `app/legal/terms/page.tsx` + `app/legal/privacy/page.tsx` (Indonesian PDP boilerplate per UU 27/2022, lists controllers + 3rd-party processors + UU PDP rights, both `robots: noindex`). Created `components/layout/legal-footer.tsx` and wired it into login screen below auth card. Added 5th Playwright spec verifying both legal links from login → page renders.
- **Task 7** — `CLAUDE.md`: heading retitled "Talib (engineering id: `school-erp`) — Operating Manual"; branch-protection block rewritten to reflect that GitHub branch protection is free for private repos since Feb 2023 (no Pro upgrade needed; enabling moves to Cycle B). `app/admin/design-system/page.tsx` iframe title swept "An Nisaa' ERP Design System reference" → "Talib Design System reference". `package.json` `name` field intentionally retained as `school-erp` (engineering identifier, never user-visible).

## Verification

(filled by /build at end of cycle)

## Ship Notes

(filled by /ship)
