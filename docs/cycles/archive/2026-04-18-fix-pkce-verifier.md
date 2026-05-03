# Fix PKCE Code Verifier Not Found — Supabase Google OAuth

## Context

**Problem:** After the three-layer auth fix (PRs #58-60), Google sign-in on both staging and
production still fails with:

```
PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a
different browser or device, or if the storage was cleared.
```

Vercel runtime logs also reveal:
```
base=https://annisaa-erp-v3-858q41m0i-ismails-projects-196d40d3.vercel.app
```

**Root cause:** Two compounding issues:

1. **Per-deployment URL in `x-forwarded-host` (primary)** — On Vercel, `x-forwarded-host` can
   resolve to a per-deployment URL rather than the canonical alias
   (`annisaa-erp-v3.vercel.app`). `resolveCallbackOrigin` naively trusts this header, so the
   callback redirect lands on a different subdomain than the one where the browser stored the
   PKCE code verifier cookie. Browser treats subdomains as different origins → code verifier
   cookie is not sent → `exchangeCodeForSession` can't find it.

2. **Middleware `updateSession` runs for `/auth/callback?code=` (secondary)** — `proxy.ts`
   calls `updateSession(request)` for all `/auth/*` paths, which triggers
   `supabase.auth.getUser()` before the route handler runs. This is unnecessary and risks
   interfering with PKCE state.

**Fix:** Two targeted code changes, no schema/env changes except a one-time Vercel env var.

---

## Spec

### Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | `resolveCallbackOrigin` returns `NEXT_PUBLIC_SITE_URL` when set (highest priority in prod). |
| AC-2 | `resolveCallbackOrigin` falls back to `x-forwarded-host`, then to origin when `NEXT_PUBLIC_SITE_URL` is unset. |
| AC-3 | `proxy.ts` returns `NextResponse.next()` immediately for `/auth/callback?code=*` without calling `updateSession`. |
| AC-4 | All existing tests pass + new tests for AC-1 and AC-3 pass. |
| AC-5 | `npm run build` succeeds. |

### Out of scope

- Any Supabase dashboard or Google Console changes (handled by ops)
- Magic-link auth, demo-mode login
- Other auth providers

### Operator action required (after deploy)

Set in Vercel dashboard → Project Settings → Environment Variables (all environments):
```
NEXT_PUBLIC_SITE_URL=https://annisaa-erp-v3.vercel.app
```

This is the canonical alias URL — the one Supabase and Google OAuth are configured to redirect to.

---

## Tasks

- [x] T1 — In `lib/auth-callback.ts`, add `NEXT_PUBLIC_SITE_URL` as highest-priority origin in
  production; update `app/api/__tests__/auth-callback-origin.test.ts` with coverage.
- [x] T2 — In `proxy.ts`, skip `updateSession` for `/auth/callback?code=` requests.

---

## Implementation

- T1: Add `NEXT_PUBLIC_SITE_URL` priority to `resolveCallbackOrigin` — `lib/auth-callback.ts`, `app/api/__tests__/auth-callback-origin.test.ts` — 1 new test (per-deployment URL mismatch case), 1 renamed test (fallback to x-forwarded-host when env var unset).
- T2: Bypass `updateSession` in middleware for OAuth PKCE callback — `proxy.ts` — early return `NextResponse.next()` when `pathname === "/auth/callback"` and `code` query param present.

---

## Verification

- T1 + T2: `npm run build` — compiled successfully. `npx vitest run` — 13 files, 109 tests passing (109 vs 108 prior; new PKCE-URL-mismatch test added).

---

## Ship Notes

- No DB migrations, no schema changes.
- **Operator action required:** Set `NEXT_PUBLIC_SITE_URL=https://annisaa-erp-v3.vercel.app`
  in Vercel dashboard (all environments) before or immediately after deploy.
- Rollback: revert the two commits — auth behaviour reverts to pre-fix state (still broken).
- Without setting `NEXT_PUBLIC_SITE_URL`, the fix falls back to `x-forwarded-host` (previous
  behaviour). The middleware bypass (T2) still applies regardless of the env var.
- README.md: no change needed (no new module/route/CRUD changes).
