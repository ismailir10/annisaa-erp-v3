// @vitest-environment node
//
// Unit tests for POST /api/upload (app/api/upload/route.ts).
//
// Mocked-prisma + mocked storage + mocked sharp tests covering: auth,
// validation (size + missing-field + mime/kind allowlist), happy IMAGE
// (compression + COMPRESSED transition + signedUrl), happy DOCUMENT
// (passthrough + UPLOADED), failure path (storage throw → FAILED with
// fail-closed updateMany guard + audit twice), tx threading (tx1 audit
// throw → no FileAsset committed).
//
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §5 + tests)

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — share state with vi.mock factories.
const {
  getSessionMock,
  fileAssetCreateMock,
  fileAssetUpdateMock,
  fileAssetUpdateManyMock,
  transactionMock,
  writeAuditLogMock,
  compressImageMock,
  uploadToStorageMock,
  createSignedUrlMock,
  bucketForKindMock,
  checkRateLimitMock,
  verifyMimeBytesMock,
  PRISMA_DECIMAL,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  fileAssetCreateMock: vi.fn(),
  fileAssetUpdateMock: vi.fn(),
  fileAssetUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  compressImageMock: vi.fn(),
  uploadToStorageMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  bucketForKindMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  verifyMimeBytesMock: vi.fn(),
  PRISMA_DECIMAL: class FakeDecimal {
    constructor(public n: number) {}
    toString() {
      return String(this.n);
    }
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    fileAsset: {
      create: fileAssetCreateMock,
      update: fileAssetUpdateMock,
      updateMany: fileAssetUpdateManyMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit/write", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/storage/sharp", () => ({
  compressImage: compressImageMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/storage/mime-verify", () => ({
  verifyMimeBytes: verifyMimeBytesMock,
}));

vi.mock("@/lib/storage/supabase", () => ({
  bucketForKind: bucketForKindMock,
  uploadToStorage: uploadToStorageMock,
  createSignedUrl: createSignedUrlMock,
}));

vi.mock("@/lib/generated/prisma/client", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    SOFT_DELETE: "SOFT_DELETE",
    RESTORE: "RESTORE",
    READ: "READ",
    IMPORT: "IMPORT",
    EXPORT: "EXPORT",
  },
  FileKind: {
    DOCUMENT: "DOCUMENT",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    AUDIO: "AUDIO",
    ARCHIVE: "ARCHIVE",
  },
  FileStatus: {
    PENDING_UPLOAD: "PENDING_UPLOAD",
    UPLOADED: "UPLOADED",
    COMPRESSED: "COMPRESSED",
    FAILED: "FAILED",
    ORPHANED: "ORPHANED",
  },
  Prisma: {
    Decimal: PRISMA_DECIMAL,
  },
}));

// NOTE: `@/lib/entities/_registry` is intentionally NOT mocked. The route
// imports `getPolicyByResource` from the registry, which transitively imports
// all 5 entity policies. Each policy imports `FileKind` from
// `@/lib/generated/prisma/client` — which IS mocked above. The hoisted client
// mock means every entity-policy module receives the stub `FileKind` strings
// at import time, so the test exercises the REAL registry against the real
// per-entity allowlist declarations. This catches drift if a future policy
// edit changes the allowlist shape (which is exactly what these tests gate).
//
// Trap to watch for in future cycles: if a new entity policy added to
// `lib/entities/_registry.ts` imports any module beyond `@/lib/generated/
// prisma/client` + `../_types` (e.g. `@/lib/db`, `next/headers`), this test
// will throw at import time with a cryptic resolution error instead of a
// readable test failure. At that point, either add an explicit
// `vi.mock("@/lib/entities/_registry", ...)` with a controlled stub, or
// extend the per-policy module's allowed dependency surface.
import { POST } from "../route";

// Session shape extended in p2-scaffold-canary T3 — `role` + `currentTermId`
// were added in p2-scaffold-pages SessionContext widening; the upload route
// now reads `session.role` for the FileKind allowlist gate. `admin` is the
// default test role because admin's allowlist includes IMAGE+DOCUMENT+ARCHIVE
// across every entity, so existing tests don't trip the new gate.
const SESSION = {
  tenantId: "t_1",
  userId: "u_1",
  supabaseUserId: "sup_1",
  role: "admin" as const,
  currentTermId: "at_1",
};

function makeReq(form: FormData): Request {
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

// `resource` defaults to "Student" so pre-existing tests don't need to set
// it explicitly. Pass `resource: undefined` to omit (covers missing-field
// cases). Pass `resource: "X"` to override (covers invalid-resource +
// per-entity gating cases).
function buildForm(args: {
  file?: File | null;
  kind?: string | null;
  resource?: string | null;
}): FormData {
  const fd = new FormData();
  if (args.file) fd.set("file", args.file);
  if (args.kind != null) fd.set("kind", args.kind);
  const resource = args.resource === undefined ? "Student" : args.resource;
  if (resource != null) fd.set("resource", resource);
  return fd;
}

beforeEach(() => {
  getSessionMock.mockReset();
  fileAssetCreateMock.mockReset();
  fileAssetUpdateMock.mockReset();
  fileAssetUpdateManyMock.mockReset();
  transactionMock.mockReset();
  writeAuditLogMock.mockReset();
  compressImageMock.mockReset();
  uploadToStorageMock.mockReset();
  createSignedUrlMock.mockReset();
  bucketForKindMock.mockReset();
  checkRateLimitMock.mockReset();
  verifyMimeBytesMock.mockReset();

  // Sensible defaults — individual tests override.
  getSessionMock.mockResolvedValue(SESSION);
  bucketForKindMock.mockImplementation((k: string) => k.toLowerCase() + "s");
  createSignedUrlMock.mockResolvedValue("https://signed.example/foo");
  writeAuditLogMock.mockResolvedValue(undefined);
  uploadToStorageMock.mockResolvedValue(undefined);
  // T8 wired collaborators — happy-path defaults; individual tests override.
  checkRateLimitMock.mockReturnValue({ ok: true, remaining: 59 });
  verifyMimeBytesMock.mockReturnValue({ ok: true });
  // tx mock: invoke callback with a `tx` proxy that hits the same mocks so
  // tx-vs-non-tx call-count assertions work uniformly.
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      fileAsset: {
        create: fileAssetCreateMock,
        update: fileAssetUpdateMock,
      },
    };
    return cb(tx);
  });
  fileAssetCreateMock.mockResolvedValue({
    id: "fa_1",
    storagePath: "",
    tenantId: SESSION.tenantId,
  });
  fileAssetUpdateMock.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      ...data,
    }),
  );
  fileAssetUpdateManyMock.mockResolvedValue({ count: 1 });
});

describe("POST /api/upload — auth", () => {
  it("returns 401 when getSession() returns null", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — validation", () => {
  it("returns 400 when `file` form field is missing", async () => {
    const res = await POST(makeReq(buildForm({ kind: "IMAGE" })) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_field", field: "file" });
  });

  it("returns 400 when `kind` form field is missing", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await POST(makeReq(buildForm({ file })) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_field", field: "kind" });
  });

  it("returns 400 when `kind` is not a valid FileKind enum member", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "BOGUS" })) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind", kind: "BOGUS" });
  });

  it("returns 400 when file.size exceeds 10 MiB", async () => {
    const oversized = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      "big.jpg",
      { type: "image/jpeg" },
    );
    const res = await POST(
      makeReq(buildForm({ file: oversized, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("file_too_large");
    expect(body.maxBytes).toBe(10 * 1024 * 1024);
    expect(body.sizeBytes).toBe(10 * 1024 * 1024 + 1);
  });

  it("returns 400 when MIME type does not match the kind allowlist", async () => {
    const pdfTaggedAsImage = new File(["%PDF-1.4"], "fake.pdf", {
      type: "application/pdf",
    });
    const res = await POST(
      makeReq(buildForm({ file: pdfTaggedAsImage, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("mime_kind_mismatch");
    expect(body.kind).toBe("IMAGE");
    expect(body.mimeType).toBe("application/pdf");
    expect(uploadToStorageMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — happy paths", () => {
  it("compresses an IMAGE kind, transitions to COMPRESSED, returns ratio + signedUrl + .jpg path", async () => {
    const compressedBuf = Buffer.from("compressed");
    compressImageMock.mockResolvedValueOnce({
      buffer: compressedBuf,
      mimeType: "image/jpeg",
      ratio: 0.3,
    });

    const file = new File([new Uint8Array(1024)], "photo.png", {
      type: "image/png",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("fa_1");
    expect(body.kind).toBe("IMAGE");
    expect(body.status).toBe("COMPRESSED");
    expect(body.compressionRatio).toBe(0.3);
    expect(body.signedUrl).toBe("https://signed.example/foo");
    expect(body.storagePath).toMatch(/\.jpg$/);
    expect(body.storagePath).toContain(`${SESSION.tenantId}/IMAGE/fa_1`);

    expect(compressImageMock).toHaveBeenCalledTimes(1);
    expect(uploadToStorageMock).toHaveBeenCalledWith(
      "images",
      expect.stringMatching(/\.jpg$/),
      compressedBuf,
      "image/jpeg",
    );
    // tx1 (insert + storagePath update) + tx2 (COMPRESSED transition).
    expect(transactionMock).toHaveBeenCalledTimes(2);
    // 2 audit calls: tx1 CREATE (PENDING_UPLOAD), tx2 UPDATE (COMPRESSED).
    // FAILED path NOT taken.
    expect(writeAuditLogMock).toHaveBeenCalledTimes(2);
    // S2 lock-in: audit `after` payload MUST NOT include originalName
    // (filenames may carry PII; FileAsset is not in @PII redactor allowlist).
    const tx1Audit = writeAuditLogMock.mock.calls[0][0];
    expect(tx1Audit.after.originalName).toBeUndefined();
    expect(fileAssetUpdateManyMock).not.toHaveBeenCalled();
  });

  it("passes a DOCUMENT kind through unchanged, transitions to UPLOADED, no compression, signedUrl returned", async () => {
    const file = new File([new Uint8Array(2048)], "scan.pdf", {
      type: "application/pdf",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "DOCUMENT" })) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kind).toBe("DOCUMENT");
    expect(body.status).toBe("UPLOADED");
    expect(body.compressionRatio).toBeUndefined();
    expect(body.signedUrl).toBe("https://signed.example/foo");
    expect(body.storagePath).toMatch(/\.pdf$/);

    expect(compressImageMock).not.toHaveBeenCalled();
    expect(uploadToStorageMock).toHaveBeenCalledWith(
      "documents",
      expect.stringMatching(/\.pdf$/),
      expect.any(Buffer),
      "application/pdf",
    );
    expect(fileAssetUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — failure path", () => {
  it("returns 500 + flips row to FAILED + audits the FAILED transition when storage throws", async () => {
    uploadToStorageMock.mockRejectedValueOnce(new Error("supabase 503"));
    const file = new File([new Uint8Array(512)], "doc.pdf", {
      type: "application/pdf",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "DOCUMENT" })) as never,
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "storage_upload_failed",
      id: "fa_1",
    });

    // updateMany flipped to FAILED with status guard.
    expect(fileAssetUpdateManyMock).toHaveBeenCalledTimes(1);
    const call = fileAssetUpdateManyMock.mock.calls[0][0];
    expect(call.where).toMatchObject({
      id: "fa_1",
      tenantId: SESSION.tenantId,
      status: "PENDING_UPLOAD",
    });
    expect(call.data.status).toBe("FAILED");

    // writeAuditLog called twice: tx1 CREATE (PENDING_UPLOAD) + outer FAILED.
    expect(writeAuditLogMock).toHaveBeenCalledTimes(2);
    const failedAudit = writeAuditLogMock.mock.calls[1][0];
    expect(failedAudit.action).toBe("UPDATE");
    expect(failedAudit.resource).toBe("FileAsset");
    expect(failedAudit.after).toMatchObject({
      status: "FAILED",
      error: "storage_upload_failed",
    });
  });
});

describe("POST /api/upload — tx threading", () => {
  it("returns 500 tx1_failed when tx1 audit-write throws (no FileAsset committed; no storage I/O)", async () => {
    // Tx1 path: writeAuditLog is invoked inside the tx callback. Make it
    // throw; the route catches at the tx1 boundary and returns a structured
    // 500 (B2 fix — previous contract was unhandled rejection / route crash).
    writeAuditLogMock.mockRejectedValueOnce(new Error("audit broke"));

    const file = new File([new Uint8Array(64)], "x.jpg", {
      type: "image/jpeg",
    });

    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "tx1_failed" });

    // Storage / sharp never invoked because tx1 threw before we reached them.
    expect(compressImageMock).not.toHaveBeenCalled();
    expect(uploadToStorageMock).not.toHaveBeenCalled();
    // Only tx1 ran (rejected); tx2 + outer FAILED path also never reached.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(fileAssetUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 500 tx2_failed + flips row to FAILED when tx2 throws after storage upload succeeds (B1 lock-in)", async () => {
    const compressedBuf = Buffer.from("c");
    compressImageMock.mockResolvedValueOnce({
      buffer: compressedBuf,
      mimeType: "image/jpeg",
      ratio: 0.4,
    });
    // First $transaction call (tx1) succeeds via the default mock; second
    // call (tx2) rejects.
    let txCallCount = 0;
    transactionMock.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        txCallCount += 1;
        if (txCallCount === 2) throw new Error("tx2 db blip");
        const tx = {
          fileAsset: {
            create: fileAssetCreateMock,
            update: fileAssetUpdateMock,
          },
        };
        return cb(tx);
      },
    );

    const file = new File([new Uint8Array(64)], "x.jpg", {
      type: "image/jpeg",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "tx2_failed", id: "fa_1" });

    // Storage upload happened (between tx1 + tx2).
    expect(uploadToStorageMock).toHaveBeenCalledTimes(1);
    // Outer FAILED transition with status guard.
    expect(fileAssetUpdateManyMock).toHaveBeenCalledTimes(1);
    const failedCall = fileAssetUpdateManyMock.mock.calls[0][0];
    expect(failedCall.where.status).toBe("PENDING_UPLOAD");
    expect(failedCall.data.status).toBe("FAILED");
    // Signed URL never created (failed before reaching it).
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — rate-limit (T8)", () => {
  it("returns 429 + Retry-After header when checkRateLimit rejects", async () => {
    checkRateLimitMock.mockReturnValueOnce({
      ok: false,
      retryAfterMs: 30_000,
    });
    const file = new File([new Uint8Array(64)], "x.jpg", {
      type: "image/jpeg",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      retryAfterMs: 30_000,
    });
    expect(res.headers.get("Retry-After")).toBe("30");
    // Per-user scope, keyed by session.userId.
    expect(checkRateLimitMock).toHaveBeenCalledWith({
      key: SESSION.userId,
      scope: "upload",
    });
    // Short-circuit before any file processing / storage I/O.
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
    expect(uploadToStorageMock).not.toHaveBeenCalled();
    expect(verifyMimeBytesMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — magic-byte MIME verify (T8)", () => {
  it("returns 400 invalid_mime when verifyMimeBytes rejects (content-type spoof)", async () => {
    const reason =
      "magic bytes for IMAGE did not match any expected signature";
    verifyMimeBytesMock.mockReturnValueOnce({ ok: false, reason });
    // Declared MIME passes the route's MIME_ALLOWLIST check (image/jpeg ∈
    // IMAGE), but the buffer's leading bytes don't match — the kind of
    // spoof T5+T8 are designed to reject.
    const file = new File([new Uint8Array(64)], "spoof.jpg", {
      type: "image/jpeg",
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE" })) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_mime", reason });
    // Verify was called with the kind enum value + buffer.
    expect(verifyMimeBytesMock).toHaveBeenCalledTimes(1);
    const [bufArg, kindArg] = verifyMimeBytesMock.mock.calls[0];
    expect(bufArg).toBeInstanceOf(Uint8Array);
    expect(kindArg).toBe("IMAGE");
    // Short-circuit before tx1 / sharp / storage.
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
    expect(compressImageMock).not.toHaveBeenCalled();
    expect(uploadToStorageMock).not.toHaveBeenCalled();
  });
});

// ── Role-based FileKind gating (p2-scaffold-canary T4) ───────────────────
// Route now consumes `policy.fileKindAllowlist[session.role]` resolved by
// `getPolicyByResource(form.resource)`. Fail-closed semantics:
//   - missing `resource` form field   → 400 missing_field
//   - unknown `resource`              → 400 invalid_resource
//   - role has no allowlist key       → 403 forbidden_kind
//   - role's allowlist excludes kind  → 403 forbidden_kind

describe("POST /api/upload — resource form-field validation", () => {
  it("returns 400 when `resource` form field is missing", async () => {
    const file = new File([new Uint8Array(64)], "a.pdf", { type: "application/pdf" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "DOCUMENT", resource: null })) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_field", field: "resource" });
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when `resource` does not match any registered policy", async () => {
    const file = new File([new Uint8Array(64)], "a.pdf", { type: "application/pdf" });
    const res = await POST(
      makeReq(
        buildForm({ file, kind: "DOCUMENT", resource: "NotARealEntity" }),
      ) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_resource",
      resource: "NotARealEntity",
    });
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload — role-FileKind allowlist gating (pass cases)", () => {
  it("admin uploads DOCUMENT to Guardian → proceeds (200)", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "admin" });
    const file = new File([new Uint8Array(64)], "g.pdf", { type: "application/pdf" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "DOCUMENT", resource: "Guardian" })) as never,
    );
    expect(res.status).toBe(200);
    expect(fileAssetCreateMock).toHaveBeenCalledTimes(1);
  });

  it("admin uploads IMAGE to Student → proceeds (200)", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "admin" });
    const file = new File([new Uint8Array(64)], "s.jpg", { type: "image/jpeg" });
    compressImageMock.mockResolvedValue({
      buffer: Buffer.from(new Uint8Array(32)),
      mimeType: "image/jpeg",
      ratio: 0.5,
    });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE", resource: "Student" })) as never,
    );
    expect(res.status).toBe(200);
    expect(compressImageMock).toHaveBeenCalledTimes(1);
  });

  it("admission_officer uploads DOCUMENT to Household → proceeds (200)", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "admission_officer" });
    const file = new File([new Uint8Array(64)], "kk.pdf", { type: "application/pdf" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "DOCUMENT", resource: "Household" })) as never,
    );
    expect(res.status).toBe(200);
    expect(fileAssetCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/upload — role-FileKind allowlist gating (fail cases)", () => {
  it("kadiv uploads IMAGE to Guardian → 403 forbidden_kind (kadiv allowlist on Guardian is [DOCUMENT])", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "kadiv" });
    const file = new File([new Uint8Array(64)], "img.jpg", { type: "image/jpeg" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE", resource: "Guardian" })) as never,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden_kind",
      resource: "Guardian",
      role: "kadiv",
      kind: "IMAGE",
    });
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });

  it("finance_officer uploads DOCUMENT to Household → 403 forbidden_kind (FO has no allowlist key on Household)", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "finance_officer" });
    const file = new File([new Uint8Array(64)], "x.pdf", { type: "application/pdf" });
    const res = await POST(
      makeReq(
        buildForm({ file, kind: "DOCUMENT", resource: "Household" }),
      ) as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden_kind");
    expect(body.role).toBe("finance_officer");
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });

  it("parent uploads IMAGE to Student → 403 forbidden_kind (parent omitted from Student allowlist — read-only)", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "parent" });
    const file = new File([new Uint8Array(64)], "p.jpg", { type: "image/jpeg" });
    const res = await POST(
      makeReq(buildForm({ file, kind: "IMAGE", resource: "Student" })) as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden_kind");
    expect(body.role).toBe("parent");
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });

  it("admin uploads IMAGE to GuardianInvitation → 403 forbidden_kind (GuardianInvitation.fileKindAllowlist is empty {})", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION, role: "admin" });
    const file = new File([new Uint8Array(64)], "i.jpg", { type: "image/jpeg" });
    const res = await POST(
      makeReq(
        buildForm({ file, kind: "IMAGE", resource: "GuardianInvitation" }),
      ) as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden_kind");
    expect(body.resource).toBe("GuardianInvitation");
    expect(fileAssetCreateMock).not.toHaveBeenCalled();
  });
});
