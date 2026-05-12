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
- [ ] Task 3: `lib/supabase/storage.ts` SDK wrapper + path builder + validation + tests
- [ ] Task 4: `POST /api/public/admissions/upload-token` route + tests
- [ ] Task 5: Smoke + ship

## Implementation

### Task 1 — Storage bucket migration (2026-05-12)

**File:** `prisma/migrations/20260512000004_create_admission_documents_storage_bucket/migration.sql`

Bucket created idempotently via `INSERT ... ON CONFLICT DO UPDATE`. RLS policy denies anon/authenticated direct access (service role bypasses). Migration applied cleanly via `npx prisma migrate deploy` — all 43 migrations applied (0 pending).

**Verification:** `prisma migrate deploy` output — "Applying migration `20260512000004_create_admission_documents_storage_bucket`" → "All migrations have been successfully applied." psql and SDK verification not available locally (no psql binary; `SUPABASE_SERVICE_ROLE_KEY` is empty in `.env.local`). The migration file is the source of truth; remote staging will apply it via Vercel deploy hook.

### Task 2 — Service-role Supabase client factory (2026-05-12)

**File:** `lib/supabase/service-client.ts`

No existing service-role helper found in `lib/supabase/` or anywhere in `lib/`. Both `@supabase/supabase-js` (^2.102.1) and `server-only` are already present in `package.json` — no new deps needed. Created singleton factory `getServiceClient()` with `persistSession: false` and `autoRefreshToken: false`. `server-only` import enforces build-time rejection from client components.

## Verification

- [ ] `npm run build && npx vitest run` (between-task gate — run after Task 2 commit)
- [ ] End-of-cycle Playwright gate pending (Tasks 3–5 remaining)

## Ship Notes

No new env vars (uses existing `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`).
Rollback: drop bucket via `DELETE FROM storage.buckets WHERE id = 'admission-documents'` (cascades to objects).
