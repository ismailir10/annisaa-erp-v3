// POST /api/upload — multipart/form-data file upload + sharp compression.
//
// Auth-gated (getSession 401), validated (size + mime-kind allowlist), writes
// FileAsset + AuditLog atomically in tx, runs sharp pipeline for IMAGE kind,
// uploads to Supabase Storage via service-role, returns 24h signed URL.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §16.1
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §5)
//
// Tx semantics: tx1 commits PENDING_UPLOAD + audit row atomically; storage
// upload + sharp happen OUTSIDE any tx (large I/O — keep tx scope short); on
// success, tx2 commits the COMPRESSED/UPLOADED transition + audit row; on
// failure, an OUTER updateMany flips status to FAILED (with status guard
// against future orphan-cleanup cron races) + writes a FAILED-transition
// audit row. The PENDING_UPLOAD row stays committed as an operational record
// per Assumption §6 — orphan-cleanup cron (deferred p3+) eventually clears.
//
// Auth scope: getSession() returns null until p1-auth-google-oauth ships the
// OAuth callback that populates User.supabaseUserId. Until then, real callers
// 401 — acceptable because no real upload UI exists yet (first p2 entity
// cycle is the first real consumer). Mocked test contexts stand in for now.
//
// Out-of-scope this cycle (per cycle doc Non-goals):
//   - Rate limiting (lib/rate-limit.ts not yet built; lands w/ first p2 route)
//   - Role-based FileKind gating (any auth'd user can upload any kind)
//   - Direct-to-storage uploads / multipart resumable / image variants

import { NextResponse, type NextRequest } from "next/server";
import { writeAuditLog } from "@/lib/audit/write";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  AuditAction,
  FileKind,
  FileStatus,
  Prisma,
} from "@/lib/generated/prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyMimeBytes } from "@/lib/storage/mime-verify";
import { compressImage } from "@/lib/storage/sharp";
import {
  bucketForKind,
  createSignedUrl,
  uploadToStorage,
} from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB hard cap per spec §16.1
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h per spec §16.1

// MIME allowlist per FileKind (cycle Assumption §5). HEIC/AVIF deferred —
// libvips is bundled, but the route + standards lock the conservative MVP set.
const MIME_ALLOWLIST: Record<FileKind, ReadonlySet<string>> = {
  [FileKind.IMAGE]: new Set(["image/jpeg", "image/png", "image/webp"]),
  [FileKind.DOCUMENT]: new Set(["application/pdf"]),
  [FileKind.VIDEO]: new Set(["video/mp4"]),
  [FileKind.AUDIO]: new Set(["audio/mpeg", "audio/mp4"]),
  [FileKind.ARCHIVE]: new Set(["application/zip"]),
};

function isFileKind(kind: string): kind is FileKind {
  return (Object.values(FileKind) as string[]).includes(kind);
}

function sanitizeExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : "bin";
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return jsonError(401, { error: "unauthorized" });
  }

  // 1a. Rate-limit (per-user; logged-in route). Default 60/min via env. T8.
  const rateLimit = checkRateLimit({
    key: session.userId,
    scope: "upload",
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rateLimit.retryAfterMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

  // 2. Parse multipart/form-data
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, { error: "invalid_form_data" });
  }
  const file = form.get("file");
  const kindRaw = form.get("kind");
  if (!(file instanceof File)) {
    return jsonError(400, { error: "missing_field", field: "file" });
  }
  if (typeof kindRaw !== "string" || kindRaw === "") {
    return jsonError(400, { error: "missing_field", field: "kind" });
  }

  // 3. Validate kind
  if (!isFileKind(kindRaw)) {
    return jsonError(400, { error: "invalid_kind", kind: kindRaw });
  }
  const kind: FileKind = kindRaw;

  // 4. Validate size
  if (file.size > MAX_BYTES) {
    return jsonError(400, {
      error: "file_too_large",
      maxBytes: MAX_BYTES,
      sizeBytes: file.size,
    });
  }

  // 5. Validate MIME against kind allowlist
  if (!MIME_ALLOWLIST[kind].has(file.type)) {
    return jsonError(400, {
      error: "mime_kind_mismatch",
      kind,
      mimeType: file.type,
    });
  }

  // 6. Read buffer once + compute ext
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = sanitizeExt(file.name);

  // 6a. Magic-byte MIME verify (post-allowlist, pre-sharp). T8.
  // Buffer is a Node Buffer (Uint8Array subclass); verifyMimeBytes accepts
  // Uint8Array. Rejects content-type spoofs that pass the declared-MIME
  // allowlist check above but whose leading bytes don't match the kind.
  const mimeVerify = verifyMimeBytes(buffer, kind);
  if (!mimeVerify.ok) {
    return jsonError(400, { error: "invalid_mime", reason: mimeVerify.reason });
  }

  // 7. Tx1: insert PENDING_UPLOAD + audit. ID generated by Prisma cuid;
  // storagePath computed AFTER insert (Assumption §8) and persisted via a
  // same-tx update so all FileAsset IDs stay in cuid v1 format. Audit `after`
  // OMITS `originalName` — filenames may carry PII (NIK, KK numbers,
  // birthdate-encoded names) and FileAsset is not in the @PII redactor's
  // allowlist; the live FileAsset.originalName column still holds the value
  // for legitimate UI display, but the partitioned-append-only audit row
  // never sees it. Per superpowers:code-reviewer T5 finding S2.
  let asset: { id: string; storagePath: string };
  try {
    asset = await prisma.$transaction(async (tx) => {
      const created = await tx.fileAsset.create({
        data: {
          tenantId: session.tenantId,
          storagePath: "",
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: BigInt(file.size),
          kind,
          status: FileStatus.PENDING_UPLOAD,
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
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.CREATE,
          resource: "FileAsset",
          resourceId: created.id,
          after: {
            status: FileStatus.PENDING_UPLOAD,
            kind,
            sizeBytes: file.size,
            storagePath,
          },
        },
        tx,
      );
      return updated;
    });
  } catch {
    // Tx1 atomicity guarantee: the FileAsset row never committed. Nothing in
    // storage. No follow-up audit/cleanup required — return a structured 500
    // so the client gets a stable contract instead of an unhandled rejection.
    return jsonError(500, { error: "tx1_failed" });
  }

  // 8/9. Compress (IMAGE only) + upload to storage (outside tx — large I/O).
  // 10. On any failure, fail-closed FAILED transition on outer client.
  let finalPath = asset.storagePath;
  let finalMime = file.type;
  let compressionRatio: number | null = null;

  try {
    if (kind === FileKind.IMAGE) {
      const compressed = await compressImage(buffer);
      finalPath = asset.storagePath.replace(/\.[^.]+$/, ".jpg");
      finalMime = compressed.mimeType;
      compressionRatio = compressed.ratio;
      await uploadToStorage(
        bucketForKind(kind),
        finalPath,
        compressed.buffer,
        compressed.mimeType,
      );
    } else {
      await uploadToStorage(
        bucketForKind(kind),
        asset.storagePath,
        buffer,
        file.type,
      );
    }
  } catch {
    const code =
      kind === FileKind.IMAGE && !compressionRatio
        ? "compression_failed"
        : "storage_upload_failed";
    // Fail-closed FAILED transition. updateMany (NOT update) so a concurrent
    // future orphan-cleanup cron flipping the row to ORPHANED doesn't throw
    // here. Status guard pins the transition to PENDING_UPLOAD only.
    await prisma.fileAsset.updateMany({
      where: {
        id: asset.id,
        tenantId: session.tenantId,
        status: FileStatus.PENDING_UPLOAD,
      },
      data: { status: FileStatus.FAILED, updatedById: session.userId },
    });
    // Best-effort audit — updateMany already committed FAILED, so an audit
    // throw here must NOT swallow the structured 500 the client needs for
    // correlation. Per feature-dev:code-reviewer T5 finding M2.
    try {
      await writeAuditLog({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        action: AuditAction.UPDATE,
        resource: "FileAsset",
        resourceId: asset.id,
        before: { status: FileStatus.PENDING_UPLOAD },
        after: { status: FileStatus.FAILED, error: code },
      });
    } catch (auditErr) {
      console.error("[upload] failed-audit write threw", auditErr);
    }
    // Do NOT forward err.message verbatim — storage wrapper deliberately
    // strips path from its throws to avoid tenantId leakage in shared logs,
    // but err may be from sharp + carry decoder details. Static code only.
    return jsonError(500, { error: code, id: asset.id });
  }

  // 11. Tx2: COMPRESSED / UPLOADED transition + audit + signed URL.
  // Wrapped because storage upload already succeeded — a tx2 throw OR a
  // signed-URL throw would otherwise crash the route as an unhandled
  // rejection while leaving the bytes in storage and the row stuck at
  // PENDING_UPLOAD (orphan-cleanup cron eventually reconciles, deferred
  // p3+). Per feature-dev:code-reviewer T5 finding B1.
  let signedUrl: string;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.fileAsset.update({
        where: { id: asset.id, tenantId: session.tenantId },
        data: {
          status:
            kind === FileKind.IMAGE
              ? FileStatus.COMPRESSED
              : FileStatus.UPLOADED,
          compressedAt: kind === FileKind.IMAGE ? new Date() : null,
          compressionRatio:
            compressionRatio != null
              ? new Prisma.Decimal(compressionRatio)
              : null,
          mimeType: finalMime,
          storagePath: finalPath,
          updatedById: session.userId,
        },
      });
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.UPDATE,
          resource: "FileAsset",
          resourceId: asset.id,
          before: { status: FileStatus.PENDING_UPLOAD },
          after: {
            status:
              kind === FileKind.IMAGE
                ? FileStatus.COMPRESSED
                : FileStatus.UPLOADED,
            ...(compressionRatio != null ? { compressionRatio } : {}),
          },
        },
        tx,
      );
    });

    // 12. Signed URL (24h). Inside the same try so a signed-URL failure
    // also flips to FAILED rather than crashing.
    signedUrl = await createSignedUrl(
      bucketForKind(kind),
      finalPath,
      SIGNED_URL_TTL_SECONDS,
    );
  } catch {
    // Bytes are in storage but the transition row + signed URL didn't land.
    // Flip to FAILED so orphan-cleanup cron (p3+) can reconcile + delete.
    await prisma.fileAsset.updateMany({
      where: {
        id: asset.id,
        tenantId: session.tenantId,
        status: FileStatus.PENDING_UPLOAD,
      },
      data: { status: FileStatus.FAILED, updatedById: session.userId },
    });
    try {
      await writeAuditLog({
        tenantId: session.tenantId,
        actorUserId: session.userId,
        action: AuditAction.UPDATE,
        resource: "FileAsset",
        resourceId: asset.id,
        before: { status: FileStatus.PENDING_UPLOAD },
        after: { status: FileStatus.FAILED, error: "tx2_failed" },
      });
    } catch (auditErr) {
      console.error("[upload] tx2-failed audit write threw", auditErr);
    }
    return jsonError(500, { error: "tx2_failed", id: asset.id });
  }

  return NextResponse.json({
    id: asset.id,
    storagePath: finalPath,
    kind,
    status:
      kind === FileKind.IMAGE ? FileStatus.COMPRESSED : FileStatus.UPLOADED,
    ...(compressionRatio != null ? { compressionRatio } : {}),
    signedUrl,
  });
}
