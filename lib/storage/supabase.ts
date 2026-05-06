// Supabase Storage wrapper — server-only service-role client.
//
// Thin wrapper around `@supabase/supabase-js` Storage methods used by the
// /api/upload route (and, later, the orphan-cleanup cron + ExportJob worker).
// Uses the service-role key so writes bypass RLS — the /api/upload route
// itself is the tenant boundary (auth + path prefix `<tenantId>/...` enforced
// before these helpers are called). Reads from buckets remain RLS-gated for
// any client-bundle path; that is NOT this file's concern.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §16.1
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md
// Storage runbook: docs/cycles/2026-05-05-p1-audit-timeline-files.md §380-467
//
// Server-only by construction: the lazy singleton in `getServiceClient()`
// throws if `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is
// missing — accidental client-bundle inclusion fails fast at runtime. The
// `server-only` npm shim is NOT installed in this repo (verified at /spec
// time); the env-throw is the boundary marker, identical reasoning to
// `lib/audit/write.ts` relying on the prisma DATABASE_URL throw.
//
// Bucket layout: ONE bucket per FileKind, tenant-scoped via the path prefix
// `<tenantId>/<kind>/<cuid>.<ext>` (NOT one bucket per tenant per kind).
// Decision recorded in cycle Assumption §1 — the path convention + the RLS
// policy `name LIKE current_setting('request.jwt.claims')::json->>'tenant_id'
// || '/%'` only make sense with a shared per-kind bucket. Five buckets total:
// documents, images, videos, audios, archives. `bucketForKind()` is the
// single source of truth for the FileKind→bucket mapping.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FileKind } from "@/lib/generated/prisma/client";

const BUCKETS = Object.freeze({
  DOCUMENT: "documents",
  IMAGE: "images",
  VIDEO: "videos",
  AUDIO: "audios",
  ARCHIVE: "archives",
} as const satisfies Record<FileKind, string>);

let client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "lib/storage/supabase.ts: NEXT_PUBLIC_SUPABASE_URL required",
    );
  }
  if (!key) {
    throw new Error(
      "lib/storage/supabase.ts: SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Throw messages intentionally exclude `path` (which embeds tenantId) to
// prevent cross-tenant tenantId leakage via shared logs (Vercel function logs,
// Sentry, etc.) when ops staff inspect failures across tenants. Callers that
// need the path for correlation must thread it through their own structured
// log on the catch side.
export async function uploadToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await getServiceClient()
    .storage.from(bucket)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) {
    throw new Error(
      `lib/storage/supabase.ts: upload failed bucket=${bucket}: ${error.message}`,
    );
  }
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string> {
  const { data, error } = await getServiceClient()
    .storage.from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (error) {
    throw new Error(
      `lib/storage/supabase.ts: createSignedUrl failed bucket=${bucket}: ${error.message}`,
    );
  }
  if (!data?.signedUrl) {
    throw new Error(
      `lib/storage/supabase.ts: createSignedUrl returned no signedUrl bucket=${bucket}`,
    );
  }
  return data.signedUrl;
}

export async function deleteFromStorage(
  bucket: string,
  path: string,
): Promise<void> {
  const { error } = await getServiceClient()
    .storage.from(bucket)
    .remove([path]);
  if (error) {
    throw new Error(
      `lib/storage/supabase.ts: delete failed bucket=${bucket}: ${error.message}`,
    );
  }
}

export function bucketForKind(kind: FileKind): string {
  const bucket = BUCKETS[kind as keyof typeof BUCKETS];
  // Defensive throw — `as const satisfies Record<FileKind, string>` enforces
  // exhaustiveness at compile time AFTER `prisma generate` has run, but a cold
  // CI clone that calls this before generate would silently pass `undefined`
  // through to the storage SDK with a cryptic error. Per spec acceptance.
  if (!bucket) {
    throw new Error(
      `lib/storage/supabase.ts: bucketForKind: unknown kind '${kind}'`,
    );
  }
  return bucket;
}
