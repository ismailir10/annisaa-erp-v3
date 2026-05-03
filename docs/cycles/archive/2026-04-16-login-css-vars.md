# Login Page CSS Variables Patch

## Context
PR #10 (feat/ui-audit) was closed during PR review because it predated the Vercel Analytics
merge and would have regressed `<Analytics />` from layout.tsx. Its CSS variable additions
were the only unique value — cherry-picked here from current staging.

## Spec
- Add `--warning-highlight`, `--login-card-bg`, `--login-primary-hover` to globals.css
- Use `bg-login-card-bg` on the auth card (was `bg-sidebar-accent`)
- Use `hover:bg-login-primary-hover` on the magic-link submit button (was `hover:bg-primary/90`)

## Tasks
- [x] Add CSS variable definitions to globals.css (both semantic alias block and value block)
- [x] Update app/page.tsx to use `bg-login-card-bg` and `hover:bg-login-primary-hover`

## Implementation
- `app/globals.css`: added `--warning-highlight: #F4D03F`, `--login-card-bg: #223838`, `--login-primary-hover: #4A9DA1` with semantic aliases
- `app/page.tsx`: auth card `bg-sidebar-accent` → `bg-login-card-bg`; submit button `hover:bg-primary/90` → `hover:bg-login-primary-hover`

## Verification
- `npm run build` — clean
- `npx vitest run` — 69/69 passed

## Ship Notes
No migrations. No env vars. Frontend-only change.
