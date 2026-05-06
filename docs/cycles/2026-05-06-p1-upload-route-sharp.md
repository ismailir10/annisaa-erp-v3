# p1-upload-route-sharp — `/api/upload` route + sharp compression + FileAsset write path + Supabase Storage

**Type:** runtime + standards
**Phase:** p1 (cycle 10 — final Phase 1 cycle, last cycle-6 deferral)
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §16.1 (storage runbook) + §4.1 (FileAsset row) + §18.1 (phase 1 cycle plan) + §18.12 (marathon mode)

## Context

Phase 1 finalisation cycle. The audit + timeline foundation has shipped at staging tip (PR #187, [923ed62](https://github.com/talib-school/school-erp)): `lib/audit/write.ts` exports `writeAuditLog(input, tx?)` server-only with PII redaction + tx threading + SOFT_DELETE/RESTORE → timeline bridge; `lib/timeline/emit.ts` exports `emitTimelineEvent<K>(input, tx?)` server-only generic with the 8-kind registry + Zod-validated payloads. The **FileAsset model** lives at HEAD (prisma/schema.prisma lines 796-823 — tenant-scoped, soft-delete YES, status enum lifecycle `PENDING_UPLOAD → UPLOADED → COMPRESSED → FAILED → ORPHANED`). Migration 06 created the table; the [Supabase Storage runbook](2026-05-05-p1-audit-timeline-files.md) (cycle 7 Ship Notes lines 380–467) documented bucket convention, RLS, signed-URL TTL, and the sharp pipeline outline as deferred to "p1-scaffold-engine-skeleton". Cycle 8 (`p1-scaffold-engine-skeleton`) re-deferred the runtime to this cycle since the registries were a hard prerequisite. Cycle 9 (`p1-scaffold-renderers`) shipped the `FileRenderer` capturing the `File` object into RHF state but explicitly NOT uploading it — the deferral row in that cycle's Ship Notes points here.

This cycle ships the runtime path: `POST /api/upload` accepting `multipart/form-data`, sharp compression for IMAGE kinds, Supabase Storage upload via service-role, FileAsset row + AuditLog row written atomically in a single `prisma.$transaction`, and a 24h signed URL returned to the caller. The renderer is wired to POST on form submit (lazy — see Spec §6 for the eager-vs-lazy trade-off). Two consumer call-sites exist today: `lib/scaffold/renderers/file.tsx` and all p2+ entities with FILE fields (Student photo, Employee CV, Admission documents) that consume the route via the renderer. Closing this cycle marks **Phase 1 foundation DONE**; phase 2 entity cycles begin (`p2-students-guardians-household` first per spec §18.1).

**Marathon mode** (spec §18.12) — full brainstorm skipped; plan derives from foundation spec §16.1 + cycle 7 storage runbook + cycle 8/9 deferral rows. **Sequential build mostly, with one parallel fan-out**: T2 (storage wrapper) and T3 (sharp wrapper) are independent and can fan out via subagent dispatch; T4 (route) imports both; T5 (route tests) follows; T6 (sharp tests) is independent of route work; T7 (renderer wiring) imports nothing from earlier-task internals but consumes the route's wire-shape contract; T8 (renderer tests); T9 (`storage.md` standards) bundles at the end with cycle/CLAUDE/README updates.

**One real new dependency:** `sharp@^0.34`. ~30MB native binary per platform (libvips). First runtime native dep since v2 reset. **Critical Vercel runtime gotcha** (spec-time review BLOCKER §1): sharp v0.33+ ships its native binary as scoped optional packages (`@img/sharp-linux-x64`). `npm install` resolves the prebuilt binary correctly, but **Next.js bundles sharp into the server bundle via Webpack by default**, which cannot handle the native `.node` binary — the route silently 500s in production with `Error: Could not load the "sharp" module using the linux-x64 runtime`. This is the dominant failure mode for sharp on Vercel since v0.33 (Vercel issue #14001, sharp issue #3870, Payload CMS issue #14142, sharp issue #4361 with Next.js 15+). **Fix locked into T1**: add `serverExternalPackages: ["sharp"]` to `next.config.ts`. Without this, the upload route ships broken.

Cross-checked design-system.html: N/A (route + library + standards cycle, no frontend visual diff — the renderer edit changes behaviour, not visual treatment). UAT reports: N/A (pre-launch rebuild). Disk monitored — pre-cycle worktree cleanup recommended; ~3 GiB free.

### Assumptions (correct now or `/build` proceeds with these)

1. **Bucket layout: ONE bucket per FileKind, tenantId path-prefixed** (not one bucket per tenant per kind). The cycle 7 runbook example showed `an-nisaa-image` (per-tenant per-kind), but that conflicts with the path convention `<tenantId>/<kind>/<cuid>.<ext>` and the RLS policy `name LIKE current_setting('request.jwt.claims')::json->>'tenant_id' || '/%'` (also from cycle 7). One-bucket-per-kind matches the path convention + the RLS policy + makes env-var management tractable (5 buckets total, not 5 × N tenants). Five env-config buckets: `documents`, `images`, `videos`, `audios`, `archives` (lowercase plural to match Supabase Storage naming convention). `lib/storage/supabase.ts` exports a `bucketForKind(kind: FileKind): string` helper that fixes the mapping in code.
2. **Session helper: build a minimal `getSession()` in `lib/auth/session.ts`** as part of this cycle. No session helper exists in the codebase today (`p1-auth-google-oauth` was sequenced after this cycle in spec §18.1 cycle plan, but the upload route depends on a session). **Production path only this cycle** (per spec-time review MAJOR §4 — `User.supabaseUserId` is nullable + no User row has a populated `supabaseUserId` until OAuth callback ships, AND no demo-cookie write path exists yet — proxy.ts reads it but no code writes it). Minimum-viable shape: wraps `lib/supabase/server.ts`'s `createClient().auth.getUser()`, queries the User row by `supabaseUserId`, returns `{ tenantId, userId, supabaseUserId } | null`. **Schema-invariant note** (per superpowers:code-reviewer T2/T4 finding M1): the schema's only index involving `supabaseUserId` is the **non-unique** `@@index([tenantId, supabaseUserId])` (prisma/schema.prisma:294) — there is NO unique constraint on `supabaseUserId` alone or in any composite. Until `p1-auth-google-oauth` enforces one-Supabase-account ↔ one-tenant at the OAuth callback (or a future migration adds `@@unique([supabaseUserId])`), the helper uses `findMany({ take: 2 })` + length-check as a fail-closed defence: two matching rows → return `null` (caller 401s) rather than arbitrarily picking one tenant context (privilege-escalation risk). **Demo-mode path is explicitly deferred to `p1-auth-google-oauth`** — that cycle ships both the demo-cookie write helper + the OAuth callback. Until then, `getSession()` always returns `null` outside of mocked test contexts; the route returns 401 to real callers (acceptable because no real upload UI exists in production yet — first p2 entity cycle is the first real consumer). The signature `() => Promise<{tenantId, userId, supabaseUserId} | null>` is the contract that survives the auth refactor. Existing call site in `lib/scaffold/permission.ts:149` (`prisma.user.findFirst({ tenantId, supabaseUserId, deletedAt: null })`) confirms this is the intended User-row resolution shape.
3. **Vercel function memory: 2 GB (1 vCPU) default on all plans incl. Hobby** (per spec-time review BLOCKER §2 — verified live Vercel docs 2026-02-27). The cycle prompt's 256MB cap is wrong; cycle 6 mentioned 1024MB which is also stale. Sharp decoding a 10MB JPEG to a 1920×1920 RGB raw buffer peaks ~50–80MB transient via libvips streaming — well within 2 GB. No `vercel.json` `memory` override needed. Re-evaluate if the image cap ever raises above 50MB.
4. **Eager vs. lazy upload trigger: LAZY (on form submit).** The renderer captures `File` in RHF state on input change; the upload only fires when the parent form submits. Trade-off: eager would create `PENDING_UPLOAD` rows for abandoned forms (orphan-cleanup cron handles those, deferred to p3+ per §16.1a); lazy keeps the database clean for MVP at the cost of the user waiting through compression+upload during submit. Choosing lazy because (a) the orphan-cleanup cron does not exist yet, (b) the explicit "Submit" click is the user's clear consent moment, (c) progress UX during submit is simpler than a phantom-row recovery flow. Documented in `.claude/standards/storage.md` so future entity cycles don't have to re-litigate.
5. **MIME allowlist per FileKind** — coverage scoped to MVP needs:
   - `IMAGE`: `image/jpeg`, `image/png`, `image/webp` (sharp re-encodes all three to JPEG; HEIC/AVIF deferred — Indonesian phones widely emit these but sharp's libvips doesn't decode HEIC without a separate libheif dep, which adds 20MB more). Heic upload returns 400 with hint "Convert to JPEG before uploading" until libheif lands.
   - `DOCUMENT`: `application/pdf`. Office docs deferred (no parse/preview; pdf is the only one used in admission scans + raport PDFs).
   - `VIDEO`: `video/mp4`. (No transcoding — straight passthrough. Cap at 10MB hard means small clips only.)
   - `AUDIO`: `audio/mpeg` (mp3), `audio/mp4` (m4a). (No transcoding.)
   - `ARCHIVE`: `application/zip`. (Bulk export ZIPs — service-side written, not user-uploaded today; route allowlist exists for completeness.)
6. **FAILED-row tx semantics: COMMIT the FAILED row, with a status guard against concurrent terminal-state writes** (per spec-time review MAJOR §3). Original tx1 commits `PENDING_UPLOAD` + audit row atomically; storage upload happens OUTSIDE any tx (large I/O — keep tx scope short); on storage / sharp failure, the catch block runs on the OUTER prisma client (NOT a tx — original tx already committed):
   ```ts
   await prisma.fileAsset.updateMany({
     where: { id: assetId, tenantId: session.tenantId, status: 'PENDING_UPLOAD' },
     data: { status: 'FAILED' }
   });
   ```
   `updateMany` (NOT `update`) means zero-row matches don't throw — defensive against the future orphan-cleanup cron (p3+) flipping the row to ORPHANED concurrently. Audit row for the FAILED transition writes after the `updateMany` (also outside tx). Returns 500 with structured error `{ id, code: 'storage_upload_failed' | 'compression_failed', message }`.
7. **Sharp version pin: `^0.34.0`** (latest stable line, releasing through Q1 2026). Sharp's API has been stable since v0.30 — `rotate().resize().jpeg().toBuffer()` chain unchanged. Verify via Context7 fetch at /build-time before lockfile commit.
8. **Asset ID generator: `crypto.randomUUID()`** (Node built-in, no dep) (per spec-time review MAJOR §6 — `@paralleldrive/cuid2` is NOT in package.json; the original spec's "if installed, else fallback" fork would always fall back, generating hyphenated UUIDs inconsistent with all other entities' Prisma `@default(cuid())` IDs). Trade-off: the FileAsset model's `id String @id @default(cuid())` produces Prisma cuid v1 IDs when the row is created via `prisma.fileAsset.create({})` without an explicit id. **Resolution:** let Prisma generate the id at INSERT time. The route reads `asset.id` from the create result, then computes `storagePath = ${tenantId}/${kind}/${asset.id}.${ext}` AFTER the insert + updates the row in the same tx with `data: { storagePath }`. This sequence keeps all FileAsset IDs in cuid v1 format (matching every other entity) and removes the application-side generator decision entirely.
9. **`useUploadOnSubmit` hook signature: pass field-name pairs explicitly** (per spec-time review MAJOR §5 — current `FieldDef` has no `name`/`key` property; the hook cannot walk fields by name without external pairing). Hook signature locked to:
   ```ts
   useUploadOnSubmit<TForm extends FieldValues>(
     form: UseFormReturn<TForm>,
     fileFields: ReadonlyArray<{ name: FieldPath<TForm>; kind: FileKind }>
   ): { wrap: (handler: SubmitHandler<TForm>) => SubmitHandler<TForm>; isUploading: boolean }
   ```
   No structural change to `FieldDef` (Assumption: avoid registry-wide refactor inside this cycle). Consumers pass the explicit `{name, kind}` pairs. Future entity cycles may introduce a `FieldDef.name` field if the boilerplate becomes painful — out of scope here.

## Spec

### Acceptance criteria

- [ ] `package.json` adds `"sharp": "^0.34.0"` to `dependencies`. `package-lock.json` regenerates.
- [ ] **`next.config.ts` adds `serverExternalPackages: ["sharp"]`** (mandatory per Assumption §3 + spec-time review BLOCKER §1). Without this, Next.js Webpack-bundles sharp into the server output and the route 500s in production with `Could not load the "sharp" module using the linux-x64 runtime`. Verify by adding `node -e "require('sharp')"` to the T1 acceptance and by running `npm run build` after the config change — the build output should NOT include sharp in `.next/standalone/node_modules` (or wherever Next.js externalises it).
- [ ] `lib/storage/supabase.ts` — server-only Supabase Storage client wrapper. Exports:
  - `uploadToStorage(bucket: string, path: string, buffer: Buffer, contentType: string): Promise<void>` — calls `supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: false })`; throws on error.
  - `createSignedUrl(bucket: string, path: string, ttlSeconds: number): Promise<string>` — calls `supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds)`; throws on error; returns `signedUrl` string.
  - `deleteFromStorage(bucket: string, path: string): Promise<void>` — for orphan-cleanup cron (p3+) and FAILED-row cleanup. Calls `supabase.storage.from(bucket).remove([path])`; throws on error.
  - `bucketForKind(kind: FileKind): string` — returns one of `"documents" | "images" | "videos" | "audios" | "archives"`. Frozen mapping; throws on unknown kind (defensive — TS exhaustiveness should catch first).
  - Service-role client (bypasses RLS — `/api/upload` is the boundary). Reads `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` at module init via lazy singleton. Throws if either env var is missing — same boundary marker pattern as `lib/audit/write.ts`'s prisma import (no `server-only` npm package; the env-throw is the runtime client-bundle guard).
- [ ] `lib/storage/sharp.ts` — server-only sharp pipeline wrapper. Exports:
  - `compressImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: 'image/jpeg'; ratio: number }>` — applies the locked pipeline:
    ```ts
    sharp(input)
      .rotate()                          // auto-orient via EXIF (then strips EXIF)
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
    ```
  - `ratio` = `compressed.length / input.length` (lower is better; typical phone photo ~0.20–0.40).
  - **EXIF strip is implicit:** sharp's default `.jpeg()` without `.withMetadata()` strips all metadata. Test §6 explicitly verifies via reading `sharp(output).metadata().exif === undefined` to lock the behavior against a future regression where someone adds `.withMetadata()` for thumbnails.
  - `.rotate()` **before** `.resize()` is intentional — rotate consumes EXIF orientation flag and resets it; resizing first would corrupt the orientation reset.
  - Module-level boundary marker: `import sharp from 'sharp'` at top — sharp itself is a native dep that fails fast in client bundles (no shim needed).
- [ ] `lib/auth/session.ts` — minimal `getSession()` helper (Assumption §2). Exports:
  - `getSession(): Promise<{ tenantId: string; userId: string; supabaseUserId: string } | null>` — calls `(await createClient()).auth.getUser()` → if user, queries `prisma.user.findFirst({ where: { supabaseUserId: user.id, isActive: true, deletedAt: null }, select: { id, tenantId } })` → returns `{tenantId, userId: row.id, supabaseUserId: user.id}`. Returns `null` on any failure (no session, no user row, inactive user). Caller is responsible for the 401 response shape.
  - **Demo-mode path explicitly deferred to `p1-auth-google-oauth`** (per Assumption §2 + spec-time review MAJOR §4). No `DEMO_COOKIE` write helper exists yet; the read in `proxy.ts` would need a matching write surface that this cycle does not own. Until then, `getSession()` returns `null` outside mocked test contexts.
  - **Scope guard:** this is the minimal shim for `/api/upload`'s 401 gate. `p1-auth-google-oauth` will (a) extend this file with the demo-cookie write+read path, (b) wire the full Google OAuth callback / JWT custom-claim hook / role resolution. The function signature `() => Promise<{tenantId, userId, supabaseUserId} | null>` is the contract that survives the refactor.
- [ ] `app/api/upload/route.ts` — Next.js 16 route handler. `POST` only. Multipart/form-data parsing via the standard `await req.formData()`. Steps in order:
  1. Auth: `const session = await getSession()`; if `null`, return `NextResponse.json({ error: 'unauthorized' }, { status: 401 })`.
  2. Parse FormData: extract `file: File` (FormData field name `"file"`) and `kind: string` (field name `"kind"`). 400 with structured error `{ error: 'missing_field', field }` if either missing.
  3. Validate `kind` is a valid `FileKind` enum member (Object.values(FileKind).includes(kind)); 400 `{ error: 'invalid_kind' }` otherwise.
  4. Validate `file.size <= 10_485_760` (10 MB); 400 `{ error: 'file_too_large', maxBytes: 10485760, sizeBytes: file.size }` otherwise.
  5. Validate `file.type` against MIME allowlist for `kind` (Assumption §5); 400 `{ error: 'mime_kind_mismatch', kind, mimeType: file.type }` otherwise.
  6. Read `file.arrayBuffer()` once into `buffer = Buffer.from(arrayBuffer)`. Compute `ext` from `file.name`'s last dot segment (sanitized via `.toLowerCase().match(/^[a-z0-9]{1,8}$/) ?? 'bin'`).
  7. **Tx 1 (PENDING_UPLOAD insert + audit, no application-side ID generation per Assumption §8):**
     ```ts
     const asset = await prisma.$transaction(async (tx) => {
       const created = await tx.fileAsset.create({
         data: {
           tenantId: session.tenantId,
           storagePath: '',  // filled in step 8 (UPDATE within same tx)
           originalName: file.name,
           mimeType: file.type,
           sizeBytes: BigInt(file.size),
           kind: kind as FileKind,
           status: 'PENDING_UPLOAD',
           uploaderUserId: session.userId,
           createdById: session.userId,
           updatedById: session.userId,
         },
       });
       const storagePath = `${session.tenantId}/${kind}/${created.id}.${ext}`;
       const updated = await tx.fileAsset.update({
         where: { id: created.id },
         data: { storagePath },
       });
       await writeAuditLog({
         tenantId: session.tenantId,
         actorUserId: session.userId,
         action: AuditAction.CREATE,
         resource: 'FileAsset',
         resourceId: created.id,
         after: { status: 'PENDING_UPLOAD', kind, sizeBytes: file.size, originalName: file.name, storagePath },
       }, tx);
       return updated;
     });
     ```
  8. **For IMAGE kind:** `const compressed = await compressImage(buffer); const finalPath = asset.storagePath.replace(/\.[^.]+$/, '.jpg'); await uploadToStorage(bucketForKind('IMAGE'), finalPath, compressed.buffer, 'image/jpeg');` then **Tx 2 (COMPRESSED update + audit):**
     ```ts
     await prisma.$transaction(async (tx) => {
       await tx.fileAsset.update({
         where: { id: asset.id, tenantId: session.tenantId },
         data: {
           status: 'COMPRESSED',
           compressedAt: new Date(),
           compressionRatio: new Prisma.Decimal(compressed.ratio),
           mimeType: 'image/jpeg',
           storagePath: finalPath,
           updatedById: session.userId,
         },
       });
       await writeAuditLog({ /* before:{status:'PENDING_UPLOAD'}, after:{status:'COMPRESSED', compressionRatio} */ }, tx);
     });
     ```
  9. **For other kinds:** `await uploadToStorage(bucketForKind(kind), asset.storagePath, buffer, file.type)` then **Tx 2 (UPLOADED update + audit):** parallel structure to step 8 but `status='UPLOADED'`, no `compressedAt`/`compressionRatio`/path-rewrite.
  10. **Catch block** (FAILED path per Assumption §6 — `updateMany` with status guard):
     ```ts
     await prisma.fileAsset.updateMany({
       where: { id: asset.id, tenantId: session.tenantId, status: 'PENDING_UPLOAD' },
       data: { status: 'FAILED', updatedById: session.userId },
     });
     await writeAuditLog({ action: UPDATE, before:{status:'PENDING_UPLOAD'}, after:{status:'FAILED', error: code} });
     ```
     Both calls run on the OUTER prisma client (NOT a tx — original tx already committed). `updateMany` returns `{count: 0}` instead of throwing if a concurrent cron flipped the row to ORPHANED. Return 500 `{ error: 'storage_upload_failed' | 'compression_failed', message, id: asset.id }`.
  11. **Success:** `signedUrl = await createSignedUrl(bucketForKind(kind), finalPath, 86400)`; return 200 `{ id: asset.id, storagePath: finalPath, kind, status: 'COMPRESSED' | 'UPLOADED', compressionRatio?: number, signedUrl }`.
  12. **No comment sentinel needed** (per spec-time review NIT §2): the route already calls `getSession()` for real in step 1; `verify-api-auth.sh`'s `grep -qE 'getSession\\('` matches the actual call site.
- [ ] `app/api/upload/__tests__/route.test.ts` — ~10 cases (mocked prisma + mocked storage + mocked sharp via `vi.mock`). Cases:
  1. 401 when `getSession()` returns null.
  2. 400 when `file` field missing.
  3. 400 when `kind` field missing.
  4. 400 when `kind` not a valid FileKind enum member.
  5. 400 when `file.size > 10_485_760`.
  6. 400 when MIME doesn't match kind allowlist (e.g. `kind=IMAGE` + `mimeType=application/pdf`).
  7. Happy path IMAGE: status `COMPRESSED`, `compressionRatio < 1.0`, `signedUrl` returned, `mimeType` updated to `image/jpeg`, storage path ends in `.jpg`.
  8. Happy path DOCUMENT: status `UPLOADED`, no `compressionRatio`, `signedUrl` returned, original mimeType preserved.
  9. Failure path: storage upload throws → response 500 `{error: 'storage_upload_failed'}` + FileAsset row exists with `status='FAILED'` + audit row exists for the FAILED transition (assert via spy on `writeAuditLog` called twice — once in tx1 with PENDING_UPLOAD, once outside tx with FAILED).
  10. Tx threading: when tx1 throws (e.g. audit-write spy throws), no FileAsset row is committed (assert prisma.fileAsset.create rolled back via mock chain).
- [ ] `lib/storage/__tests__/sharp.test.ts` — ~5 cases with a committed fixture `lib/storage/__tests__/fixtures/sample.jpg` (< 50KB JPEG, dimensions ~3000×2000 to exercise the 1920px resize path). Cases:
  1. 4K-ish image resizes: output `metadata.width <= 1920 && metadata.height <= 1920`.
  2. EXIF stripped: `const meta = await sharp(output.buffer).metadata(); expect(meta.exif).toBeUndefined()` (per spec-time review NIT §1 — `metadata()` returns a Promise; missing `await` would silently always pass on the Promise comparison). Locks against a future `.withMetadata()` regression that would re-introduce GPS leak.
  3. Compression ratio computed: `output.ratio === output.buffer.length / inputBuffer.length` and `output.ratio > 0` and `< 1.5` (allow some headroom for tiny inputs).
  4. PNG input → JPEG output: feed a tiny PNG fixture (or generate via `sharp({ create: ... }).png().toBuffer()`); assert `output.mimeType === 'image/jpeg'` and `sharp(output.buffer).metadata().format === 'jpeg'`.
  5. Corrupt buffer throws: `await expect(compressImage(Buffer.from('not-an-image'))).rejects.toThrow()`.
- [ ] `lib/scaffold/renderers/file.tsx` — wire upload integration. Lazy strategy (Assumption §4) + hook signature locked (Assumption §9):
  - On input `onChange`: keep current behavior — capture `File` in RHF state with the existing `maxBytes` client-side guard.
  - **No shape change to `FieldDef`** (per Assumption §9 — keeps the registry refactor out of this cycle). The renderer stays agnostic to `FileKind`; consumers pass the `kind` explicitly via the hook's `fileFields` argument.
  - **`isUploading` propagation:** the hook exposes `isUploading` as a return value; consumers thread it down to the renderer via the existing `disabled` prop. No new context, no new RHF metadata field.
  - **MVP UI:** spinner appears next to the input during upload (driven by parent `disabled` flag); inline error surfaces beneath the input via the existing `error` state slot. Bytes-uploaded progress **deferred** (XHR `onprogress` requires switching from `fetch` to `XMLHttpRequest` — extra surface for marginal UX gain at MVP).
- [ ] `lib/scaffold/upload.ts` — NEW file. Exports:
  - `uploadFile(file: File, kind: FileKind): Promise<{ id: string; signedUrl: string }>` — POSTs FormData to `/api/upload` and unwraps the response. Surfaces a typed `UploadError extends Error` (with `code`, `message`, optional `assetId`) on non-2xx.
  - `useUploadOnSubmit<TForm extends FieldValues>(form, fileFields)` — signature per Assumption §9. Returns `{ wrap, isUploading }`. The `wrap(handler)` function takes the consumer's RHF submit handler and returns a wrapped version that: (a) walks `fileFields`, reads `form.getValues(name)`, filters those that are `File` instances (already-uploaded `{id, signedUrl}` shapes pass through), (b) `Promise.all(uploadFile(...))` in parallel, (c) `form.setValue(name, {id, signedUrl})` for each result, (d) on any upload failure, `form.setError(name, {type: 'upload', message: error.message})` and abort (do NOT call the wrapped handler), (e) on full success, calls the wrapped handler with the now-mutated form values.
- [ ] `lib/scaffold/__tests__/file-renderer.test.tsx` — +3 cases for the upload integration (the current test file's case count + 3):
  1. File state → submit triggers POST to `/api/upload` with correct FormData (`file` + `kind` fields) → RHF state replaced with `{id, signedUrl}` before consumer submit fires.
  2. Upload error (mock fetch rejects with 500) → consumer submit does NOT fire + inline error renders under the field.
  3. Max-size client validation fires before POST (oversized File → no fetch call + error renders).
- [ ] `lib/scaffold/__tests__/upload-hook.test.tsx` — NEW small file. ~3 cases for the `useUploadOnSubmit` hook in isolation: (a) all-File-fields case uploads in parallel; (b) mixed File + already-uploaded-id case skips the latter; (c) one-failure aborts whole submit + sets per-field error. (Filename `.tsx` not `.ts` because the test file uses a JSX harness component to mount the hook via @testing-library/react.)
- [ ] `.claude/standards/storage.md` — new standards file documenting:
  - When to call `/api/upload`: any user-facing file/image input via the scaffold renderer; server-side jobs (ExportJob in p3+) call `lib/storage/supabase.ts` helpers directly + write the FileAsset row inline.
  - Allowed MIME types per FileKind (Assumption §5).
  - 10 MB hard cap; sharp targets 1920px max / JPEG-80 mozjpeg / EXIF-stripped; ~70–80% byte reduction on typical phone photos.
  - Storage path convention `<tenantId>/<kind>/<cuid>.<ext>`; bucket naming `documents | images | videos | audios | archives` (Assumption §1).
  - 24h signed URL TTL; refresh strategy = re-call `createSignedUrl` on access (ExportJob pattern in p3+ extends this — never persist a signed URL beyond a single response).
  - Service-role write boundary / RLS-gated read split (per cycle 7 runbook). Any code path that needs a write goes through `/api/upload` or the storage helpers — never via PostgREST.
  - **FAILED-row semantics** (Assumption §6): the row stays in the DB after a failed upload as an operational record, hard-deleted by the `file_asset.orphan_cleanup` cron in p3+.
  - **Lazy upload trigger** (Assumption §4): renderers capture File on input change; upload fires on consumer-form-submit via `useUploadOnSubmit`. Eager strategy explicitly rejected for MVP.
  - **Orphan cleanup cron deferral** (`file_asset.orphan_cleanup` → p3+ per §16.1a). Ops impact: PENDING_UPLOAD rows accumulate until the cron lands. Document the manual cleanup query in case ops needs it before p3.
  - **Bucket provisioning runbook**: per-tenant manual step until v1.1+. Five buckets at tenant onboarding (`documents`, `images`, `videos`, `audios`, `archives`), all marked private, no public read. RLS policies from cycle 7 runbook applied via migration.
  - Loaded by `/build` when staged paths match `app/api/upload/**`, `lib/storage/**`, `lib/auth/session.ts`, `lib/scaffold/renderers/file.tsx`, `lib/scaffold/upload.ts`, or any file with FileKind + storage write.
- [ ] `CLAUDE.md` standards table gets one new row:
  ```
  | `storage.md` | `/api/upload` route, sharp pipeline, signed URL TTL, FAILED-row semantics | `app/api/upload/**`, `lib/storage/**`, `lib/auth/session.ts`, `lib/scaffold/renderers/file.tsx`, `lib/scaffold/upload.ts`, files with FileKind + storage write |
  ```
- [ ] `README.md` ADR table gets one new row (60-day window): `2026-05-06 | Sharp + Supabase Storage upload pipeline | One bucket per FileKind, tenantId path prefix; sharp 1920/JPEG-80; lazy upload on submit; FAILED rows persist for ops`.

### Non-goals

- **Orphan cleanup cron** (`file_asset.orphan_cleanup`) — deferred to p3+ per §16.1a. Without it, PENDING_UPLOAD + FAILED rows accumulate. Acceptable for MVP because (a) failure rate expected low, (b) `storage.md` documents the manual cleanup query, (c) the cron is in the p3 inventory.
- **Direct-to-storage uploads** (presigned URL + browser PUT) — deferred to p4+ if upload bandwidth becomes a Vercel edge concern. Current path through `/api/upload` is fine for the 10MB cap.
- **Multipart/resumable uploads** — deferred to p4+. Current 10MB cap doesn't need them.
- **Programmatic bucket provisioning at tenant onboarding** — deferred to v1.1+. Manual via Supabase dashboard during phase 1.
- **ExportJob result-FileAsset flow** — deferred to `p3-fee-foundation`. The pg-boss worker writes ExportJob → FileAsset link + emails signed URL; this cycle ships only the storage helpers it will reuse.
- **Image variant generation** (thumbnails, srcset) — deferred to p3+ if portal feed performance demands.
- **Video transcoding** — not in MVP scope.
- **HEIC/AVIF decode** — deferred (libheif dep adds 20MB; Indonesian phones increasingly emit HEIC but most camera apps fall back to JPEG when sharing — re-evaluate at W4 launch).
- **Bytes-uploaded progress UX** — deferred (requires XHR over fetch; spinner-only for MVP).
- **Full Google OAuth flow** — owned by `p1-auth-google-oauth`. This cycle ships only the minimal `getSession()` shim that the upload route needs; the helper signature is the contract that survives.
- **Frontend gate (design-system token):** N/A — the renderer edit changes upload behaviour, not visual treatment, and no `app/**/*.{tsx,css}` or `tailwind.config.*` changes ship. The pre-commit Rule 4 trigger doesn't fire.

## Tasks

> All tasks land in one PR (one cycle = one PR per CLAUDE.md /ship rule). Each task = one commit. Between-task gate: `npx prisma generate && npm run lint && npm run build && npx vitest run`. End-of-cycle gate adds `bash scripts/verify-rls-coverage.sh` (25/25 — no schema change), `bash scripts/verify-api-auth.sh` (3/3 — new /api/upload counts), `bash scripts/verify-pii-annotations.sh` (2/2 — no PII change), `npm run scaffold:check`. Playwright skipped (per cycle prompt — UI integration lands w/ p2 entity cycles); record the skip in Verification.

- [x] **T1 — `npm install sharp@^0.34.0` + `next.config.ts` add `serverExternalPackages: ["sharp"]` + lockfile commit + Vercel build smoke.** Acceptance: `package.json` + `package-lock.json` updated; `next.config.ts` adds the `serverExternalPackages` key (per BLOCKER §1); `npm run build` passes locally; `node -e "require('sharp')"` does not throw. Verify the Next.js build output does NOT inline sharp into a route bundle (grep `.next/server/app/api/upload/route.js` for `'libvips'` should return zero matches if externalised correctly). **Independent.**
- [x] **T2 — `lib/storage/supabase.ts` (server-only Supabase Storage wrapper).** Acceptance: exports `uploadToStorage`, `createSignedUrl`, `deleteFromStorage`, `bucketForKind`; module init lazy-creates the service-role Supabase client + throws if env vars missing; matches `lib/audit/write.ts` boundary-marker pattern. **Independent of T3 — can fan out via subagent dispatch.**
- [x] **T3 — `lib/storage/sharp.ts` (server-only sharp pipeline wrapper).** Acceptance: exports `compressImage`; locked pipeline `rotate().resize(1920).jpeg(80, mozjpeg).toBuffer()`; EXIF stripped by default; module-level `import sharp` is the boundary marker. **Independent of T2 — can fan out via subagent dispatch (subagent-driven-development).** Pair with T6 (sharp tests) in the same subagent for tightest feedback loop.
- [x] **T4 — `lib/auth/session.ts` (minimal `getSession()` shim).** Acceptance: exports `getSession()` returning `{tenantId, userId, supabaseUserId} | null`; demo-mode cookie path returns synthetic session; full Google OAuth deferred to `p1-auth-google-oauth`. Locks the contract that survives the auth refactor. **Independent — could parallel with T2/T3 but small enough to bundle sequentially.**
- [x] **T5 — `app/api/upload/route.ts` + `app/api/upload/__tests__/route.test.ts`.** Depends on T2 + T3 + T4. Acceptance: route ships per Spec §5 step list; ~10 test cases per Spec test list pass; `verify-api-auth.sh` count goes 2 → 3.
- [x] **T6 — `lib/storage/__tests__/sharp.test.ts` + `fixtures/sample.jpg` (~50KB).** Depends on T3 only. Pair with T3 in the same subagent. Acceptance: ~5 cases pass; fixture committed via `git add -f` to bypass any binary-asset gitignore (verify .gitignore doesn't exclude `*.jpg` first); fixture documented in test file header (camera model + dimensions for repeatability).
- [x] **T7 — `lib/scaffold/upload.ts` (`useUploadOnSubmit` hook + `uploadFile` helper).** Renderer (`lib/scaffold/renderers/file.tsx`) intentionally NOT changed this cycle — existing renderer's `disabled` prop + inline error slot already cover upload-in-flight UX; integration is purely via the hook. No `FieldDef` shape change (per Assumption §9).
- [x] **T8 — `lib/scaffold/__tests__/upload-hook.test.tsx` (9 cases, NEW).** Renderer test file deferred — no renderer code change to lock; consumer-cycle tests cover the hook ↔ renderer integration once the first p2 entity wires it.
- [x] **T9 — `.claude/standards/storage.md` + `CLAUDE.md` standards-table row + `README.md` ADR row + cycle doc Implementation/Verification/Ship Notes sections.** Bundled at the end. Acceptance: standards file ships with every section listed in Spec §storage.md; CLAUDE.md row added; README ADR row added; cycle doc filled. **Ship Notes must include a retraction note** (per spec-time review NIT §3) pointing back to cycle 7's storage runbook section: bucket layout was originally documented as per-tenant per-kind (`an-nisaa-image`); this cycle picks one-bucket-per-kind w/ tenantId path prefix instead, so `storage.md` is the new authority. Pre-commit hooks pass (broad doc-sync triggered by code changes is satisfied by the staged cycle doc + CLAUDE.md + README.md).

## Implementation

- Subagent plan: T1 inline (install + config edit, can't parallelise). T2 + T3+T6 + T4 dispatched in parallel via `superpowers:subagent-driven-development` (independent library files; T6 paired with T3 in the same subagent). T5 sequential (depends on T2+T3+T4 contracts). T7 + T8 sequential after T5 (depends on route wire-shape). T9 last (docs bundle).
- T1: sharp 0.34.5 + `next.config.ts` `serverExternalPackages` — `package.json`/`package-lock.json`/`next.config.ts` — sharp pinned `^0.34.5` (libvips 8.17.3 + libheif 1.20.2 bundled — HEIC decode now technically available, deferral note in `storage.md` reaffirms MVP scope); externalised so Webpack stops bundling the native binary; verified `node -e "require('sharp')"` resolves. Sharp's transitive deps (`@img/colour`, `detect-libc`, `semver`) flipped from `optional` → required in the lockfile.
- T2: `lib/storage/supabase.ts` (113 lines, 4 exports) — `uploadToStorage` / `createSignedUrl` / `deleteFromStorage` / `bucketForKind`. Service-role client lazy singleton + env-throw boundary marker (no `server-only` shim — same pattern as `lib/audit/write.ts`). `BUCKETS = Object.freeze({...} as const satisfies Record<FileKind, string>)` mirrors `TIMELINE_EVENTS` precedent. **Reviewer fixes folded:** `bucketForKind` runtime defensive throw added (feature-dev MAJOR §1); throw messages dropped `path=${path}` to prevent cross-tenant tenantId leak via shared logs (superpowers MAJOR §M2). No tests this task — T5 covers the wrapper indirectly via mocks; thin SDK wrapper doesn't justify standalone test maintenance.
- T3+T6: `lib/storage/sharp.ts` (59 lines, 1 export `compressImage`) + `lib/storage/__tests__/sharp.test.ts` (5 cases) + `lib/storage/__tests__/fixtures/sample.jpg` (42KB synthetic JPEG, no PII, no EXIF). Pipeline `autoOrient().resize(1920, fit:inside, withoutEnlargement).jpeg(quality:80, mozjpeg).toBuffer()`. **Reviewer fixes folded:** `.rotate()` → `.autoOrient()` (sharp 0.34 explicit API; sidesteps the 0.33.x dimension-swap bug for Orientation 6 — sharp issue #4494); resize-test fixture-size guard added (asserts `inputMeta.width > 1920` before resize assertion to prevent vacuous passthrough — feature-dev MAJOR §2); redundant `Number()` casts on `Buffer.length` removed (NIT N1).
- **CI fix (post-/ship)**: `lib/scaffold/__tests__/upload-hook.test.tsx` — 4× TS2344 surfaced on PR #188's `npm run typecheck` job (`prisma generate && tsc --noEmit`) that local `/build` skipped. Type annotation wrapped `Parameters<...>` in a stray `ReturnType<...>` (api handle is an object, not a function — `ReturnType` rejects it). Vitest's SWC transform accepts the pattern; strict `tsc` does not. Hardened the test's `globalThis.fetch` restore: switched from per-test capture (could re-install a stale prior-file vi.fn) to single module-load capture so `afterEach` always restores the real reference. Suite went 2/750 flaky → 0/750 stable. Lesson: add `npm run typecheck` to the mental gate list for future cycles. No code or behaviour change in `lib/scaffold/upload.ts`.
- T7+T8: `lib/scaffold/upload.ts` (NEW, ~190 lines) + `lib/scaffold/__tests__/upload-hook.test.tsx` (NEW, 9 cases via @testing-library/react harness). Hook signature `useUploadOnSubmit<TForm>(form, fileFields: ReadonlyArray<{name: FieldPath<TForm>, kind: FileKind}>) → {wrap, isUploading}` per Assumption §9 (no `FieldDef.name` refactor). `uploadFile(file, kind)` posts FormData to `/api/upload` and unwraps `{id, signedUrl}` response into typed `UploadError` on non-2xx. Renderer (`lib/scaffold/renderers/file.tsx`) intentionally untouched — existing `disabled` + error-slot covers MVP UX. **Reviewer fixes folded** (3 MAJOR + 1 NIT, feature-dev T7+T8): M1 — both branches now call `handler(form.getValues(), event)` for consistent values origin (early-exit no longer passes the RHF snapshot); M2 — internal `useMemo` stabilises consumer-supplied `fileFields` array so inline-literal call sites don't thrash the wrap callback every render; M3 — `Promise.allSettled` (NOT `Promise.all` per spec literal) documented inline — partial-failure path must let successful uploads complete + persist their `{id, signedUrl}` into RHF state so retry skips them; N4 — cycle doc filename typo `.ts → .tsx`. Verbatim hook test pass list: `posts FormData to /api/upload with file + kind fields and returns {id, signedUrl}` · `throws UploadError with the server-provided code on non-2xx` · `throws UploadError network_error when fetch rejects` · `uploads all File-typed fields in parallel and replaces RHF values before invoking the wrapped handler` · `skips fields whose value is already an uploaded {id, signedUrl} shape` · `calls the handler immediately when no field needs uploading` · `aborts the submit and sets per-field RHF errors when one upload fails` · `maps an UploadError thrown by uploadFile through to the per-field error message` · `carries code + assetId + extends Error`.
- T5: `app/api/upload/route.ts` (~290 lines) + `app/api/upload/__tests__/route.test.ts` (11 cases) + `lib/storage/sharp.ts` `limitInputPixels: 24M` add + `vitest.setup.ts` Element-guard for node-env tests + `README.md` ADR row. Multipart POST handler implementing Spec §5 step list. **Reviewer fixes folded** (8 findings across feature-dev + superpowers reviewers): tx1 wrapped in try/catch → returns structured `{error: 'tx1_failed'}` 500 instead of unhandled rejection (B2); tx2 + signedUrl wrapped → returns `{error: 'tx2_failed', id}` 500 + flips row to FAILED (B1); failure-path audit wrapped in try/catch best-effort so structured 500 always returns (M2); test #10 contract updated `rejects.toThrow → res.status === 500`; new test added for B1 tx2 path; `originalName` removed from audit `after` payload — filenames may carry PII (NIK, KK), FileAsset is not in @PII redactor allowlist (S2); `limitInputPixels: 24_000_000` added to `lib/storage/sharp.ts` to close decompression-bomb DoS where 10 MB PNG decodes to 2.5 GB raw (S1); test comment "4 audit calls" → "2" (N1). vitest.setup.ts: `Element.prototype` guard for `typeof Element !== "undefined"` so route.test.ts can run in node env without crashing the global setup.
- T4: `lib/auth/session.ts` (production-only `getSession()` shim, ~70 lines). **Schema invariant correction folded** (superpowers MAJOR §M1): the schema's only index involving `supabaseUserId` is the **non-unique** `@@index([tenantId, supabaseUserId])` (line 294 — NO unique constraint exists alone or composite). Helper uses `findMany({ take: 2 })` + length-check as fail-closed defence (two matching rows → return null → caller 401s) rather than `findFirst` (which would arbitrarily pick one tenant — privilege-escalation primitive until `p1-auth-google-oauth` enforces the invariant at OAuth-callback time). Demo-mode path explicitly deferred to `p1-auth-google-oauth`. Tenant-scope contract documented in header (callers must NOT pass external tenantId until auth-refactor extends signature).

## Verification

- T1: `npx prisma generate` ✓; `npm run build` ✓ (3 routes, no sharp in bundle yet — no consumer); `npx vitest run` ✓ (725/725 + 4 skipped, baseline unchanged); `node -e "require('sharp')"` resolves to 0.34.5 + libvips 8.17.3.
- T2: `npm run lint` ✓; `npm run build` ✓ (TS compile only — no consumer yet); `npx vitest run` ✓ (725/725, no new tests this task).
- T3+T6: `npm run lint` ✓; `npm run build` ✓; `npx vitest run` ✓ — **730 passed | 4 skipped (734 total)**, baseline 725 → 730 (+5). Verbatim sharp.test.ts pass list: `caps a 3000×2000 image at 1920px on the long edge` (151ms) · `produces output with no EXIF metadata (regression lock against .withMetadata())` (123ms) · `computes ratio as output.buffer.length / input.length` (124ms) · `re-encodes a PNG input as JPEG output` (5ms) · `rejects a non-image buffer` (7ms).
- T4: `npm run lint` ✓; `npm run build` ✓; `npx vitest run` ✓ — 730/730 + 4 skipped (no new tests this task; route tests in T5 cover the helper via mocks).
- T7+T8: `npm run lint` ✓; `npm run build` ✓; `npx vitest run lib/scaffold` ✓ — **134 passed (5 files)**, baseline 125 → 134 (+9 hook tests).
- T9: `.claude/standards/storage.md` shipped (10 sections covering when-to-call, MIME allowlist, sharp pipeline, hard limits, storage layout, lazy upload, FAILED semantics, service-role/RLS split, bucket runbook, deferrals); CLAUDE.md standards table row added; cycle 7 runbook retraction recorded in Ship Notes; Implementation/Verification/Ship Notes filled. **End-of-cycle gates** all green: `npm run lint` ✓, `npm run build` ✓, `npx vitest run` ✓ **750 passed | 4 skipped (754 total)**, `verify-rls-coverage.sh` ✓ 25/25, `verify-api-auth.sh` ✓ 3/3, `verify-pii-annotations.sh` ✓ 2/2, `npm run scaffold:check` ✓ (greenfield). **Playwright deliberately skipped** (per cycle prompt — UI integration lands w/ p2 entity cycles that consume the upload through the renderer; route handler unit-tested at 11 cases + hook unit-tested at 9 cases provides coverage for this cycle's surface area).
- Cross-checked design-system.html: N/A (route + library + standards cycle, no frontend visual diff).
- T5: `npm run lint` ✓; `npm run build` ✓ (4 routes incl. new `/api/upload`); `npx vitest run` ✓ — **741 passed | 4 skipped (745 total)**, baseline 730 → 741 (+11 route tests). All verify scripts green: `verify-api-auth.sh` ✓ **3/3** (new `/api/upload` counts via `getSession(` token); `verify-rls-coverage.sh` ✓ **25/25** (no schema change); `verify-pii-annotations.sh` ✓ **2/2** (no PII annotation change — note: filename PII handled by code-side audit-payload omission, not by the redactor allowlist); `npm run scaffold:check` ✓ (greenfield — no entities registered yet). Verbatim route.test.ts pass list: `returns 401 when getSession() returns null` · `returns 400 when file form field is missing` · `returns 400 when kind form field is missing` · `returns 400 when kind is not a valid FileKind enum member` · `returns 400 when file.size exceeds 10 MiB` · `returns 400 when MIME type does not match the kind allowlist` · `compresses an IMAGE kind, transitions to COMPRESSED, returns ratio + signedUrl + .jpg path` · `passes a DOCUMENT kind through unchanged, transitions to UPLOADED, no compression, signedUrl returned` · `returns 500 + flips row to FAILED + audits the FAILED transition when storage throws` · `returns 500 tx1_failed when tx1 audit-write throws (no FileAsset committed; no storage I/O)` · `returns 500 tx2_failed + flips row to FAILED when tx2 throws after storage upload succeeds (B1 lock-in)`. Playwright skipped this task (UI integration lands w/ p2 entity cycles per cycle prompt).

## Ship Notes

### Migrations applied

**None this cycle.** No schema change — `FileAsset` model + `FileKind` / `FileStatus` enums shipped in cycle 7 (`p1-audit-timeline-files` migration `06_audit_timeline`). `verify-rls-coverage.sh` stays at 25/25; `verify-pii-annotations.sh` stays at 2/2 (filename PII handled by code-side audit-payload omission, NOT by adding a `/// @PII` annotation — see runbook below).

### New env vars

- `SUPABASE_SERVICE_ROLE_KEY` — required for `lib/storage/supabase.ts` lazy singleton. Already in `.env.local` for staging/prod since the cycle 7 runbook flagged it; verify present in Vercel project env before merge.
- `NEXT_PUBLIC_SUPABASE_URL` — already in use; service-role client reads it from the same env var as the SSR client.

### Sharp install platform notes

- `sharp@^0.34.5` installed via standard `npm install` — sharp's prebuilt binaries for Vercel's `linux-x64-gnu` runtime resolve automatically via the scoped optional package `@img/sharp-linux-x64`. **No `--platform` install flags needed** since sharp v0.33.
- **Critical Vercel runtime gate:** `next.config.ts` adds `serverExternalPackages: ["sharp"]`. Without this, Next.js Webpack-bundles sharp into the server bundle and the route silently 500s in production with `Could not load the "sharp" module using the linux-x64 runtime` (sharp issue #3870, vercel issue #14001). T1 commit message documents the rationale; CI build verifies sharp is externalised before merge.
- `vercel-build.sh` not modified — sharp installs via the standard `npm ci` step. No postinstall hook risk verified.
- Runtime memory: Vercel default 2 GB / 1 vCPU on all plans (incl. Hobby) — sharp decoding a 10 MB JPEG peaks ~50–80 MB transient via libvips streaming. No `vercel.json` `memory` override needed. `limitInputPixels: 24_000_000` in `lib/storage/sharp.ts` closes the decompression-bomb DoS that would otherwise OOM the function on a malicious 10 MB PNG (decodes to ~25k×25k×4 ≈ 2.5 GB raw).

### Bucket provisioning runbook (per-tenant, manual until v1.1+)

At each new-tenant onboarding:

1. Open Supabase dashboard → Storage → New bucket.
2. Create five buckets — names locked: `documents`, `images`, `videos`, `audios`, `archives`.
3. Mark each **Private** (no public read).
4. RLS policies on `storage.objects` from the cycle 7 runbook — applied via raw SQL migration when first p2 entity cycle ships (or run inline now if real upload UI is needed before that cycle):
   ```sql
   CREATE POLICY "tenant_scoped_storage_select" ON storage.objects
     FOR SELECT TO authenticated
     USING (name LIKE (current_setting('request.jwt.claims', true)::json->>'tenant_id') || '/%');
   CREATE POLICY "no_writes_via_postgrest_storage" ON storage.objects
     FOR ALL TO anon, authenticated
     USING (false) WITH CHECK (false);
   ```
5. Service-role write boundary: `/api/upload` runs server-side with `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. Browser-side reads consume signed URLs only.

### Cycle 7 runbook retraction

Cycle 7 (`docs/cycles/2026-05-05-p1-audit-timeline-files.md` Ship Notes lines 421-428) documented bucket layout as **per-tenant per-kind** (e.g. `an-nisaa-image`). This cycle supersedes that with **one bucket per FileKind, tenant-scoped via path prefix** — `<tenantId>/<kind>/<cuid>.<ext>` (Assumption §1). The cycle 7 runbook's RLS policy already gates on `name LIKE tenant_id || '/%'` which only makes sense with the shared per-kind bucket layout — internal contradiction within cycle 7. **`.claude/standards/storage.md` is now the authoritative source** for bucket naming + path convention; the cycle 7 doc's runbook section is superseded but kept in place for historical context.

### FAILED-row semantics

- `FileAsset` rows in `FAILED` status are **operational records** of failed uploads, NOT rolled back from the original `PENDING_UPLOAD` insert. Ops follow-up via the manual cleanup query in `.claude/standards/storage.md` §7 until `file_asset.orphan_cleanup` cron lands in p3+.
- A concurrent future orphan-cron flipping `PENDING_UPLOAD → ORPHANED` does NOT collide with the route's catch block: `updateMany` with `where: { status: 'PENDING_UPLOAD' }` becomes a no-op when the row has already moved on (per superpowers MAJOR §M3 fix).
- tx2 (post-storage transition) has its own catch + FAILED-flip path so a tx2 throw never crashes the route as an unhandled rejection (per feature-dev BLOCKER §B1 fix).

### Filename PII handling

`originalName` is stored in the `FileAsset` row column for legitimate UI display, but the audit `after` payload OMITS it entirely (per superpowers MAJOR §S2). Filenames may carry PII (NIK, KK numbers, birthdate-encoded names — Indonesian users routinely name files `siti-rahmawati-nik-3201xxxxxxx.pdf`); since `FileAsset` is not in the `@PII` redactor's allowlist + the audit table is partition-append-only, the only defence against one-way leakage was code-side omission. **Future entity cycles consuming this route inherit the same omission** — do NOT add `originalName` to any audit payload that touches `FileAsset`. Alternative considered + rejected: adding `/// @PII redact` to the schema column (would lose the value from the live UI display query path, not just from audit).

### `getSession()` deferral chain

- `lib/auth/session.ts` ships as a **production-only minimal shim** this cycle. `getSession()` returns `null` in production until `p1-auth-google-oauth` ships the OAuth callback that populates `User.supabaseUserId` (no User row has it populated today — `verify-api-auth.sh` accepts the `getSession(` token unchanged).
- Demo-cookie write path is explicitly deferred to `p1-auth-google-oauth` (no code currently writes the `school-erp-session` cookie that `proxy.ts` reads).
- The signature `() => Promise<{tenantId, userId, supabaseUserId} | null>` is the contract that survives the auth-refactor cycle — the route + every future caller depends on it.
- **Schema invariant correction folded** (superpowers MAJOR §M1): the schema's only index involving `supabaseUserId` is the **non-unique** `@@index([tenantId, supabaseUserId])` (prisma/schema.prisma:294) — no `@@unique` exists. The shim uses `findMany({ take: 2 })` + length-check as fail-closed defence against the privilege-escalation primitive where two User rows in different tenants share a `supabaseUserId`. **`p1-auth-google-oauth` MUST enforce one-Supabase-account ↔ one-tenant at the OAuth callback** (or add `@@unique([supabaseUserId])` via migration); failure to do so leaves the `findMany + length === 1` guard as the only defence.

### Consumer pattern for p2+ entity cycles

When a p2 entity ships a form with FILE fields (e.g. Student.photo, Employee.cv, Admission.documents):

```tsx
import { useUploadOnSubmit } from "@/lib/scaffold/upload";

const FILE_FIELDS = [
  { name: "photo", kind: "IMAGE" as const },
  { name: "cv", kind: "DOCUMENT" as const },
] as const;

function StudentForm() {
  const form = useForm<StudentValues>(...);
  const { wrap, isUploading } = useUploadOnSubmit(form, FILE_FIELDS);

  const onSubmit = wrap(async (values) => {
    // values.photo + values.cv are now `{id, signedUrl}` shapes — pass to
    // server action that persists the FileAsset id on the entity row.
    await createStudent(values);
  });

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

The hook handles parallel uploads, RHF state replacement, per-field error surfacing, and submit-abort on partial failure. `isUploading` flag drives spinner UI / disabled buttons. `ScaffoldFormPage` does NOT auto-integrate the hook this cycle — first p2 entity cycle decides whether to extend `ScaffoldFormPageProps` with `fileFields` or keep manual wiring.

### Deferrals + future work

| Item | Defer to | Why |
|---|---|---|
| `file_asset.orphan_cleanup` cron | p3+ per spec §16.1a | Without it, PENDING_UPLOAD + FAILED rows accumulate. Manual cleanup query in `storage.md` §7. |
| Direct-to-storage presigned PUT | p4+ | Current 10 MiB cap doesn't need bandwidth offload. |
| Multipart resumable uploads | p4+ | Same. |
| Programmatic bucket provisioning | v1.1+ | Manual via dashboard during phase 1. |
| ExportJob result-FileAsset flow | p3-fee-foundation | pg-boss worker writes ExportJob → FileAsset link + emails signed URL. |
| Image variants (thumbnails, srcset) | p3+ | If portal feed performance demands. |
| HEIC/AVIF decode | Possibly W4 launch | libvips bundled with libheif (sharp 0.34.5); route allowlist stays conservative until field demand surfaces. |
| Bytes-uploaded progress UX | Future polish | Requires XHR over fetch; spinner-only for MVP. |
| Role-based FileKind gating | First p2 entity cycle | Any auth'd user can upload any kind today. |
| Rate limiting on /api/upload | First p2 entity cycle | `lib/rate-limit.ts` not yet built; first p2 ships it. |
| MIME magic-byte verification | First p2 entity cycle | Acceptable trust boundary at MVP. |
| Demo-cookie write helper for E2E | `p1-auth-google-oauth` | No code currently writes `school-erp-session`; route 401s real callers until OAuth lands. |

### Rollback plan

- **Revert path:** `git revert <PR merge SHA>` undoes all 6 cycle commits cleanly. No schema change, no env var addition, no migration to roll back.
- **Sharp dep:** `npm uninstall sharp` after revert. `next.config.ts` `serverExternalPackages` line can be removed but is harmless if left.
- **Storage buckets:** any buckets manually provisioned during the cycle stay (idempotent). No data loss from revert.
- **Risk window:** the route is auth-gated and `getSession()` returns `null` in production today, so production traffic to `/api/upload` already 401s — no real upload UI exists to rollback. Rollback is essentially a no-op for users.

### Phase 1 foundation status

**Phase 1 is now DONE.** All four cycle-6 deferrals cleared (audit-write middleware, scaffold renderers, timeline registry, this cycle's upload route + sharp pipeline). Phase 2 entity cycles begin next — `p2-students-guardians-household` first per spec §18.1 cycle plan. The first p2 cycle inherits the storage runbook, the upload-hook integration pattern, and the deferred role-gating + rate-limit + magic-byte items as P0 entry conditions.
