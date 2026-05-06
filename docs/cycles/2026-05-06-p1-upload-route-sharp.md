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
- [ ] `lib/scaffold/__tests__/upload-hook.test.ts` — NEW small file. ~3 cases for the `useUploadOnSubmit` hook in isolation: (a) all-File-fields case uploads in parallel; (b) mixed File + already-uploaded-id case skips the latter; (c) one-failure aborts whole submit + sets per-field error.
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
- [ ] **T5 — `app/api/upload/route.ts` + `app/api/upload/__tests__/route.test.ts`.** Depends on T2 + T3 + T4. Acceptance: route ships per Spec §5 step list; ~10 test cases per Spec test list pass; `verify-api-auth.sh` count goes 2 → 3.
- [x] **T6 — `lib/storage/__tests__/sharp.test.ts` + `fixtures/sample.jpg` (~50KB).** Depends on T3 only. Pair with T3 in the same subagent. Acceptance: ~5 cases pass; fixture committed via `git add -f` to bypass any binary-asset gitignore (verify .gitignore doesn't exclude `*.jpg` first); fixture documented in test file header (camera model + dimensions for repeatability).
- [ ] **T7 — `lib/scaffold/upload.ts` (`useUploadOnSubmit` hook + `uploadFile` helper) + `lib/scaffold/renderers/file.tsx` edits.** No `FieldDef` shape change (per Assumption §9). Depends on T5 (route's wire-shape contract). Acceptance: hook walks fields, uploads File-typed values in parallel, replaces RHF state, surfaces errors per-field; renderer respects `disabled` while upload in-flight; existing `maxBytes` guard preserved.
- [ ] **T8 — `lib/scaffold/__tests__/file-renderer.test.tsx` (+3 cases) + `lib/scaffold/__tests__/upload-hook.test.ts` (~3 cases, NEW).** Depends on T7. Acceptance: all 6 new cases pass; existing cases unaffected.
- [ ] **T9 — `.claude/standards/storage.md` + `CLAUDE.md` standards-table row + `README.md` ADR row + cycle doc Implementation/Verification/Ship Notes sections.** Bundled at the end. Acceptance: standards file ships with every section listed in Spec §storage.md; CLAUDE.md row added; README ADR row added; cycle doc filled. **Ship Notes must include a retraction note** (per spec-time review NIT §3) pointing back to cycle 7's storage runbook section: bucket layout was originally documented as per-tenant per-kind (`an-nisaa-image`); this cycle picks one-bucket-per-kind w/ tenantId path prefix instead, so `storage.md` is the new authority. Pre-commit hooks pass (broad doc-sync triggered by code changes is satisfied by the staged cycle doc + CLAUDE.md + README.md).

## Implementation

- Subagent plan: T1 inline (install + config edit, can't parallelise). T2 + T3+T6 + T4 dispatched in parallel via `superpowers:subagent-driven-development` (independent library files; T6 paired with T3 in the same subagent). T5 sequential (depends on T2+T3+T4 contracts). T7 + T8 sequential after T5 (depends on route wire-shape). T9 last (docs bundle).
- T1: sharp 0.34.5 + `next.config.ts` `serverExternalPackages` — `package.json`/`package-lock.json`/`next.config.ts` — sharp pinned `^0.34.5` (libvips 8.17.3 + libheif 1.20.2 bundled — HEIC decode now technically available, deferral note in `storage.md` reaffirms MVP scope); externalised so Webpack stops bundling the native binary; verified `node -e "require('sharp')"` resolves. Sharp's transitive deps (`@img/colour`, `detect-libc`, `semver`) flipped from `optional` → required in the lockfile.
- T2: `lib/storage/supabase.ts` (113 lines, 4 exports) — `uploadToStorage` / `createSignedUrl` / `deleteFromStorage` / `bucketForKind`. Service-role client lazy singleton + env-throw boundary marker (no `server-only` shim — same pattern as `lib/audit/write.ts`). `BUCKETS = Object.freeze({...} as const satisfies Record<FileKind, string>)` mirrors `TIMELINE_EVENTS` precedent. **Reviewer fixes folded:** `bucketForKind` runtime defensive throw added (feature-dev MAJOR §1); throw messages dropped `path=${path}` to prevent cross-tenant tenantId leak via shared logs (superpowers MAJOR §M2). No tests this task — T5 covers the wrapper indirectly via mocks; thin SDK wrapper doesn't justify standalone test maintenance.
- T3+T6: `lib/storage/sharp.ts` (59 lines, 1 export `compressImage`) + `lib/storage/__tests__/sharp.test.ts` (5 cases) + `lib/storage/__tests__/fixtures/sample.jpg` (42KB synthetic JPEG, no PII, no EXIF). Pipeline `autoOrient().resize(1920, fit:inside, withoutEnlargement).jpeg(quality:80, mozjpeg).toBuffer()`. **Reviewer fixes folded:** `.rotate()` → `.autoOrient()` (sharp 0.34 explicit API; sidesteps the 0.33.x dimension-swap bug for Orientation 6 — sharp issue #4494); resize-test fixture-size guard added (asserts `inputMeta.width > 1920` before resize assertion to prevent vacuous passthrough — feature-dev MAJOR §2); redundant `Number()` casts on `Buffer.length` removed (NIT N1).
- T4: `lib/auth/session.ts` (production-only `getSession()` shim, ~60 lines). **Schema invariant correction folded** (superpowers MAJOR §M1): the schema's only index involving `supabaseUserId` is the **non-unique** `@@index([tenantId, supabaseUserId])` (line 294 — NO unique constraint exists alone or composite). Helper uses `findMany({ take: 2 })` + length-check as fail-closed defence (two matching rows → return null → caller 401s) rather than `findFirst` (which would arbitrarily pick one tenant — privilege-escalation primitive until `p1-auth-google-oauth` enforces the invariant at OAuth-callback time). Demo-mode path explicitly deferred to `p1-auth-google-oauth`. Tenant-scope contract documented in header (callers must NOT pass external tenantId until auth-refactor extends signature).

## Verification

- T1: `npx prisma generate` ✓; `npm run build` ✓ (3 routes, no sharp in bundle yet — no consumer); `npx vitest run` ✓ (725/725 + 4 skipped, baseline unchanged); `node -e "require('sharp')"` resolves to 0.34.5 + libvips 8.17.3.
- T2: `npm run lint` ✓; `npm run build` ✓ (TS compile only — no consumer yet); `npx vitest run` ✓ (725/725, no new tests this task).
- T3+T6: `npm run lint` ✓; `npm run build` ✓; `npx vitest run` ✓ — **730 passed | 4 skipped (734 total)**, baseline 725 → 730 (+5). Verbatim sharp.test.ts pass list: `caps a 3000×2000 image at 1920px on the long edge` (151ms) · `produces output with no EXIF metadata (regression lock against .withMetadata())` (123ms) · `computes ratio as output.buffer.length / input.length` (124ms) · `re-encodes a PNG input as JPEG output` (5ms) · `rejects a non-image buffer` (7ms).
- T4: `npm run lint` ✓; `npm run build` ✓; `npx vitest run` ✓ — 730/730 + 4 skipped (no new tests this task; route tests in T5 cover the helper via mocks).

## Ship Notes
<!-- filled by /ship — migrations, env vars, manual steps, rollback plan -->
