# Storage

> Loaded on demand by `/build` when staged paths match `app/api/upload/**`, `lib/storage/**`, `lib/auth/session.ts`, `lib/scaffold/renderers/file.tsx`, `lib/scaffold/upload.ts`, or any file with `FileKind` + a storage write.

The school ERP stores user-uploaded files in **Supabase Storage**, gated by a single server route (`POST /api/upload`) that validates, optionally compresses (IMAGE kind only), persists a `FileAsset` row + audit row atomically, and returns a 24-hour signed URL. Reads are RLS-gated; writes go through the service-role wrapper at the route boundary.

---

## 1. When to call `/api/upload`

| Caller | When |
|---|---|
| Scaffold renderer (`lib/scaffold/renderers/file.tsx`) via the `useUploadOnSubmit` hook | Any user-facing FILE field on an entity form. Triggers on form submit (lazy strategy, see §6). |
| Server-side jobs (e.g. ExportJob worker in p3+) | Do NOT call the route; call `lib/storage/supabase.ts` helpers directly + write the `FileAsset` row inline (no HTTP roundtrip needed when you already have a session). |
| Direct browser uploads (presigned PUT) | NOT supported in MVP. Deferred to p4+ if Vercel function bandwidth becomes a concern. |

---

## 2. MIME allowlist per FileKind

| FileKind | Allowed MIME types | Notes |
|---|---|---|
| `IMAGE` | `image/jpeg`, `image/png`, `image/webp` | Re-encoded to JPEG by sharp. HEIC/AVIF deferred — libvips ships with libheif but the route allowlist stays conservative for MVP (Indonesian phones increasingly emit HEIC; revisit at W4 launch). |
| `DOCUMENT` | `application/pdf` | Office docs deferred (no parse/preview need). |
| `VIDEO` | `video/mp4` | No transcoding. 10 MB cap means small clips only. |
| `AUDIO` | `audio/mpeg` (mp3), `audio/mp4` (m4a) | No transcoding. |
| `ARCHIVE` | `application/zip` | Bulk export ZIPs — written server-side by ExportJob worker (p3+); client-side allowlist exists for completeness. |

Mismatches return `400 { error: 'mime_kind_mismatch', kind, mimeType }`. Magic-byte verification is NOT performed — the route trusts the browser-supplied `Content-Type` header. The signed-URL response sets the same `contentType` so downstream renderers behave consistently. Deferred to first p2 entity cycle alongside role-based FileKind gating.

---

## 3. Sharp pipeline (IMAGE only)

```
sharp(buffer, { limitInputPixels: 24_000_000 })
  .autoOrient()
  .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 80, mozjpeg: true })
  .toBuffer()
```

- **1920px max long edge** — covers desktop full-HD render; collapses 12 MP+ phone uploads to ~25% of the byte count. Smaller inputs pass through unscaled.
- **JPEG-80 + mozjpeg** — ~5% extra encode CPU for ~10–15% smaller files vs. libjpeg-turbo defaults at visually-indistinguishable quality on photographic content. Typical ratio on phone photos: **0.20–0.40**.
- **EXIF stripped** — sharp's default `.jpeg()` (no `.withMetadata()`) drops all metadata including GPS. `lib/storage/__tests__/sharp.test.ts` case 2 locks this against future regression.
- **`.autoOrient()` BEFORE `.resize()`** — auto-orient consumes the EXIF orientation flag before resize alters pixel data; reversed order produces sideways output. Sharp 0.34 explicit `.autoOrient()` API used over the legacy `.rotate()` no-args form (sharp issue #4494).
- **`limitInputPixels: 24_000_000`** — closes the decompression-bomb DoS where a small (≤10 MB) PNG decodes to ~25k×25k×4 ≈ 2.5 GB raw and OOMs the Vercel function. 24 MP covers any real phone (12 MP + 2× cropping headroom).

Other FileKinds pass through as raw bytes — `status` jumps `PENDING_UPLOAD → UPLOADED` (no `COMPRESSED` transition).

---

## 4. Hard limits

| Limit | Value | Source |
|---|---|---|
| Max file size | **10 MiB** | Spec §16.1 — caps the upload-bandwidth budget on Vercel functions. Larger files would need direct-to-storage presigned PUT (deferred p4+). |
| Vercel function memory | 2 GiB (1 vCPU) default, all plans | Decoded raw image peaks ~50–80 MB transient via libvips streaming — well within the budget at the 10 MiB input cap. |
| Sharp pixel cap | 24 MP | Decompression-bomb defence, see §3. |
| Signed URL TTL | **24 hours** | Spec §16.1. Refresh by re-calling `createSignedUrl(bucket, path, 86400)` on access — never persist a signed URL beyond a single response (ExportJob in p3+ extends this with email-on-completion patterns). |

---

## 5. Storage layout

**One bucket per FileKind** (NOT per-tenant per-kind). Five buckets total:

| FileKind | Bucket name |
|---|---|
| `DOCUMENT` | `documents` |
| `IMAGE` | `images` |
| `VIDEO` | `videos` |
| `AUDIO` | `audios` |
| `ARCHIVE` | `archives` |

`lib/storage/supabase.ts` exports `bucketForKind(kind: FileKind): string` as the single source of truth. The mapping is `Object.freeze({...} as const satisfies Record<FileKind, string>)` — TS catches gaps at compile time after `prisma generate`; a runtime `if (!bucket) throw` catches the cold-CI case.

**Path convention:** `<tenantId>/<kind>/<cuid>.<ext>`

- `tenantId` from `session.tenantId` — never read from request.
- `kind` is the literal `FileKind` enum string (`IMAGE`, `DOCUMENT`, etc.).
- `cuid` is the Prisma-generated `FileAsset.id` (cuid v1, matching every other entity ID).
- `ext` derived from `file.name`'s last dot segment, sanitized to `[a-z0-9]{1,8}`. IMAGE paths get rewritten to `.jpg` after sharp re-encode.

**RLS policy on `storage.objects`** (per cycle 7 runbook, applied at tenant onboarding via raw SQL migration):

```sql
-- Read policy: authenticated user can SELECT only objects under their tenant prefix.
CREATE POLICY "tenant_scoped_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    name LIKE (current_setting('request.jwt.claims', true)::json->>'tenant_id') || '/%'
  );

-- Write policy: blocked at PostgREST layer — uploads go through service-role via /api/upload.
CREATE POLICY "no_writes_via_postgrest_storage" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
```

Service-role bypasses RLS for app writes (the upload route runs server-side with `SUPABASE_SERVICE_ROLE_KEY`). Client-bundle paths read storage via signed URLs only — never via PostgREST.

---

## 6. Lazy upload trigger

Renderer captures `File` in RHF state on input change (with the existing `maxBytes` client-side guard). Upload fires on consumer-form-submit via `useUploadOnSubmit(form, fileFields)` from `lib/scaffold/upload.ts`. The hook walks `fileFields` (consumer-supplied `{name, kind}` pairs), uploads File-typed values in parallel via `Promise.allSettled`, replaces RHF state with returned `{id, signedUrl}` shapes, surfaces per-field errors on partial failure, then invokes the consumer's wrapped submit handler with the now-mutated form values.

**Why lazy (not eager-on-input-change):**
- Eager would create `PENDING_UPLOAD` rows for abandoned forms (orphan-cleanup cron handles those — but the cron is deferred to p3+, see §10). For MVP, the database stays clean.
- Explicit "Submit" click is the user's clear consent moment — eager surprises users by uploading data they intended to discard.
- Progress UX during a single submit is simpler than a phantom-row recovery flow.

**Trade-off:** the user waits through compress + upload during submit. Acceptable for MVP; revisit if first p2 entity cycles report friction.

**Hook signature locked:** `useUploadOnSubmit<TForm>(form, fileFields: ReadonlyArray<{name: FieldPath<TForm>, kind: FileKind}>) → {wrap, isUploading}`. Consumers thread the explicit `{name, kind}` pairs because the existing `FieldDef` type has no `name` property — registry-wide refactor deferred.

---

## 7. FAILED-row semantics

When sharp throws or storage upload errors AFTER tx1 committed `PENDING_UPLOAD`, the catch block runs on the OUTER prisma client (NOT a new tx — tx1 is already committed):

```ts
await prisma.fileAsset.updateMany({
  where: { id: asset.id, tenantId: session.tenantId, status: 'PENDING_UPLOAD' },
  data: { status: 'FAILED', updatedById: session.userId },
});
```

**`updateMany` (NOT `update`)** + status guard means a concurrent future orphan-cleanup cron flipping the row to ORPHANED doesn't throw here — zero matches just becomes a no-op. The status transition pin to `PENDING_UPLOAD` only is load-bearing.

A best-effort audit row records the FAILED transition (wrapped in try/catch so an audit-side throw does not swallow the structured 500 the client needs for correlation). The route returns `500 { error: 'storage_upload_failed' | 'compression_failed', id: assetId }`.

**Why FAILED rows persist** (rather than rolling back the original PENDING_UPLOAD): operational record for ops follow-up. The orphan-cleanup cron (deferred p3+) eventually reconciles + hard-deletes after a 7-day grace window. Without the cron, FAILED rows accumulate indefinitely — flag for ops.

A second tx (tx2) that flips `PENDING_UPLOAD → COMPRESSED/UPLOADED` after a successful storage upload also runs inside its own try/catch (per superpowers:code-reviewer T5 finding B1 fix); a tx2 throw flips the row to FAILED via the same `updateMany` guard, so the route never produces an unhandled-rejection crash.

**Manual cleanup query (until orphan-cleanup cron lands in p3+):**

```sql
-- Hard-delete FAILED rows older than 7 days. Run weekly during ops review.
DELETE FROM "FileAsset"
WHERE status = 'FAILED' AND "updatedAt" < NOW() - INTERVAL '7 days';
```

---

## 8. Service-role write / RLS-gated read split

| Layer | Access | Mechanism |
|---|---|---|
| `/api/upload` (T5) | Service-role write — bypasses RLS | `lib/storage/supabase.ts` lazy singleton with `SUPABASE_SERVICE_ROLE_KEY`. The route IS the tenant boundary (auth + path prefix `<tenantId>/...` enforced before helpers are called). |
| Server-side jobs (ExportJob worker in p3+) | Service-role write | Same wrapper. |
| Browser reads (signed URL) | RLS-gated read | Signed URL is a 24h time-bound capability — Supabase Storage validates the JWT-derived tenant prefix in the read path. |
| Browser writes via PostgREST | Blocked | The `no_writes_via_postgrest_storage` RLS policy denies all writes from `anon` + `authenticated` roles. |

**Storage error messages deliberately strip `path=`** from their throws (only `bucket` survives) — the path embeds `tenantId`, and shared logs (Vercel function logs, Sentry) would otherwise let ops staff see other tenants' IDs while triaging unrelated failures. Callers needing path correlation must thread it through their own structured log on the catch side.

---

## 9. Bucket provisioning runbook

**Manual per-tenant step until v1.1+** (programmatic provisioning at tenant onboarding deferred). At each new-tenant onboarding:

1. Open Supabase dashboard → Storage → New bucket.
2. Create five buckets: `documents`, `images`, `videos`, `audios`, `archives`.
3. For each bucket: mark **Private** (no public read).
4. Apply the RLS policies from §5 to the `storage.objects` table (one-time, applies to all buckets — already in the migration set if not, raw SQL migration ships with the first p2 entity cycle that needs uploads).

**Service-role key rotation (rare but planned):** Supabase service-role keys do not expire; rotation is via the Supabase dashboard. The lazy singleton in `lib/storage/supabase.ts` holds the key per warm function instance — a rotation requires forcing function-instance recycling (redeploy or wait for cold-start). Document at the rotation moment so warm instances don't keep serving with the stale key during an incident.

---

## 10. Deferrals + future work

| Item | Defer to | Why |
|---|---|---|
| `file_asset.orphan_cleanup` cron | p3+ per spec §16.1a | Without it, PENDING_UPLOAD + FAILED rows accumulate. Manual cleanup query in §7 covers ops until then. |
| Direct-to-storage presigned PUT | p4+ | Current 10 MiB cap doesn't need bandwidth offload. |
| Multipart resumable uploads | p4+ | Same — no resume needed at 10 MiB. |
| Programmatic bucket provisioning | v1.1+ | Manual via dashboard during phase 1. |
| ExportJob result-FileAsset flow | p3-fee-foundation | pg-boss worker writes ExportJob → FileAsset link + emails signed URL. |
| Image variant generation (thumbnails, srcset) | p3+ | If portal feed performance demands. |
| Video transcoding | Never (MVP scope) | — |
| HEIC/AVIF decode | Possibly W4 launch | libvips bundled with libheif; route allowlist stays conservative until field demand surfaces. |
| Bytes-uploaded progress UX | Future polish | Requires XHR over fetch; spinner-only for MVP. |
| Role-based FileKind gating | First p2 entity cycle | Any auth'd user can upload any kind today; `roleCanUploadKind(role, kind)` lands when the first real UI consumer ships. |
| Rate limiting | First p2 entity cycle | `lib/rate-limit.ts` not yet built. |
| MIME magic-byte check | First p2 entity cycle | Acceptable trust boundary at MVP since signed-URL response echoes upload `Content-Type`. |
| Filename PII redaction | This cycle's S2 fix removed `originalName` from the audit `after` payload. | The live FileAsset.originalName column still has the raw value for legitimate UI display, but the partition-append-only audit row never sees it. |
