import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @supabase/supabase-js BEFORE importing the module under test. The
// mock factory is hoisted by vitest, so its closures cannot reference outer
// `const`s — use `vi.hoisted` to define the mock fns alongside the factory.
const { uploadMock, downloadMock, removeMock, fromMock, createClientMock } = vi.hoisted(() => {
  const upload = vi.fn();
  const download = vi.fn();
  const remove = vi.fn();
  const from = vi.fn(() => ({ upload, download, remove }));
  const createClient = vi.fn(() => ({ storage: { from } }));
  return {
    uploadMock: upload,
    downloadMock: download,
    removeMock: remove,
    fromMock: from,
    createClientMock: createClient,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import {
  getSupabaseStorageClient,
  getBucketName,
  uploadObject,
  downloadObject,
  removeObject,
  __testHelpers,
} from "../supabase";

let originalUrl: string | undefined;
let originalKey: string | undefined;
let originalBucket: string | undefined;

beforeEach(() => {
  originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  originalBucket = process.env.STORAGE_SUPABASE_BUCKET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  __testHelpers.resetCache();
  uploadMock.mockReset();
  downloadMock.mockReset();
  removeMock.mockReset();
  fromMock.mockClear();
  createClientMock.mockClear();
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  if (originalBucket === undefined) delete process.env.STORAGE_SUPABASE_BUCKET;
  else process.env.STORAGE_SUPABASE_BUCKET = originalBucket;
});

describe("getSupabaseStorageClient", () => {
  it("throws a clear error when NEXT_PUBLIC_SUPABASE_URL missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseStorageClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws a clear error when SUPABASE_SERVICE_ROLE_KEY missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getSupabaseStorageClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("caches the client across calls (only createClient once)", () => {
    const a = getSupabaseStorageClient();
    const b = getSupabaseStorageClient();
    expect(a).toBe(b);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("createClient is called with auth.persistSession=false", () => {
    getSupabaseStorageClient();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-service-role-key",
      { auth: { persistSession: false } },
    );
  });
});

describe("getBucketName", () => {
  it("defaults to 'attachments' when STORAGE_SUPABASE_BUCKET unset", () => {
    delete process.env.STORAGE_SUPABASE_BUCKET;
    expect(getBucketName()).toBe("attachments");
  });

  it("respects STORAGE_SUPABASE_BUCKET when set", () => {
    process.env.STORAGE_SUPABASE_BUCKET = "attachments-preview";
    expect(getBucketName()).toBe("attachments-preview");
  });
});

describe("uploadObject", () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

  it("calls .upload with upsert=true + correct contentType", async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: "students/x/photo-abc.jpg" }, error: null });
    await uploadObject({ path: "students/x/photo-abc.jpg", bytes, mimeType: "image/jpeg" });
    expect(fromMock).toHaveBeenCalledWith("attachments");
    expect(uploadMock).toHaveBeenCalledWith(
      "students/x/photo-abc.jpg",
      bytes,
      { contentType: "image/jpeg", upsert: true },
    );
  });

  it("rejects when Supabase returns an error", async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: new Error("bucket full") });
    await expect(
      uploadObject({ path: "students/x/photo-abc.jpg", bytes, mimeType: "image/jpeg" }),
    ).rejects.toThrow(/bucket full/);
  });
});

describe("downloadObject", () => {
  it("returns bytes + mimeType when object exists", async () => {
    const bodyBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([bodyBytes], { type: "image/png" });
    downloadMock.mockResolvedValueOnce({ data: blob, error: null });

    const result = await downloadObject("students/x/photo-abc.png");
    expect(result.mimeType).toBe("image/png");
    expect(Buffer.from(bodyBytes).equals(result.bytes)).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("attachments");
    expect(downloadMock).toHaveBeenCalledWith("students/x/photo-abc.png");
  });

  it("throws Error('ENOENT') on Supabase error", async () => {
    downloadMock.mockResolvedValueOnce({ data: null, error: new Error("Object not found") });
    await expect(downloadObject("students/x/missing.jpg")).rejects.toThrow(/ENOENT/);
  });

  it("throws Error('ENOENT') when data is null without an error", async () => {
    downloadMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(downloadObject("students/x/missing.jpg")).rejects.toThrow(/ENOENT/);
  });

  it("falls back to application/octet-stream when Blob has no type", async () => {
    const blob = new Blob([new Uint8Array([0x00])]);
    downloadMock.mockResolvedValueOnce({ data: blob, error: null });
    const result = await downloadObject("students/x/photo-abc.bin");
    expect(result.mimeType).toBe("application/octet-stream");
  });
});

describe("removeObject", () => {
  it("calls .remove with [path]", async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: null });
    await removeObject("students/x/photo-abc.jpg");
    expect(removeMock).toHaveBeenCalledWith(["students/x/photo-abc.jpg"]);
  });

  it("swallows 'not found' errors (best-effort delete)", async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: new Error("Object not found") });
    await expect(removeObject("students/x/gone.jpg")).resolves.toBeUndefined();
  });

  it("rethrows non-'not found' errors", async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: new Error("connection reset") });
    await expect(removeObject("students/x/photo.jpg")).rejects.toThrow(/connection reset/);
  });
});
