# Chore — Log admin-admissions 400 rejection bodies

> **Branch:** `feat/admin-admissions-log-rejections` (off `origin/staging` @ `e25749e` — post-PR-#240 squash).
> **Parent cycle:** [`2026-05-10-daftar-public-form.md`](2026-05-10-daftar-public-form.md) (Phase 1.1). This is a follow-up `chore:` micro-cycle, not a new feature.

---

## Context

After Phase 1.1 (PR #240) merged and staging redeployed, user reported a validation error while editing an admission row through `/admin/admissions`. Vercel runtime logs ([`get_runtime_logs`](https://vercel.com/) MCP) showed 3× `PUT /api/admissions/cmp0u4noj…` → 400 between 06:52:34–44 UTC, but the **response body was not captured** — Vercel default runtime logs the HTTP envelope only.

Result: the 400 cause (`Validation failed` issues array OR `Invalid status transition from X to Y`) was not diagnosable without browser DevTools. For an operator hitting a 400 in production, that's an unhelpful loop — they have to reproduce + open DevTools just to see which field failed.

This micro-cycle adds `console.error` lines on every 400 rejection path in the three `/api/admissions` routes so future failures surface the actual reason in Vercel runtime logs.

## Scope

Three files, log-only diff (no behavior change):

- **`app/api/admissions/[id]/route.ts`** (PUT) — log Zod `parsed.error.issues` on validation failure; log `from=… to=…` on invalid status transition.
- **`app/api/admissions/route.ts`** (POST) — refactor away from the central `validateBody` helper (which encodes the 400 envelope but swallows the issue array from the caller); use `safeParse` directly so `parsed.error.issues` can be logged + still returned to the client in `{ errors: [{ field, message }] }` shape (matches `validateBody`'s response shape for client compatibility).
- **`app/api/admissions/[id]/convert/route.ts`** (POST) — log already-converted + wrong-status rejection paths.

Log prefix style matches Phase 1.1 (`[admission-submit]` → `[admin-admissions PUT]` / `POST` / `CONVERT`).

## What does NOT change

- `lib/api/validate.ts` (central helper) — intentionally untouched. Adding a log line there would fire on every 400 across the whole admin surface, not just admissions. If we want global logging later, that's a separate cross-cutting cycle.
- Zod schemas in `lib/validations/admission.ts` — unchanged.
- Status machine in `VALID_TRANSITIONS` — unchanged.
- Admin UI in `app/admin/admissions/page.tsx` — unchanged.
- Response shapes — unchanged (client-visible payloads identical).

## Verification

```
$ npm run build
✓ build green

$ npx vitest run
Test Files  134 passed | 2 skipped (136)
     Tests  1124 passed | 42 todo (1166)
  Duration  43.46s
```

Playwright skipped — diff is log-only (server `console.error` lines), no client-observable behavior shift, no template / route shape change. Local gate (build + vitest) sufficient for a log-only diff.

## Ship Notes

- No migration.
- No env vars.
- Rollback: revert merge commit. Removes the three `console.error` lines + restores `validateBody` import in POST. Zero data effect.
- After merge + staging redeploy, replay the failing admin action; Vercel runtime logs will now show `[admin-admissions PUT] validation failed id=… [...]` or `[admin-admissions PUT] invalid transition id=… from=… to=…` alongside the existing 400 metadata line.
- Carry-over caveats from Phase 1.1: GitHub Actions billing failure still red on CI; local gates canonical. Admin-tagihan flake set (`e2e/admin.spec.ts:473/524/575/628`) still pre-existing — unrelated to this diff.
