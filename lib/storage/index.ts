/**
 * Entity-generic local-disk storage adapter.
 *
 * Foundation for T3 (Student photo) and T14 (Parent KTP / KK). The adapter is
 * deliberately interface-compatible with a future S3 / Supabase Storage swap:
 *   - `saveFile` returns an opaque `token` (not a public URL).
 *   - `streamFile` resolves a token to a stream + MIME + filename via
 *     authenticated API routes only.
 *   - `deleteFile` is best-effort.
 *
 * Storage location:
 *   `${UPLOAD_DIR ?? <cwd>/.data/uploads}/<entity>/<entityId>/<field>-<hash>.<ext>`
 *
 * Why `.data/` and not `public/`:
 *   Next.js statically serves anything under `public/` with zero auth. KTP +
 *   KK are sensitive PII under UU PDP 27/2022; serving them via the static
 *   handler is a data-protection breach. We keep photos under the same
 *   adapter so a single hardening review covers both.
 *
 * Token format (`local:v1:<entity>/<entityId>/<field>-<hash16>.<ext>`):
 *   - `local:` prefix lets a later S3 adapter coexist (`s3:...`).
 *   - `v1:` reserves room for a future token format bump.
 *   - The path segment is REGENERATED into a canonical filesystem path on
 *     every read; we never `path.join(base, untrustedSegment)` without
 *     re-checking that the resolved path stays inside `base`
 *     (path-traversal defense).
 *   - Hash is the first 16 hex chars of sha256(bytes). Deterministic — the
 *     same file uploaded twice for the same field overwrites in place.
 *
 * Entity-generic: NEVER hardcode "students" / "photo" / "parent" / "ktp"
 * inside this module. T14 re-uses every line of this file.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import { createReadStream } from "fs";
import path from "path";

export type SaveArgs = {
  entity: string;
  entityId: string;
  field: string;
  file: { bytes: Buffer; mimeType: string; ext: string };
};

export type SaveResult = { token: string };

export type StreamResult = {
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
  filename: string;
};

const TOKEN_PREFIX = "local:v1:";

// Allow ext: jpg | jpeg | png | pdf (PDF reserved for T14). Strict whitelist
// — anything else means the upload route forgot to call detectMime().
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "pdf"]);

// Identifier segments: alphanumeric, dash, underscore. Tight enough that
// `path.join` cannot escape via `..`, slashes, or null bytes.
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

export function getBaseDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads");
}

function assertSafeSegment(segment: string, label: string): void {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(
      `Invalid ${label} segment ${JSON.stringify(segment)} — must match ${SAFE_SEGMENT}`,
    );
  }
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/**
 * Persist `file` to disk and return an opaque token. Idempotent on bytes:
 * uploading the same content twice yields the same token + overwrites in
 * place (so we don't accumulate orphan files when a user re-uploads).
 */
export async function saveFile(args: SaveArgs): Promise<SaveResult> {
  const { entity, entityId, field, file } = args;
  assertSafeSegment(entity, "entity");
  assertSafeSegment(entityId, "entityId");
  assertSafeSegment(field, "field");
  const ext = file.ext.toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(`Unsupported ext ${JSON.stringify(ext)}`);
  }

  const hash = hashBytes(file.bytes);
  const filename = `${field}-${hash}.${ext}`;
  const base = getBaseDir();
  const dir = path.join(base, entity, entityId);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, file.bytes);

  const token = `${TOKEN_PREFIX}${entity}/${entityId}/${filename}`;
  return { token };
}

/**
 * Parse a token + return the resolved filesystem path + ext.
 *
 * Path-traversal defense: after resolving the path we assert it lives inside
 * `base`. An attacker who guesses a token like
 * `local:v1:../../../etc/passwd` is rejected because the resolved path
 * escapes `base`.
 */
function resolveTokenPath(token: string): { fullPath: string; filename: string; ext: string } {
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new Error("Invalid storage token (wrong prefix)");
  }
  const rest = token.slice(TOKEN_PREFIX.length);

  // Expected shape: <entity>/<entityId>/<field>-<hash>.<ext>
  // Anything containing `..` or backslash or absolute path is rejected
  // before we touch path.join.
  if (
    rest.length === 0 ||
    rest.includes("..") ||
    rest.includes("\\") ||
    rest.startsWith("/") ||
    rest.includes("\0")
  ) {
    throw new Error("Invalid storage token (path traversal attempt)");
  }
  const parts = rest.split("/");
  if (parts.length !== 3) {
    throw new Error("Invalid storage token (shape)");
  }
  const [entity, entityId, filename] = parts;
  assertSafeSegment(entity, "entity");
  assertSafeSegment(entityId, "entityId");
  // Filename: must match `<field>-<hash>.<ext>` with only safe chars.
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    throw new Error("Invalid storage token (filename)");
  }
  const dotIdx = filename.lastIndexOf(".");
  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error("Invalid storage token (ext)");
  }

  const base = path.resolve(getBaseDir());
  const fullPath = path.resolve(path.join(base, entity, entityId, filename));
  // Belt-and-braces traversal guard: the resolved path MUST be a child of
  // `base`. Without this guard a future change to ALLOWED_EXTS or the
  // segment regex could open a hole.
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  if (!fullPath.startsWith(baseWithSep)) {
    throw new Error("Invalid storage token (path escapes base)");
  }
  return { fullPath, filename, ext };
}

/**
 * Stream the file referenced by `token`. Throws on missing file or any
 * token validation failure.
 *
 * Callers (API routes) are responsible for the auth check — this adapter
 * has no concept of "who". It assumes its caller has already gated on
 * `requireAdmin` or a guardian-link check.
 */
export async function streamFile(token: string): Promise<StreamResult> {
  const { fullPath, filename, ext } = resolveTokenPath(token);
  // Stat first so we can fail with a clean ENOENT instead of leaking a
  // partially-opened stream when the underlying file disappears.
  await fs.stat(fullPath);
  // realpath defense: even though resolveTokenPath asserts the resolved path
  // stays under base, a symlink ALREADY ON DISK could escape (e.g. a malicious
  // file placed by another process pointing at /etc/passwd). Resolve symlinks
  // and re-assert containment. Cheap insurance for sensitive PII (KTP/KK).
  const realFullPath = await fs.realpath(fullPath);
  const realBase = await fs.realpath(path.resolve(getBaseDir()));
  const realBaseWithSep = realBase.endsWith(path.sep) ? realBase : realBase + path.sep;
  if (!realFullPath.startsWith(realBaseWithSep)) {
    throw new Error("Invalid storage token (symlink escape)");
  }
  const nodeStream = createReadStream(realFullPath);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        controller.enqueue(
          typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk),
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
  const mimeType = EXT_TO_MIME[ext] ?? "application/octet-stream";
  return { stream, mimeType, filename };
}

/**
 * Best-effort delete. Swallows ENOENT — the caller wants the file gone, and
 * "already gone" is a success. Any other error propagates.
 */
export async function deleteFile(token: string): Promise<void> {
  let fullPath: string;
  try {
    fullPath = resolveTokenPath(token).fullPath;
  } catch {
    // Invalid token → treat as "nothing to delete". Caller nulled out the
    // DB column and that is the user-visible outcome that matters.
    return;
  }
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return;
    throw err;
  }
}

// Exported for tests that need to assert path resolution / token parsing.
export const __internal = { resolveTokenPath, TOKEN_PREFIX };
