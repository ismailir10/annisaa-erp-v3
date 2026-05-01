# Design System Iframe X-Frame-Options Fix

## Context

`/admin/design-system` rendered the page header and action buttons but the iframe area was blank. The page is a thin shell that embeds `/admin/design-system-reference.html` (the canonical Claude Design export served from `public/admin/`) via `<iframe>`.

The static HTML loaded fine when navigated to directly, so it wasn't a 404 or auth issue. Root cause was in `next.config.ts`:

```ts
{ key: "X-Frame-Options", value: "DENY" },
```

`X-Frame-Options: DENY` blocks **all** framing, including same-origin. The iframe in `app/admin/design-system/page.tsx` is same-origin (both the parent doc and the iframe src live at `annisaa-erp-v3.vercel.app`), but the browser still refuses to render it.

The matching CSP directive `frame-ancestors 'none'` carries the same semantics, but it's emitted under `Content-Security-Policy-Report-Only`, so it would have only logged a violation, not blocked the frame. The blocker is `X-Frame-Options: DENY`.

## Spec

- `/admin/design-system` must render its embedded reference iframe.
- External origins must still be blocked from framing the app — clickjacking surface unchanged.
- No new domains added to CSP allowlists. No script execution change.

## Tasks

1. In `next.config.ts`, switch `X-Frame-Options: DENY` → `X-Frame-Options: SAMEORIGIN`.
2. Align the CSP directive: `frame-ancestors 'none'` → `frame-ancestors 'self'`.

## Implementation

- **`next.config.ts`** — two single-line value changes plus inline comments documenting why same-origin framing is required.

## Verification

- `npm run build` — green Next 16 build.
- `npx vitest run` — 96 files / 826 tests pass, 0 failures, 0 errors.
- Browser repro on staging captured the symptom — the iframe rendered as a blank white box because the browser refuses to attach a frame to a `DENY` document.
- After merge: load `/admin/design-system` on staging → iframe should render the full design-system reference with all sections (Brand, Colors, Typography, …, Page Recipes) and the floating "Tweaks" panel.
- External clickjacking surface: unchanged. `SAMEORIGIN` plus `frame-ancestors 'self'` still rejects every cross-origin attempt.

## Ship Notes

- No migrations.
- No env vars.
- No dependencies.
- Rollback: revert the two header value changes. Cosmetic only — no data, no API behavior touched.
- Cross-checked `.claude/standards/design-system.html` — no visual or token change; this fix only restores the rendering of the existing reference, it does not modify it.
