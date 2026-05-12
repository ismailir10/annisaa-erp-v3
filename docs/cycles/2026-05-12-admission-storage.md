# Admission Storage (Pack 2)

## Context

Pack 2 lays the file upload infrastructure for the admission redesign: private Supabase Storage bucket `admission-documents` with deny-anon RLS, a typed SDK wrapper, and a public upload-token API route. Consumed by Pack 3 (Public Daftar) for KTP Ayah / KTP Ibu / Kartu Keluarga uploads.

Spec: [docs/superpowers/specs/2026-05-12-admission-student-domain-design.md](../superpowers/specs/2026-05-12-admission-student-domain-design.md) §2.4 + §2.6.

## Spec

- Bucket private (`public = false`), MIME allowlist (jpeg/png/webp/pdf), 5 MB cap
- Signed upload URLs (300s TTL), signed download URLs (60s TTL)
- Path convention: `tenant/{tenantId}/admission/{admissionId}/{kind}-{uuid}.{ext}`
- File validation via Supabase SDK `.info()` — NEVER HTTP HEAD on user-supplied URLs (SSRF)
- Rate limit on upload-token endpoint: 10 req/min/IP (in-memory; WAF is real gate per spec §2.6)
- Admission status guard: only INQUIRY/VISITED/APPLIED accept new uploads

## Tasks

- [x] Task 1: Migration N+5 — `admission-documents` bucket + deny-anon RLS policy
- [x] Task 2: Service-role Supabase client factory
- [x] Task 3: `lib/supabase/storage.ts` SDK wrapper + path builder + validation + tests
- [x] Task 4: `POST /api/public/admissions/upload-token` route + tests
- [ ] Task 5: Smoke + ship

## Implementation

### Task 1 — Storage bucket migration (2026-05-12)

**File:** `prisma/migrations/20260512000004_create_admission_documents_storage_bucket/migration.sql`

Bucket created idempotently via `INSERT ... ON CONFLICT DO UPDATE`. RLS policy denies anon/authenticated direct access (service role bypasses). Migration applied cleanly via `npx prisma migrate deploy` — all 43 migrations applied (0 pending).

**Verification:** `prisma migrate deploy` output — "Applying migration `20260512000004_create_admission_documents_storage_bucket`" → "All migrations have been successfully applied." psql and SDK verification not available locally (no psql binary; `SUPABASE_SERVICE_ROLE_KEY` is empty in `.env.local`). The migration file is the source of truth; remote staging will apply it via Vercel deploy hook.

### Task 2 — Service-role Supabase client factory (2026-05-12)

**File:** `lib/supabase/service-client.ts`

No existing service-role helper found in `lib/supabase/` or anywhere in `lib/`. Both `@supabase/supabase-js` (^2.102.1) and `server-only` are already present in `package.json` — no new deps needed. Created singleton factory `getServiceClient()` with `persistSession: false` and `autoRefreshToken: false`. `server-only` import enforces build-time rejection from client components.

### Task 3 — Storage SDK wrapper + path builder + validation (2026-05-12)

**Files:**
- `lib/supabase/storage.ts` — SDK wrapper exporting `ADMISSION_FILE_KINDS`, `ALLOWED_EXTENSIONS`, `buildAdmissionFilePath`, `createSignedUploadUrl`, `createSignedDownloadUrl`, `deleteFile`, `validateUploadedFile`
- `lib/supabase/__tests__/storage.test.ts` — 13 vitest cases (12 spec + 1 edge), all passing
- `vitest.config.ts` — added `server-only` alias to `next/dist/compiled/server-only/empty.js` so test environment can import server-only modules without throwing

**Notes:** Real Supabase SDK `info()` returns `FileObjectV2` camelized — `data.contentType` and `data.size` at root (not `data.metadata.mimetype`). Mocks and implementation aligned to real SDK shape. `server-only` not in `node_modules` (not a direct dep); resolved via Next.js bundled copy alias in vitest config. Also fixed `lib/supabase/service-client.ts` to defer env-var checks from module-load time to `getServiceClient()` call time — prevents build failure in demo/SQLite environment where Supabase vars are empty.

### Task 4 — Upload-token API route (2026-05-12)

**Files:**
- `app/api/public/admissions/upload-token/route.ts` — `POST` endpoint: rate-limit (10 req/min/IP), body validation via Zod, admission lookup + status guard (INQUIRY/VISITED/APPLIED only), signed upload URL generation
- `app/api/public/admissions/upload-token/__tests__/route.test.ts` — 6 vitest cases, all passing

**Notes:** `z.enum()` with `readonly` const tuple resolved via spread `[...ADMISSION_FILE_KINDS]`. Route is fully public (no session required) — guarded by rate-limit + admission-status check.

## Verification

- [x] `npm run build && npx vitest run` — 137 test files passed, 0 errors (Task 2 between-task gate)
- [x] `npx vitest run lib/supabase/__tests__/storage.test.ts` — 13/13 passed (Task 3 between-task gate)
- [x] `npm run build` — green after Task 3
- [x] `npx vitest run app/api/public/admissions/upload-token/__tests__/route.test.ts` — 6/6 passed (Task 4 between-task gate)
- [x] `npm run build && npx vitest run` — build green, 1142 tests passed (139 files, 2 skipped) after Task 4
- [ ] End-of-cycle Playwright gate pending (Task 5 remaining)

## Ship Notes

No new env vars (uses existing `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`).
Rollback: drop bucket via `DELETE FROM storage.buckets WHERE id = 'admission-documents'` (cascades to objects).
