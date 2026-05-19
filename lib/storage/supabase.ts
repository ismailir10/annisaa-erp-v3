/**
 * Service-role Supabase Storage primitives — the backend that `saveFile` /
 * `streamFile` / `deleteFile` in `lib/storage/index.ts` route through.
 *
 * Why a separate file: every Supabase-SDK call lives here so the storage
 * adapter has one direction of imports + the backend can be swapped again
 * (e.g. to S3) without touching `lib/storage/index.ts`.
 *
 * Service role bypasses RLS — that is the point. The bucket has no public
 * policies, so the service-role client is the only thing that can read or
 * write. Auth gating is the API route's job, not the bucket's.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Return a singleton service-role client. Throws a clear error if the env
 * vars are missing — fail-fast over silent local-only behavior.
 */
export function getSupabaseStorageClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service-role storage not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * The bucket every storage call routes through. Centralised so a future
 * per-env override (e.g. `attachments-preview`) is a one-line change.
 */
export function getBucketName(): string {
  return process.env.STORAGE_SUPABASE_BUCKET ?? "attachments";
}

export type UploadArgs = {
  path: string;
  bytes: Buffer;
  mimeType: string;
};

/**
 * Upload `bytes` to `path` inside the configured bucket. `upsert: true`
 * mirrors the prior local adapter's content-addressed overwrite — same
 * hash → same path → in-place replace, no orphans.
 */
export async function uploadObject(args: UploadArgs): Promise<void> {
  const client = getSupabaseStorageClient();
  const { error } = await client.storage
    .from(getBucketName())
    .upload(args.path, args.bytes, {
      contentType: args.mimeType,
      upsert: true,
    });
  if (error) throw error;
}

export type DownloadResult = {
  bytes: Buffer;
  mimeType: string;
};

/**
 * Download object at `path`. Throws `Error("ENOENT")` on missing object —
 * the caller's existing 404 branch fires unchanged.
 */
export async function downloadObject(path: string): Promise<DownloadResult> {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(getBucketName()).download(path);
  if (error || !data) {
    throw new Error("ENOENT");
  }
  const arrayBuffer = await data.arrayBuffer();
  const mimeType = data.type || "application/octet-stream";
  return { bytes: Buffer.from(arrayBuffer), mimeType };
}

/**
 * Best-effort delete. "Not found" responses swallow silently so callers can
 * idempotently delete on user action without spurious errors.
 */
export async function removeObject(path: string): Promise<void> {
  const client = getSupabaseStorageClient();
  const { error } = await client.storage.from(getBucketName()).remove([path]);
  if (error) {
    if (/not.*found/i.test(error.message)) return;
    throw error;
  }
}

/** Test-only: drop the cached client so `vi.mock` of `createClient` takes effect each test. */
export const __testHelpers = {
  resetCache(): void {
    cachedClient = null;
  },
};
