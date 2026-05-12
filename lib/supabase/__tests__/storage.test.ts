import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only throws outside Next.js — stub it for the test environment
vi.mock("server-only", () => ({}));

vi.mock("../service-client", () => {
  const upload = vi.fn();
  const createSignedUploadUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const info = vi.fn();
  return {
    getServiceClient: () => ({
      storage: {
        from: vi.fn(() => ({
          upload,
          createSignedUploadUrl,
          createSignedUrl,
          remove,
          info,
        })),
      },
    }),
    __mocks: { upload, createSignedUploadUrl, createSignedUrl, remove, info },
  };
});

import * as storage from "../storage";
import * as svc from "../service-client";

const m = (svc as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
});

describe("buildAdmissionFilePath", () => {
  it("composes the canonical bucket path", () => {
    const p = storage.buildAdmissionFilePath("tnt1", "adm1", "id-card-ayah", "jpg", "fixed-uuid");
    expect(p).toBe("tenant/tnt1/admission/adm1/id-card-ayah-fixed-uuid.jpg");
  });

  it("rejects unknown kind", () => {
    expect(() =>
      storage.buildAdmissionFilePath("t", "a", "passport" as unknown as storage.AdmissionFileKind, "jpg"),
    ).toThrow(/kind/i);
  });

  it("rejects unsafe characters in tenant or admission id", () => {
    expect(() => storage.buildAdmissionFilePath("t/../etc", "a", "family-card", "jpg")).toThrow();
    expect(() => storage.buildAdmissionFilePath("t", "a..b", "family-card", "jpg")).toThrow();
  });

  it("rejects unsupported extensions", () => {
    expect(() => storage.buildAdmissionFilePath("t", "a", "family-card", "exe")).toThrow(/extension/i);
  });
});

describe("createSignedUploadUrl", () => {
  it("returns the signed url + path", async () => {
    m.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://x.supabase.co/sign/up", token: "tk", path: "tenant/tnt1/admission/adm1/family-card-x.pdf" },
      error: null,
    });
    const r = await storage.createSignedUploadUrl("tenant/tnt1/admission/adm1/family-card-x.pdf");
    expect(r.signedUrl).toBe("https://x.supabase.co/sign/up");
    expect(r.path).toBe("tenant/tnt1/admission/adm1/family-card-x.pdf");
    expect(m.createSignedUploadUrl).toHaveBeenCalledWith(
      "tenant/tnt1/admission/adm1/family-card-x.pdf",
      { upsert: false },
    );
  });

  it("throws on supabase error", async () => {
    m.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(storage.createSignedUploadUrl("p")).rejects.toThrow(/boom/);
  });
});

describe("createSignedDownloadUrl", () => {
  it("delegates with explicit TTL", async () => {
    m.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/dl" }, error: null });
    const r = await storage.createSignedDownloadUrl("p", 60);
    expect(r.signedUrl).toBe("https://x/dl");
    expect(m.createSignedUrl).toHaveBeenCalledWith("p", 60);
  });
});

describe("validateUploadedFile", () => {
  it("returns ok=true when info() succeeds with allowlist MIME and size", async () => {
    // Real SDK shape: data.contentType and data.size at root (camelized from content_type/size)
    m.info.mockResolvedValue({
      data: { contentType: "image/jpeg", size: 1024 },
      error: null,
    });
    const r = await storage.validateUploadedFile("tenant/tnt1/admission/adm1/family-card-x.jpg");
    expect(r).toEqual({ ok: true, mimetype: "image/jpeg", size: 1024 });
  });

  it("returns ok=false when MIME outside allowlist", async () => {
    m.info.mockResolvedValue({
      data: { contentType: "image/heic", size: 1024 },
      error: null,
    });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/mime/i);
  });

  it("returns ok=false when size > 5MB", async () => {
    m.info.mockResolvedValue({
      data: { contentType: "image/jpeg", size: 5_242_881 },
      error: null,
    });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/size|5\s*mb/i);
  });

  it("returns ok=false when info errors (file missing)", async () => {
    m.info.mockResolvedValue({ data: null, error: { message: "not found" } });
    const r = await storage.validateUploadedFile("p");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not found|missing/i);
  });
});

describe("deleteFile", () => {
  it("calls remove with single path array", async () => {
    m.remove.mockResolvedValue({ data: [{ name: "p" }], error: null });
    await storage.deleteFile("p");
    expect(m.remove).toHaveBeenCalledWith(["p"]);
  });

  it("throws on supabase error", async () => {
    m.remove.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(storage.deleteFile("p")).rejects.toThrow(/denied/);
  });
});
