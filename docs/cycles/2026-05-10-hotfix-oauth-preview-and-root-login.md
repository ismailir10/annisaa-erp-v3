# Hotfix — OAuth Preview Fallback + Root-Page Login

## Context

Smoke-test of [#214](https://github.com/ismailir10/annisaa-erp-v3/pull/214) on the staging Vercel preview surfaced two issues:

1. `/auth/callback` returned **HTTP 500** with `Error: resolveCallbackOrigin: NEXT_PUBLIC_SITE_URL env var is required in production.` Each Vercel preview deployment gets a unique `*.vercel.app` host; pinning a single canonical alias via `NEXT_PUBLIC_SITE_URL` is a production contract that does not fit preview-deploy semantics.
2. User asked for the login form to live on `/` (root landing) instead of a dedicated `/login` route. The existing `/` is a v2-rebuild placeholder card with a "v2 in progress" message — wasted real-estate when the user actually wants to sign in.

This hotfix unblocks the smoke-test trajectory.

## Spec

- [x] **AC1 — `resolveCallbackOrigin` falls back to `request.url` origin on Vercel preview when `NEXT_PUBLIC_SITE_URL` is unset.** Production (VERCEL_ENV=production) still throws when unset — preserves the open-redirect guard. The git-branch alias is stable per branch so the PKCE cookie set on the alias matches the callback host.
- [x] **AC2 — Root `/` page embeds the Google sign-in card.** Existing `/login` route redirects to `/` to preserve external bookmarks. `next` query param flows through the redirect so post-login destination still works.
- [x] **AC3 — All gates green.** vitest 1419/1423 ✓ (+2 cases for the preview fallback + operator-override-on-preview), playwright `admission-public` 5/5 ✓, build ✓.

## Tasks

- [x] **T1 — `resolveCallbackOrigin` preview fallback** + 2 new vitest cases for the preview branch + operator-override semantics.
- [x] **T2 — Root `/` page embeds login card** with brief landing copy + WA + `/daftar` link. `/login` becomes a redirect alias.

## Implementation

- T1 — `lib/auth/callback-origin.ts`: when `NEXT_PUBLIC_SITE_URL` unset, branch on `process.env.VERCEL_ENV === "preview"` to return `new URL(request.url).origin`. Production VERCEL_ENV still throws. `lib/auth/__tests__/callback-origin.test.ts`: 2 new cases (preview fallback + operator-override-on-preview); existing throw test stub-bumped with `VERCEL_ENV=production` to fence the new branch.
- T2 — `app/page.tsx`: rewrite from placeholder card to login shell; imports `LoginClient` from `app/login/client.tsx`; accepts `?next=<path>` and runs `safeNextPath` validator (mirrors `app/auth/callback/route.ts`). Footer keeps WA contact + `/daftar` link. `app/login/page.tsx`: replaced with `redirect("/")` shim that forwards `next` query param.

## Verification

- `npm run build` ✓ — `/` is now a dynamic route, `/login` still listed (now a redirect).
- `npx vitest run` 1419/1423 (+2 cases vs pre-hotfix), 0 failed, 4 skipped.
- `npx playwright test e2e/admission-public.spec.ts --project=chromium` 5/5 ✓ — admission flow unaffected.
- Cross-checked design-system.html §1 (typography + spacing) + §6 (auth/landing form shell) — `/` keeps the existing `<Card>` chrome reused from `/login`; only the surrounding header/footer copy is new (Bu Sari tagline + WA contact + /daftar link).

## Ship Notes

- No migrations.
- No env vars required. (NEXT_PUBLIC_SITE_URL stays optional on preview; setting it on production remains the recommended practice — see callback-origin.ts header comment.)
- Smoke-test path after merge:
  1. Visit `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/` — login card renders with "Masuk dengan Google" button.
  2. Click Masuk → Google → callback → `/admin`.
  3. If callback still 500s, the issue is downstream of origin resolution (e.g. seed not run yet → User row missing → callback throws on email lookup). Run `npx prisma db seed` against staging in that case.
- Rollback: revert this PR; `/auth/callback` returns to the production-only contract and `/` returns to the v2-rebuild placeholder.
