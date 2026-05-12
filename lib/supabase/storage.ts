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
  // Real SDK shape (FileObjectV2 camelized): data.contentType and data.size at root
  const mimetype = (data as unknown as { contentType?: string }).contentType ?? "";
  const size = (data as unknown as { size?: number }).size ?? 0;
  if (!ALLOWED_MIME.has(mimetype)) {
    return { ok: false, reason: `MIME ${mimetype} not in allowlist` };
  }
  if (size > MAX_BYTES) {
    return { ok: false, reason: `Size ${size} exceeds 5 MB cap` };
  }
  return { ok: true, mimetype, size };
}
