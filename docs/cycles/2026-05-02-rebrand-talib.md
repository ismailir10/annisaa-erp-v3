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

## Verification

(filled by /build at end of cycle)

## Ship Notes

(filled by /ship)
