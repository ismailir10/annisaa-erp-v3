# Admission Storage (Pack 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the file upload infrastructure for the admission redesign — a private Supabase Storage bucket `admission-documents` with RLS policies, a typed SDK wrapper exposing `createSignedUploadUrl` / `createSignedDownloadUrl` / `deleteFile` / `validateUploadedFile`, and a public-facing upload-token API route that the daftar form (Pack 3) will call to upload KTP Ayah, KTP Ibu, and Kartu Keluarga files.

**Architecture:** Bucket created via SQL migration with `public = false` plus RLS policies that block direct anonymous reads/writes. The Next.js server creates short-lived signed upload URLs (300s TTL) and signed download URLs (60s TTL) using a service-role Supabase client. The upload route gates by IP rate-limit + admission status (must be a real admission that's still in INQUIRY/VISITED/APPLIED so files can attach). File validation never performs HTTP HEAD on user-supplied URLs (SSRF risk); it uses the Supabase Storage SDK's `.info()` call on the canonical path. Path convention: `tenant/{tenantId}/admission/{admissionId}/{kind}-{uuid}.{ext}` where `kind ∈ id-card-ayah | id-card-ibu | id-card-wali | family-card`.

**Tech Stack:** Supabase Storage (`@supabase/supabase-js` service-role client), Next.js 16 App Router, Prisma 7.6 (for admission lookup), Vitest, zod for body validation.

**Spec:** [docs/superpowers/specs/2026-05-12-admission-student-domain-design.md](../specs/2026-05-12-admission-student-domain-design.md) §2.4 (file storage) and §2.6 (rate limiting caveat).

**Depends on:** Pack 1 (Foundation) merged — needs `Admission`, `AdmissionApplication`, `AdmissionGuardian` schema in place.

---

## File Structure

**Create:**

- `prisma/migrations/<ts>_create_admission_documents_storage_bucket/migration.sql` — N+5, creates Supabase Storage bucket + RLS policies (PostgreSQL SQL targeting `storage.*` tables).
- `lib/supabase/storage.ts` — typed wrapper exposing `createSignedUploadUrl(path, expires)`, `createSignedDownloadUrl(path, expires)`, `deleteFile(path)`, `validateUploadedFile(path)`. Owns the MIME allowlist, size cap, and the path-builder utility `buildAdmissionFilePath(tenantId, admissionId, kind, ext)`.
- `lib/supabase/__tests__/storage.test.ts` — vitest unit suite mocking the Supabase service-role client.
- `lib/supabase/service-client.ts` (NEW if missing — verify in C1) — service-role Supabase client factory. Must NEVER be imported into client components. Used only by API route handlers.
- `app/api/public/admissions/upload-token/route.ts` — POST endpoint that returns a signed upload URL keyed by `admissionId` + `kind`. Rate-limited by IP. Validates admission exists and status ∈ {INQUIRY, VISITED, APPLIED}.
- `app/api/public/admissions/upload-token/__tests__/route.test.ts` — vitest route handler suite.

**Modify:**

- `prisma/seed.ts` — no schema impact, but seed should not insert anything that violates the bucket invariant (bucket exists or not). If the seed currently checks bucket existence via Storage API, ensure idempotent re-run.
- `.env.example` (if exists; create if not) — document `SUPABASE_SERVICE_ROLE_KEY` already present in prod, just surface it in docs.
- `docs/cycles/<date>-admission-storage.md` — Pack 2 cycle doc (created at start of /build).

**Delete:** none.

---

## Task 1: Create Supabase Storage bucket migration

**Files:**
- Create: `prisma/migrations/<ts>_create_admission_documents_storage_bucket/migration.sql`

- [ ] **Step 1.1: Generate empty migration scaffold**

Run: `npx prisma migrate dev --name create_admission_documents_storage_bucket --create-only`

If `migrate dev` fails on shadow DB (known repo issue — Pack 1 hit this), create the directory manually at `prisma/migrations/20260512000004_create_admission_documents_storage_bucket/` and write `migration.sql` directly.

- [ ] **Step 1.2: Write the storage SQL**

Replace the migration file contents with:

```sql
-- Pack 2: Supabase Storage bucket for admission document uploads
-- (KTP Ayah, KTP Ibu, Kartu Keluarga). Private bucket — no anonymous reads.
-- Bucket is referenced by app code via path convention
-- `tenant/{tenantId}/admission/{admissionId}/{kind}-{uuid}.{ext}`.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'admission-documents',
  'admission-documents',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[],
  5242880  -- 5 MB
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

-- RLS: deny direct anon access — uploads + downloads go through signed URLs only.
-- The service role bypasses RLS, so server-side code (lib/supabase/storage.ts) can read/write.
DROP POLICY IF EXISTS "admission_documents_block_anon" ON storage.objects;
CREATE POLICY "admission_documents_block_anon" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'admission-documents')
  WITH CHECK (bucket_id <> 'admission-documents');
```

The policy is restrictive by design: any non-service-role user is denied direct interaction with this bucket. All uploads and downloads must go through server-generated signed URLs.

- [ ] **Step 1.3: Apply migration**

Run: `npx prisma migrate deploy`
Expected: applies clean. The `ON CONFLICT DO UPDATE` makes it idempotent.

If the local Supabase instance does not have `storage` schema or `storage.buckets` table (i.e. Supabase Storage not wired locally), this migration will fail. In that case, check whether the project uses managed Supabase (Storage available remotely) or self-hosted Postgres without Storage. The Pack 1 cycle doc confirms `lib/supabase/{client,server,middleware}.ts` use Supabase Auth — Storage availability is implied. If unavailable, escalate.

- [ ] **Step 1.4: Verify**

Run: `psql "$DATABASE_URL" -c "SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'admission-documents';"`
Expected: one row, `public = false`, `file_size_limit = 5242880`.

If psql unavailable, write a one-shot tsx script using `@supabase/supabase-js` admin client to call `.storage.getBucket('admission-documents')` and assert `{ public: false, file_size_limit: 5242880 }`. Delete the script after verification.

- [ ] **Step 1.5: Update cycle doc**

Create `docs/cycles/2026-05-12-admission-storage.md` with Context, Spec, Tasks, Implementation sections. Add a Task 1 entry citing the migration filename and verification result.

- [ ] **Step 1.6: Commit**

```bash
git add prisma/migrations/ docs/cycles/
git commit -m "feat(storage): admission-documents bucket + RLS deny-anon policy"
```

If pre-commit hook rejects `feat:` for `lib/**` change (none here — this is purely SQL + docs), commit proceeds.

---

## Task 2: Service-role Supabase client factory

**Files:**
- Verify or Create: `lib/supabase/service-client.ts`

- [ ] **Step 2.1: Check for existing service-role helper**

Run: `grep -rln "service_role\|SERVICE_ROLE_KEY\|createServiceClient\|serviceClient" lib/supabase 2>/dev/null`

If a service-role client factory already exists, **read it** and skip to Task 3. The rest of Pack 2 imports from that file.

If not present, proceed to Step 2.2.

- [ ] **Step 2.2: Write the factory**

Create `lib/supabase/service-client.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS — used only for trusted
 * server-side operations (signed URLs, RLS-skipping queries).
 *
 * NEVER import from client components. Guard by `import "server-only"`.
 */
import "server-only";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

let _client: ReturnType<typeof createClient> | null = null;

export function getServiceClient() {
  if (!_client) {
    _client = createClient(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
```

`server-only` ensures Next.js fails the build if this module ever gets imported into a client component.

- [ ] **Step 2.3: Build**

Run: `npm run build`
Expected: succeeds. If `@supabase/supabase-js` isn't a direct dependency (it's installed transitively as `@supabase/ssr`'s peer dep), add it:

```bash
npm install --save @supabase/supabase-js
```

Confirm `package.json` `dependencies` lists `@supabase/supabase-js`.

- [ ] **Step 2.4: Commit**

If a service client already existed (Step 2.1 returned a match), no commit. Otherwise:

```bash
git add lib/supabase/service-client.ts package.json package-lock.json
git commit -m "feat(supabase): service-role client factory"
```

---

## Task 3: Storage wrapper module (TDD)

**Files:**
- Create: `lib/supabase/storage.ts`
- Create: `lib/supabase/__tests__/storage.test.ts`

- [ ] **Step 3.1: Write failing test**

Create `lib/supabase/__tests__/storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../service-client", () => {
  const upload = vi.fn();
  const createSignedUploadUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const info = vi.fn();
  return {
    getServiceClient: () => ({
      storage: {
        from: vi.fn(() => ({
          upload,
          createSignedUploadUrl,
          createSignedUrl,
          remove,
          info,
        })),
      },
    }),
    __mocks: { upload, createSignedUploadUrl, createSignedUrl, remove, info },
  };
});

import * as storage from "../storage";
import * as svc from "../service-client";

const m = (svc as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
});

describe("buildAdmissionFilePath", () => {
  it("composes the canonical bucket path", () => {
    const p = storage.buildAdmissionFilePath("tnt1", "adm1", "id-card-ayah", "jpg", "fixed-uuid");
    expect(p).toBe("tenant/tnt1/admission/adm1/id-card-ayah-fixed-uuid.jpg");
  });

  it("rejects unknown kind", () => {
    expect(() =>
      storage.buildAdmissionFilePath("t", "a", "passport" as unknown as storage.AdmissionFileKind, "jpg"),
    ).toThrow(/kind/i);
  });

  it("rejects unsafe characters in tenant or admission id", () => {
    expect(() => storage.buildAdmissionFilePath("t/../etc", "a", "family-card", "jpg")).toThrow();
    expect(() => storage.buildAdmissionFilePath("t", "a..b", "family-card", "jpg")).toThrow();
  });

  it("rejects unsupported extensions", () => {
    expect(() => storage.buildAdmissionFilePath("t", "a", "family-card", "exe")).toThrow(/extension/i);
  });
});

describe("createSignedUploadUrl", () => {
  it("returns the signed url + path", async () => {
    m.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://x.supabase.co/sign/up", token: "tk", path: "tenant/tnt1/admission/adm1/family-card-x.pdf" },
      error: null,
    });
    const r = await storage.createSignedUploadUrl("tenant/tnt1/admission/adm1/family-card-x.pdf");
    expect(r.signedUrl).toBe("https://x.supabase.co/sign/up");
    expect(r.path).toBe("tenant/tnt1/admission/adm1/family-card-x.pdf");
    expect(m.createSignedUploadUrl).toHaveBeenCalledWith(
      "tenant/tnt1/admission/adm1/family-card-x.pdf",
      { upsert: false },
    );
  });

  it("throws on supabase error", async () => {
    m.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(storage.createSignedUploadUrl("p")).rejects.toThrow(/boom/);
  });
});

describe("createSignedDownloadUrl", () => {
  it("delegates with explicit TTL", async () => {
    m.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/dl" }, error: null });
    const r = await storage.createSignedDownloadUrl("p", 60);
    expect(r.signedUrl).toBe("https://x/dl");
    expect(m.createSignedUrl).toHaveBeenCalledWith("p", 60);
  });
});

describe("validateUploadedFile", () => {
  it("returns true when info() succeeds with allowlist MIME and size", async () => {
    m.info.mockResolvedValue({
      data: { metadata: { mimetype: "image/jpeg", size: 1024 } },
      error: null,
    });
    const r = await storage.validateUploadedFile("tenant/tnt1/admission/adm1/family-card-x.jpg");
    expect(r).toEqual({ ok: true, mimetype: "image/jpeg", size: 1024 });
  });

  it("returns ok=false when MIME outside allowlist", async () => {
    m.info.mockResolvedValue({
      data: { metadata: { mimetype: "image/heic", size: 1024 } },
      error: null,
    });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mime/i);
  });

  it("returns ok=false when size > 5MB", async () => {
    m.info.mockResolvedValue({
      data: { metadata: { mimetype: "image/jpeg", size: 5_242_881 } },
      error: null,
    });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/size|5\s*mb/i);
  });

  it("returns ok=false when info errors (file missing)", async () => {
    m.info.mockResolvedValue({ data: null, error: { message: "not found" } });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not found|missing/i);
  });
});

describe("deleteFile", () => {
  it("calls remove with single path array", async () => {
    m.remove.mockResolvedValue({ data: [{ name: "p" }], error: null });
    await storage.deleteFile("p");
    expect(m.remove).toHaveBeenCalledWith(["p"]);
  });

  it("throws on supabase error", async () => {
    m.remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(storage.deleteFile("p")).rejects.toThrow(/denied/);
  });
});
```

- [ ] **Step 3.2: Run test, see fail**

Run: `npx vitest run lib/supabase/__tests__/storage.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3.3: Implement storage.ts**

Create `lib/supabase/storage.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./service-client";

const BUCKET = "admission-documents";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const ADMISSION_FILE_KINDS = [
  "id-card-ayah",
  "id-card-ibu",
  "id-card-wali",
  "family-card",
] as const;
export type AdmissionFileKind = (typeof ADMISSION_FILE_KINDS)[number];

export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"] as const;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function safeIdSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: must match [A-Za-z0-9_-]+`);
  }
  return value;
}

export function buildAdmissionFilePath(
  tenantId: string,
  admissionId: string,
  kind: AdmissionFileKind,
  ext: string,
  uuid?: string,
): string {
  if (!ADMISSION_FILE_KINDS.includes(kind)) {
    throw new Error(`Invalid kind: ${kind}`);
  }
  const e = ext.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(e as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error(`Invalid extension: ${ext}`);
  }
  const t = safeIdSegment(tenantId, "tenantId");
  const a = safeIdSegment(admissionId, "admissionId");
  const id = uuid ?? randomUUID();
  return `tenant/${t}/admission/${a}/${kind}-${id}.${e}`;
}

export async function createSignedUploadUrl(path: string) {
  const { data, error } = await getServiceClient()
    .storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error(error?.message ?? "createSignedUploadUrl failed");
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

export async function createSignedDownloadUrl(path: string, expiresInSeconds = 60) {
  const { data, error } = await getServiceClient()
    .storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "createSignedUrl failed");
  return { signedUrl: data.signedUrl };
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await getServiceClient()
    .storage
    .from(BUCKET)
    .remove([path]);
  if (error) throw new Error(error.message);
}

type ValidationResult =
  | { ok: true; mimetype: string; size: number }
  | { ok: false; reason: string };

export async function validateUploadedFile(path: string): Promise<ValidationResult> {
  const { data, error } = await getServiceClient()
    .storage
    .from(BUCKET)
    .info(path);
  if (error || !data) {
    return { ok: false, reason: `File not found or inaccessible: ${error?.message ?? "no data"}` };
  }
  const mimetype = (data.metadata?.mimetype as string | undefined) ?? "";
  const size = (data.metadata?.size as number | undefined) ?? 0;
  if (!ALLOWED_MIME.has(mimetype)) {
    return { ok: false, reason: `MIME ${mimetype} not in allowlist` };
  }
  if (size > MAX_BYTES) {
    return { ok: false, reason: `Size ${size} exceeds 5 MB cap` };
  }
  return { ok: true, mimetype, size };
}
```

- [ ] **Step 3.4: Run test, see pass**

Run: `npx vitest run lib/supabase/__tests__/storage.test.ts`
Expected: PASS, 12 cases.

If a test fails because the Supabase SDK shape differs from the mock (e.g. `.info()` returns `{ data: { mimetype, size } }` directly without `.metadata`), adapt the implementation — the SDK is the source of truth; check `node_modules/@supabase/storage-js/dist/main/Storage*.d.ts` for the actual shape. The contract tested is: `validateUploadedFile(path) → { ok, mimetype, size } | { ok: false, reason }`.

- [ ] **Step 3.5: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3.6: Commit**

```bash
git add lib/supabase/storage.ts lib/supabase/__tests__/
git commit -m "feat(storage): admission-documents SDK wrapper + path builder + validation"
```

---

## Task 4: Upload-token API route (TDD)

**Files:**
- Create: `app/api/public/admissions/upload-token/route.ts`
- Create: `app/api/public/admissions/upload-token/__tests__/route.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `app/api/public/admissions/upload-token/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mocks
vi.mock("@/lib/db", () => ({
  prisma: {
    admission: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase/storage", () => ({
  buildAdmissionFilePath: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { POST } from "../route";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/supabase/storage";
import * as rl from "@/lib/rate-limit";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/public/admissions/upload-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (rl.rateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ success: true, remaining: 99 });
});

describe("POST /api/public/admissions/upload-token", () => {
  it("rejects malformed body with 400", async () => {
    const res = await POST(makeReq({ admissionId: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects when rate limit exceeded with 429", async () => {
    (rl.rateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ success: false, remaining: 0 });
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(429);
  });

  it("rejects when admission does not exist with 404", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(404);
  });

  it("rejects when admission status is terminal with 409", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "adm1",
      tenantId: "tnt1",
      status: "REGISTERED",
    });
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(409);
  });

  it("returns signed url on success", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "adm1",
      tenantId: "tnt1",
      status: "VISITED",
    });
    (storage.buildAdmissionFilePath as ReturnType<typeof vi.fn>).mockReturnValue(
      "tenant/tnt1/admission/adm1/family-card-uuid.pdf",
    );
    (storage.createSignedUploadUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      signedUrl: "https://x.supabase.co/sign/up",
      token: "tk",
      path: "tenant/tnt1/admission/adm1/family-card-uuid.pdf",
    });

    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signedUrl).toBe("https://x.supabase.co/sign/up");
    expect(json.path).toMatch(/tenant\/tnt1\/admission\/adm1\/family-card-/);
  });

  it("rejects unknown file kind with 400", async () => {
    const res = await POST(makeReq({ admissionId: "adm1", kind: "passport", ext: "pdf" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4.2: Run test, see fail**

Run: `npx vitest run app/api/public/admissions/upload-token/__tests__/route.test.ts`
Expected: FAIL (route missing).

- [ ] **Step 4.3: Implement route**

Create `app/api/public/admissions/upload-token/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  buildAdmissionFilePath,
  createSignedUploadUrl,
  ADMISSION_FILE_KINDS,
  ALLOWED_EXTENSIONS,
} from "@/lib/supabase/storage";

const BodySchema = z.object({
  admissionId: z.string().min(1),
  kind: z.enum(ADMISSION_FILE_KINDS),
  ext: z.enum(ALLOWED_EXTENSIONS),
});

// Statuses where file uploads are still meaningful (pre-PAID).
const ALLOWED_STATUSES = new Set(["INQUIRY", "VISITED", "APPLIED"]);

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (in-memory, best-effort — WAF is primary defense per spec §2.6)
  const ip = getClientIp(req);
  const rl = rateLimit(`upload-token:${ip}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  // 2. Parse + validate body
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Permintaan tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { admissionId, kind, ext } = parsed.data;

  // 3. Look up admission (server validates ownership + status)
  const admission = await prisma.admission.findUnique({
    where: { id: admissionId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!admission) {
    return NextResponse.json({ error: "Pendaftaran tidak ditemukan" }, { status: 404 });
  }
  if (!ALLOWED_STATUSES.has(admission.status)) {
    return NextResponse.json(
      { error: `Status ${admission.status} tidak menerima upload baru` },
      { status: 409 },
    );
  }

  // 4. Build canonical path + signed upload URL
  const path = buildAdmissionFilePath(admission.tenantId, admission.id, kind, ext);
  const upload = await createSignedUploadUrl(path);

  return NextResponse.json({
    signedUrl: upload.signedUrl,
    token: upload.token,
    path: upload.path,
  });
}
```

- [ ] **Step 4.4: Run test, see pass**

Run: `npx vitest run app/api/public/admissions/upload-token/__tests__/route.test.ts`
Expected: PASS, 6 cases.

If the test fails because zod's `.enum()` complains about non-tuple inputs, ensure `ADMISSION_FILE_KINDS` is exported `as const` (it is in Task 3's implementation). Same for `ALLOWED_EXTENSIONS`.

- [ ] **Step 4.5: Build + full suite**

```bash
npm run build && npx vitest run
```
Expected: build green, full suite green (1123 + 18 new = 1141 tests).

- [ ] **Step 4.6: Update cycle doc**

Append a Task 4 entry to `docs/cycles/2026-05-12-admission-storage.md` citing the new route + test coverage.

- [ ] **Step 4.7: Commit**

```bash
git add app/api/public/admissions/upload-token/ docs/cycles/
git commit -m "feat(admission): public upload-token endpoint with signed URL"
```

---

## Task 5: Pack 2 smoke + ship

**Files:** none new

- [ ] **Step 5.1: Full gate**

```bash
npm run build && npx vitest run
```
Expected: build green, vitest green.

- [ ] **Step 5.2: End-to-end signed-URL smoke (manual, optional)**

Open a terminal, paste the signed upload URL into a curl:

```bash
curl -s -X POST -d '{"admissionId":"<real-id>","kind":"family-card","ext":"pdf"}' \
  -H 'content-type: application/json' \
  http://localhost:3000/api/public/admissions/upload-token | jq
```

Take the `signedUrl` from the response and PUT a small PDF to it:

```bash
curl -s -X PUT --data-binary @/tmp/sample.pdf \
  -H 'content-type: application/pdf' \
  '<signedUrl>'
```

Then verify via the Supabase dashboard that the file landed at the expected path under the `admission-documents` bucket.

If no local Supabase Storage is wired, skip and rely on CI / staging deployment for end-to-end verification.

- [ ] **Step 5.3: Playwright (optional)**

No new Playwright spec is required — the upload-token endpoint is exercised end-to-end by Pack 3 (Public Daftar) once that ships. For now, the vitest unit suite is the gate.

- [ ] **Step 5.4: Ship**

Branch is `feat/admission-storage` (created from `staging` after Pack 1 merges; or stacked on `feat/admission-foundation` and rebased at merge time).

```bash
git push -u origin feat/admission-storage
gh pr create --base staging --title "Pack 2: Admission storage — bucket + signed-URL upload endpoint" --body "..."
```

CTO watches CI; merges manually when 3 checks green.

---

## Out of scope for this plan (covered by subsequent plans)

- **P3: Public Daftar** — `/(public)/daftar` page + RegistrationForm + submit API. Consumes Pack 2's upload-token endpoint.
- **P4: Admin Detail** — admin/admissions/[id] 4-phase page + transition endpoints + Xendit webhook branch.
- **P5: Convert** — convert preview + commit + dedup review UI.
- **P6: Portal Invite** — Supabase magic link + WA + email + sibling notification.

---

## Self-Review

- [x] **Spec coverage:** Pack 2 covers spec §2.4 (file storage), §2.6 (rate limit caveat), and the signed-URL contract referenced by §5 (public form).
- [x] **Placeholder scan:** No TBDs. Step 5.4 PR body is intentionally `"..."` because the implementer composes the body from the cycle doc at ship time.
- [x] **Type consistency:** `AdmissionFileKind`, `ALLOWED_EXTENSIONS`, `buildAdmissionFilePath` are defined in Task 3 and consumed unchanged in Task 4.
- [x] **SDK shape verification:** Task 3 Step 3.4 explicitly tells the implementer to verify the Supabase SDK return shapes against the mock and adapt — the SDK is the source of truth.
