# Cache student photos and the admin header to cut Supabase load

## Context

The owner wants to stay on the Supabase free plan (5 GB uncached egress a month, a small connection pool). A read-only audit of Supabase usage (2026-09-30, reported in chat) found two caching gaps; the owner approved "the caching part" and asked to leave journal history as is.

- **Student photos.** `GET /api/students/[id]/photo` returned `Cache-Control: private, no-store`. Every render re-downloaded the full object (up to 2 MB) from Supabase Storage through the app. The admin student list (`app/admin/students/page.tsx`) shows about 20 per page view.
- **Admin header.** `app/admin/layout.tsx` ran two uncached queries (active campuses and academic years) on every admin navigation, for rows that change a few times a year.

## Spec

- [x] Photo GET sends an `ETag` derived from the stored object path, which is content-hashed, so a new upload gets a new ETag. It also sends `Cache-Control: private, no-cache`.
  - A matching `If-None-Match` answers 304 with no body and no Storage download.
  - Authorisation still runs first on every request, so revoked access is never served from cache and a 304 is never leaked. `private` keeps shared caches out.
- [x] The admin header reads campus and year names through `unstable_cache`: keyed by tenant, 5-minute TTL backstop, tag `admin-header-context`.
  - Every campus and academic-year write invalidates the tag: `config/campuses` POST, PUT and DELETE; `academic-years` POST, PUT and DELETE (including activation, which runs inside those routes); and the dev-only seed route. The header is therefore never stale after an edit.
- [x] Tests fail before the change and pass after.

Non-goals: resizing photos at upload, the other audit items (connection cap, log retention, invoice polling, MCP config), and journal history (the owner's decision).

## Tasks

- [x] 1. Photo ETag/304 revalidation.
- [x] 2. Cached admin header context with write-side invalidation.

## Implementation

- Subagent plan: the audit was one Sonnet subagent (read-only). Implementation was inline, no fan-out: two small, coupled edits, verified by the driver.
- Task 1: `app/api/students/[id]/photo/route.ts` computes the ETag and the conditional 304 after the auth checks. Tests in `app/api/students/[id]/photo/__tests__/route.test.ts`: 304 with no body and no `streamFile` call; a stale ETag serves 200; a teacher sending a matching ETag still gets 403. Headers on the 200 are asserted.
- Task 2:
  - `lib/admin/header-context.ts`: the cached reader. `lib/admin/header-context-tag.ts`: the tag and `invalidateAdminHeaderContext`, split out so routes don't import `unstable_cache`.
  - `app/admin/layout.tsx` uses the reader.
  - Invalidation added in `app/api/config/campuses/route.ts`, `app/api/config/campuses/[id]/route.ts`, `app/api/academic-years/route.ts`, `app/api/academic-years/[id]/route.ts` and `app/api/admin/seed/route.ts`.
  - Tests: `lib/admin/__tests__/header-context.test.ts`, plus invalidation assertions in `app/api/__tests__/campus-soft-delete.test.ts`.

## Verification

- Red before the fix: with the photo route stashed, 2 of 18 photo tests fail (no ETag, no 304). After: 18/18. Header-context tests: 3/3. Campus route tests: 6/6.
- Local, source SHA base cefa932 plus this diff. Demo production build, `next start` on port 3055, disposable Postgres `schoolerp_sc` (db push + seed), localhost-only `school-erp-session` fixture cookies:
  - The admin header shows "Semua kampus (2)".
  - A campus deactivated through the app shows in the header immediately ("Taman Aster"), and its reactivation too.
  - A campus deactivated directly in the database still shows the cached "Semua kampus (2)", proving the cache is hit.
  - Photo with a matching `If-None-Match`, as admin: `304 bytes=0`, `cache-control: private, no-cache` plus `etag`.
  - The same request as teacher: 403. With no session: 401.
  - `/admin/students`: 200.
  - A full photo download cannot run locally (Storage is Supabase-only; the unconditional GET 404s without it). It is covered by the route tests.
- Checked against design-system.html: no visual change. The layout diff only changes where the header strings come from.
- Gates on base cefa932 plus this diff: `npm run build` exit 0; `npx vitest run` → `Tests  4374 passed | 42 todo (4416)`; eslint on touched files clean; audit-docs 0 fail.
- Playwright: full suite run locally before the PR (result below); CI `Playwright E2E` gates the merge.

## Ship Notes

- No migrations, no env vars.
- Browsers keep student photos and revalidate them. Repeat views cost one small authorised request and no Storage egress.
- Rollback: revert the PR.
