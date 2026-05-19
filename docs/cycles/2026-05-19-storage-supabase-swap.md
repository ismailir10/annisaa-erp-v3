# Storage Backend — Local Disk → Supabase Storage

## Context

PR #294 (kesiswaan CRUD audit, merged 2026-05-19) shipped a local-disk storage adapter at [lib/storage/index.ts](lib/storage/index.ts) writing to `${UPLOAD_DIR ?? <cwd>/.data/uploads}/<entity>/<id>/<field>-<hash>.<ext>`. Vercel serverless filesystems are read-only outside `/tmp`, and `/tmp` does not persist across lambda invocations — so `POST /api/students/[id]/photo`, `POST /api/parents/[id]/ktp`, and `POST /api/parents/[id]/kk` fail in production. Vercel runtime logs (last 2d): 2× `POST /api/students/<id>/photo → 500 Error: ENOENT: no such file…`. The kesiswaan ship notes acknowledged this at the time: *"Upload POST returns 500 on Vercel — known cycle Assumption 4 constraint (UPLOAD_DIR must point at object-store on serverless; production-hardening follow-up cycle). Partial coverage accepted per user decision."* This cycle is that follow-up. Intended outcome: every `lib/storage/*` upload + read + delete works in Vercel production against Supabase Storage's `attachments` bucket (private, service-role gated), with the public adapter API unchanged so the three route files + their consumers need zero changes beyond test mocks. KTP/KK reads stay auth-proxied through `requireAdmin` — Supabase Storage's signed-URL TTL is not a substitute for our authz gate (UU PDP 27/2022).

**Production DB state (verified):**
- Prod (`vxwywmvpxetdgnxejjgk`): `Student.photoUrl` 0 non-null. `Parent.ktpUrl`/`kkUrl` columns **do not exist yet** — `20260518000000_parent_ktp_kk_urls` lands on next staging→main promote.
- Staging (`udbivhchbizpxoryejgz`): `Student.photoUrl` 0 non-null. 2 stale `Parent` rows hold `local:v1:parents/<id>/(ktp|kk)-6eaa8fef371aa2f6.jpg` tokens from preview-verify iterations — files don't exist on Vercel; nulled out as part of this cycle.

## Spec

### Acceptance criteria

- [ ] Supabase Storage bucket `attachments` exists on staging (`udbivhchbizpxoryejgz`) and prod (`vxwywmvpxetdgnxejjgk`) with `public=false` (service-role only) and a 5 MB per-object cap.
- [ ] `lib/storage/index.ts` `saveFile` / `streamFile` / `deleteFile` route through Supabase Storage. Token format becomes `supabase:v1:<entity>/<entityId>/<field>-<hash>.<ext>` (bucket name implicit from `STORAGE_SUPABASE_BUCKET` env). Public function signatures unchanged — `app/api/students/[id]/photo/route.ts` and `lib/storage/parent-document.ts` recompile without source changes.
- [ ] Path-traversal defenses preserved: `assertSafeSegment` still rejects `..`, slashes, null bytes; the `realpath` symlink guard becomes a no-op since the new backend has no filesystem realpath, but the segment regex stays as the first line of defense.
- [ ] Legacy `local:v1:` tokens (4 staging rows) NULLed via one-off SQL in Ship Notes. `streamFile` on a `local:v1:` token throws → route returns 404 (graceful degrade for any stragglers).
- [ ] `npm run build && npx vitest run` green. Storage unit tests mock `@supabase/supabase-js` and assert: upload writes to the expected path, download returns the stored bytes, delete removes the object, token traversal attempts still rejected.
- [ ] E2E `admin-student-photo-upload.spec.ts`: admin uploads a JPG ≤ 2 MB to a seeded student → page reload → `<img>` of `/api/students/<id>/photo` renders 200 (not the empty-state placeholder).
- [ ] No regression on `e2e/admin-guardian-document-upload.spec.ts` — KTP + KK upload flow still passes.
- [ ] Preview-verify (`/ship` Step 3) walks the student-photo + guardian-KTP/KK upload surfaces against a Supabase-backed preview deploy and converges with zero blockers.

### Non-goals

- Signed-URL public reads. KTP/KK stay strictly admin-only via the auth-proxy route — signed URLs would bypass our authz gate.
- CDN / image optimization for student photos. Photos are admin-only artifacts; transforms via `next/image` are a later optimization.
- Per-tenant bucket isolation. One shared `attachments` bucket with `<entity>/<entityId>/…` paths; tenant scoping stays at the DB row level (the API route checks `tenantId` before resolving a token). A future cycle can add `<tenantId>/<entity>/…` if cross-tenant blast radius needs hardening.
- AV scanning, EXIF stripping, image re-encoding. Magic-byte check + MIME whitelist + 2 MB / 5 MB caps stay as the only validation surface.
- Backfill of any local-disk tokens to Supabase — verified zero real data in prod and only stale test rows in staging.
- Local dev fallback to disk when Supabase env vars are missing. The adapter fails fast with a clear error; developers set the env vars or accept upload not working locally. (Demo-mode E2E run in CI has the vars.)
- Removal of the `.data/` `.gitignore` entry. Harmless to keep; future local tooling may reuse the directory.

### Assumptions

1. **Bucket creation via SQL is permitted.** Supabase's `storage.buckets` table accepts `INSERT` from the service role; `apply_migration` via MCP works against both staging and prod project IDs above. If MCP can't reach prod (cost gate, paused project), bucket creation falls back to a manual dashboard step recorded in Ship Notes.
2. **`@supabase/supabase-js` v2.105.4 (already a dep) supports `storage.from(bucket).upload/.download/.remove`** — verified in package.json. No new dependency.
3. **Service-role key is available in every runtime that touches storage.** Confirmed: `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local` and in Vercel env (used by RLS bypass paths in existing code). The same key gates Supabase Storage's service-role-only access.
4. **Bucket name `attachments` is unclaimed** in both projects. If a previous cycle reserved the name, the migration is `INSERT … ON CONFLICT DO NOTHING` — idempotent.
5. **`Cache-Control: private, no-store` stays on every read.** Supabase Storage may set its own cache headers on download; the API route overrides with our security headers (existing behavior — the storage adapter returns a stream + mime, the route owns the response headers).
6. **No new env vars beyond `STORAGE_SUPABASE_BUCKET`.** Default to `attachments` if unset (production safety: explicit value still wins). Documented in Ship Notes.
7. **The local-disk read path (`fs.realpath`, `createReadStream`) is fully retired.** Removing it removes the symlink-escape attack surface entirely. The `local:v1:` token prefix support stays only in `resolveTokenPath` long enough to surface as a clean 404 from `streamFile` (one branch, two lines); a follow-up cycle can drop it once no rows reference it.
8. **Preview deploys target the staging Supabase project**, so previewing the new adapter exercises the real Supabase Storage path (not a mock). `vercel-build.sh` already wires staging env vars on feat/* preview builds.

## Tasks

> Independence legend: **(I)** = independent, can run in parallel; **(→Tx)** = depends on Tx.

- [ ] **T1 — Provision Supabase Storage `attachments` bucket on staging + prod** *(I)*
      Apply a migration via `mcp__supabase__apply_migration` to BOTH project IDs (staging `udbivhchbizpxoryejgz`, prod `vxwywmvpxetdgnxejjgk`) that inserts the bucket row idempotently:
      ```sql
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'attachments',
        'attachments',
        false,
        5242880, -- 5 MB
        ARRAY['image/jpeg','image/png','application/pdf']
      )
      ON CONFLICT (id) DO NOTHING;
      ```
      No RLS policy is needed — buckets without `storage.objects` policies allow only the service role, which is what our server code uses. Record both apply outputs in Ship Notes.
      *Acceptance:* `SELECT id, public, file_size_limit FROM storage.buckets WHERE id='attachments'` returns one row on each project with `public=false`, `file_size_limit=5242880`.

- [ ] **T2 — Add `lib/storage/supabase.ts` — service-role client + primitives** *(I)*
      New file. Exports:
      - `getSupabaseStorageClient()` — singleton-cached `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`. Throws clear `Error("Supabase service-role storage not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")` if either env var missing.
      - `uploadObject({ path, bytes, mimeType })` → `Promise<void>`. Uses `.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })`. `upsert: true` mirrors the local adapter's hash-deterministic overwrite semantics.
      - `downloadObject(path)` → `Promise<{ bytes: Buffer; mimeType: string }>`. Uses `.storage.from(BUCKET).download(path)` → reads the returned `Blob` to `Buffer`. Throws on missing object (Supabase returns `{ data: null, error: { message: 'Object not found' } }` — re-throw as `Error("ENOENT")` so the route's existing 404 branch fires).
      - `removeObject(path)` → `Promise<void>`. Uses `.storage.from(BUCKET).remove([path])`. ENOENT-equivalent failures swallowed (matches `deleteFile` best-effort semantics).
      - `getBucketName()` → reads `process.env.STORAGE_SUPABASE_BUCKET ?? 'attachments'`. Centralizing keeps every call to `.storage.from(...)` consistent.
      Keep this file thin — every Supabase-SDK call lives here so the swap in T3 is one direction of imports. No business logic.
      *Acceptance:* `lib/storage/__tests__/supabase.test.ts` (new) covers each export with a mocked `@supabase/supabase-js` client (`vi.mock`). Mock asserts `.upload` is called with `upsert: true` + correct `contentType`. Vitest passes.

- [ ] **T3 — Swap `lib/storage/index.ts` internals to Supabase backend** *(→T2)*
      Modify only `saveFile`, `streamFile`, `deleteFile`, and helpers — public signatures unchanged. Inside:
      - `TOKEN_PREFIX` changes to `supabase:v1:` for new writes.
      - `saveFile`: compute path = `${entity}/${entityId}/${field}-${hash}.${ext}` (no leading slash). Call `uploadObject({ path, bytes, mimeType })`. Return `{ token: \`supabase:v1:${path}\` }`.
      - `resolveTokenPath` becomes `parseToken(token)` returning `{ backend: 'supabase' | 'local'; path: string; ext: string; filename: string }`. Validation regex + `..` / `\\` / `\0` rejection unchanged. New: dispatch on prefix.
      - `streamFile`: parse. If `backend === 'local'` → `throw new Error('Legacy local-disk token — file unavailable')` (route catches → 404). If `backend === 'supabase'` → `downloadObject(path)` → return `ReadableStream` constructed from the Buffer + mime from extension. Same return shape as today.
      - `deleteFile`: parse. If `backend === 'local'` → return silently (matches "nothing to delete" semantics for invalid tokens). If `backend === 'supabase'` → `removeObject(path)`.
      - Remove `getBaseDir`, `fs.mkdir`, `fs.writeFile`, `fs.stat`, `fs.realpath`, `createReadStream`. Delete the `path` + `fs` imports.
      - Keep `assertSafeSegment`, `ALLOWED_EXTS`, `SAFE_SEGMENT`, `EXT_TO_MIME`, `hashBytes` — all still load-bearing.
      - Update the file-level doc comment (lines 1–32) to describe the Supabase backend + the one-line legacy-token degrade path.
      *Acceptance:* `app/api/students/[id]/photo/route.ts` and `lib/storage/parent-document.ts` compile + pass typecheck with zero source changes. New token format observed via the upload route response. Legacy `local:v1:` tokens still parse without crashing (return path normally, only `streamFile`/`deleteFile` branch on backend).

- [ ] **T4 — Update `lib/storage/__tests__/storage.test.ts` for new backend** *(→T3)*
      Replace the local-disk fixtures (`fs.mkdtemp`, `UPLOAD_DIR=`) with mocked Supabase client (`vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ storage: { from: vi.fn(() => mockStorageBucket) } }) }) }))`).
      Preserve these test bodies (rewritten against the mock):
      - `saveFile + token` shape — assert returned token matches `supabase:v1:students/<id>/photo-<hash>.jpg`.
      - `streamFile` round-trips bytes — mock `download` returns the saved bytes.
      - `deleteFile` is best-effort — mock `remove` rejects with `Object not found`, `deleteFile` resolves.
      - Path-traversal token (`supabase:v1:../etc/passwd`) → `streamFile` throws before touching Supabase.
      - Empty segment / null byte / backslash all still rejected at parse.
      Add new tests:
      - Legacy `local:v1:foo/bar/baz-deadbeef.jpg` token → `streamFile` throws `Legacy local-disk token`.
      - Legacy token + `deleteFile` → resolves silently.
      - `saveFile` propagates Supabase upload errors (mock rejects → `saveFile` rejects with same error).
      *Acceptance:* `npx vitest run lib/storage` green. Mock asserts: `upload` called with `upsert: true`, correct `contentType`, path with no leading slash + no `..` segment.

- [ ] **T5 — Update existing API-route tests that exercise storage** *(→T3)*
      Three test files touch the adapter indirectly:
      - `app/api/students/[id]/photo/__tests__/route.test.ts`
      - `app/api/parents/[id]/ktp/__tests__/route.test.ts`
      - `lib/storage/__tests__/storage.test.ts` (covered by T4)
      For the two route tests: keep the auth + validation assertions intact (those exercise route logic, not adapter). The only changes needed are wherever the test currently passes `UPLOAD_DIR=<tmp>` or asserts a `local:v1:` token in the DB write — swap to mocking `lib/storage` directly via `vi.mock('@/lib/storage', ...)` so route tests stop caring about the backend. The adapter-level coverage moves entirely to T4.
      *Acceptance:* `npx vitest run app/api/students/[id]/photo app/api/parents/[id]/ktp lib/storage` green. No test imports `fs/promises` or `os.tmpdir()` from the storage paths.

- [ ] **T6 — E2E spec `admin-student-photo-upload.spec.ts`** *(→T3, T1)*
      New spec under `e2e/`. Demo-mode admin login → seed/find any active student → navigate to `/admin/students/[id]` → upload a small JPG via the photo input → wait for toast → reload → assert the `<img>` inside the Data Anak card resolves (`/api/students/<id>/photo` returns 200 + non-zero content). Use a tiny baked-in JPEG buffer (`Buffer.from([0xff,0xd8,...])`) so the test doesn't depend on a fixture file.
      Tag with `@admin` so the suite picks it up.
      *Acceptance:* `npx playwright test e2e/admin-student-photo-upload.spec.ts` passes locally against `npm run start` with staging env vars. End-of-cycle Playwright gate stays green.

- [ ] **T7 — Add ADR row to README + design-system Verification token** *(→T3)*
      One-line ADR addition to README.md's active ADR table: *"2026-05-19 — Storage adapter swapped from local disk to Supabase Storage (`attachments` bucket, service-role only). Local-disk path unavailable on Vercel serverless."* No standards file edit needed — this is infrastructure, not visual. Frontend-gate (Rule 4) does not trigger this cycle (no `app/**/*.{tsx,css}` or `components/**/*.tsx` diffs). README + cycle doc cover doc-sync.
      *Acceptance:* `git diff` shows README.md ADR table updated with one row. `pre-commit` doc-sync gate green.

- [ ] **T8 — Ship Notes one-off: NULL stale `local:v1:` tokens in staging** *(→T3, in Ship Notes)*
      Not a code task — a Ship Notes-recorded SQL applied via Supabase MCP against staging only:
      ```sql
      UPDATE "Parent"
      SET "ktpUrl" = NULL, "kkUrl" = NULL
      WHERE ("ktpUrl" LIKE 'local:v1:%') OR ("kkUrl" LIKE 'local:v1:%');
      ```
      Prod has no `Parent.ktpUrl`/`kkUrl` columns yet (migration ships on next staging→main promote) and zero `Student.photoUrl` rows → no prod cleanup needed.
      *Acceptance:* Post-run `SELECT COUNT(*) FROM "Parent" WHERE "ktpUrl" LIKE 'local:v1:%' OR "kkUrl" LIKE 'local:v1:%'` returns 0 on staging. Recorded in Ship Notes with timestamp.

## Implementation

- **T1 — Bucket provisioning** *(2026-05-19)*
  Applied migration `storage_attachments_bucket` to both Supabase projects via MCP `apply_migration`:
  - Staging (`udbivhchbizpxoryejgz`) — `{success:true}`.
  - Prod (`vxwywmvpxetdgnxejjgk`) — `{success:true}`.
  Post-apply verified via `SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='attachments'`: both projects return `public=false`, `file_size_limit=5242880`, `allowed_mime_types=[image/jpeg,image/png,application/pdf]`. No source diffs.
- **T2 — `lib/storage/supabase.ts`**
  New file with 4 exports: `getSupabaseStorageClient` (singleton, fail-fast on missing env), `getBucketName` (env-overridable, defaults `attachments`), `uploadObject` (upsert=true), `downloadObject` (throws `ENOENT` on miss), `removeObject` (swallows "not found"). Test-only `__testHelpers.resetCache` exported for `vi.mock` re-entry. Companion `lib/storage/__tests__/supabase.test.ts` covers all four primitives + env-var failures + caching via `vi.hoisted` to dodge mock-factory hoisting. 15/15 vitest pass.
- **T3 — Swap `lib/storage/index.ts` backend** *(2026-05-19)*
  Rewrite of the adapter internals while preserving the public API. `saveFile` writes via `uploadObject` (Supabase `upsert=true`); `streamFile` calls `downloadObject` and wraps the buffer in a single-chunk `ReadableStream`; `deleteFile` calls `removeObject`. Token prefix moves to `supabase:v1:`. Legacy `local:v1:` tokens parse cleanly but `streamFile` throws `Legacy local-disk token` (caught → 404) and `deleteFile` no-ops. All filesystem imports (`fs`, `path`, `createReadStream`) removed alongside `getBaseDir` / `realpath` symlink defense — the latter no longer applies because Supabase Storage has no symlinks. Path-traversal regex + ext whitelist preserved as the first line of defense. `__internal.parseToken` replaces `__internal.resolveTokenPath`. No source changes in `app/api/students/[id]/photo/route.ts` or `lib/storage/parent-document.ts` (consumer-route contract unchanged).
- **T4 — Storage unit tests rewritten** *(2026-05-19)*
  `lib/storage/__tests__/storage.test.ts` mocks `../supabase` via `vi.hoisted` with an in-memory `Map` bucket so round-trip semantics stay exercised (same bytes ↔ same path ↔ same token). New cases: legacy `local:v1:` token degrade (3 cases — stream throws, delete no-ops, traversal still rejected), `saveFile` propagates upload errors. Traversal regex tested with 10 attack payloads. Vitest 25/25 pass in `lib/storage/`.
- **T5 — Route tests pinned against `@/lib/storage` mock** *(2026-05-19)*
  `app/api/students/[id]/photo/__tests__/route.test.ts` + `app/api/parents/[id]/ktp/__tests__/route.test.ts` swap `process.env.UPLOAD_DIR=tmpdir` setup for an in-test `Map`-backed mock of `saveFile` / `streamFile` / `deleteFile`. Drops `fs`/`path`/`os` imports + tmpdir teardown. Token regexes updated `local:v1:` → `supabase:v1:`. Adapter coverage stays in T4 — route tests now assert only route logic. All route tests pass without `SUPABASE_SERVICE_ROLE_KEY` set (the env-var fail-fast in `lib/storage/supabase.ts` is bypassed by the mock).
- **T6 — E2E spec `e2e/admin-student-photo-upload.spec.ts`** *(2026-05-19)*
  New spec follows the `admin-guardian-document-upload.spec.ts` pattern: demo-mode admin login, seed a fresh student, navigate to `/admin/students/[id]`, upload a 1-KB synthetic JPEG via the hidden file input, await the POST response, reload, assert (a) the `<img src="/api/students/[id]/photo*">` renders, (b) the auth-proxied GET returns 200 with `image/jpeg` + `private, no-store`, (c) the first 3 bytes round-trip as `FF D8 FF`. Token-format assertion guards against accidental revert to local disk. Cleanup deletes the photo + marks the student INACTIVE.
- **T7 — README ADR row** *(2026-05-19)*
  One row prepended to README.md's active ADR table documenting the storage swap, legacy-token handling, and the auth-proxy invariant for KTP/KK reads (UU PDP 27/2022). Cycle link points back at this doc.
- **T8 — Staging stale-token cleanup** *(2026-05-19)*
  One-off `UPDATE` applied against staging (`udbivhchbizpxoryejgz`) via Supabase MCP: 2 Parent rows had `local:v1:` tokens for `ktpUrl` + `kkUrl` from PR #294 preview-verify iterations. Set both columns to `NULL`; `RETURNING` confirmed both rows now `null` for both columns. Prod required no action — `ktpUrl`/`kkUrl` columns don't exist yet (migration ships on next staging→main promote), `Student.photoUrl` is 0 non-null rows.

## Verification

**Between-task gate** *(after T2)* — `npm run build && npx vitest run` both green.
**Between-task gate** *(after T5)* — `npm run build && npx vitest run` both green: build clean, vitest 190 files / 1891 tests pass / 42 todo / 2 skipped. First full-suite run after T5 had a transient flake on `components/portal/__tests__/page-header.test.tsx` ("Tagihan" heading lookup); re-run was clean — pre-existing JSDOM cross-test pollution, file untouched in this cycle.

**Design-system gate** — frontend-gate (pre-commit Rule 4) does not trigger this cycle. No `app/**/*.{tsx,css}`, `components/**/*.tsx`, or `tailwind.config.*` diffs. `design-system` mentioned here as documentation of the gate skip.

**End-of-cycle gate** — `npm run build && npx vitest run && npx playwright test` *(2026-05-19/20)*:
- Build: green.
- Vitest: 190 files / 1891 tests pass / 42 todo / 2 skipped.
- Playwright: 119 passed / 12 skipped / 2 flaky / 1 unrelated fail.
  - **Skipped (+2 new)**: `admin-student-photo-upload.spec.ts` and `admin-guardian-document-upload.spec.ts` self-skip when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are absent. Local `.env.local` ships those vars empty; CI `.github/workflows/ci.yml` also does not wire them. Coverage moves to **preview-verify** (Step 3 of `/ship`) which inherits staging Supabase env from Vercel's preview build pipeline. Documented in Assumption 6 + 8.
  - **Flaky × 2** (auto-retried, ended passing): `admin.spec.ts:35` employee detail salary tab, `sibling-detect.spec.ts:66` /daftar UX — both pre-existing, file untouched in this cycle.
  - **Fail × 1**: `admin.spec.ts:435` admin tagihan bulk — same pre-existing demo-DB pollution recorded in prior cycles (e.g. [2026-05-19-penilaian-c7a-void-schema.md](./2026-05-19-penilaian-c7a-void-schema.md), [2026-05-19-kelas-page.md](./2026-05-19-kelas-page.md)). Unrelated to storage; explicit user-authorized continuation pattern carried forward.

Real integration verification lands in `/ship` Step 3 preview-verify against the feat/* preview deploy.

## Ship Notes

**Migrations**
- T1 `storage_attachments_bucket` migration applied to both Supabase projects via MCP `apply_migration`:
  - Staging `udbivhchbizpxoryejgz` ✓
  - Prod `vxwywmvpxetdgnxejjgk` ✓
  - Idempotent (`ON CONFLICT (id) DO NOTHING`) — safe to re-run.
- No Prisma schema migrations in this cycle.

**Env vars**
- `STORAGE_SUPABASE_BUCKET` (optional, defaults to `attachments`). Set in Vercel only if the bucket name diverges from the default. **No change needed for current deploys.**
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` already wired across production + preview environments — same keys this repo uses elsewhere for RLS-bypass paths.
- `UPLOAD_DIR` is now unused — can be removed from Vercel env in a follow-up housekeeping pass; no harm if left.

**One-off SQL (already applied, 2026-05-19)**
```sql
-- Staging only — prod had no rows to clean (migration not yet applied + zero Student photos).
UPDATE "Parent"
SET "ktpUrl" = NULL, "kkUrl" = NULL
WHERE ("ktpUrl" LIKE 'local:v1:%') OR ("kkUrl" LIKE 'local:v1:%');
-- 2 rows affected; RETURNING confirmed both nulled.
```

**Manual steps**
- None.

**Rollback plan**
- Revert this PR. The bucket row stays (idempotent, harmless). Legacy `local:v1:` tokens still 500 on Vercel; rollback restores the pre-existing broken state — not a regression. If a downstream consumer relied on the bucket existing (none today), bucket removal is `DELETE FROM storage.buckets WHERE id='attachments'` after confirming `storage.objects` for the bucket is empty.
