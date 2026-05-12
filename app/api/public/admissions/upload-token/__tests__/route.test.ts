import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    admission: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase/storage", () => ({
  ADMISSION_FILE_KINDS: ["id-card-ayah", "id-card-ibu", "id-card-wali", "family-card"],
  ALLOWED_EXTENSIONS: ["jpg", "jpeg", "png", "webp", "pdf"],
  buildAdmissionFilePath: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { POST } from "../route";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/supabase/storage";
import * as rl from "@/lib/rate-limit";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/public/admissions/upload-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (rl.rateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ success: true, remaining: 99 });
});

describe("POST /api/public/admissions/upload-token", () => {
  it("rejects malformed body with 400", async () => {
    const res = await POST(makeReq({ admissionId: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects when rate limit exceeded with 429", async () => {
    (rl.rateLimit as ReturnType<typeof vi.fn>).mockReturnValue({ success: false, remaining: 0 });
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(429);
  });

  it("rejects when admission does not exist with 404", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(404);
  });

  it("rejects when admission status is terminal with 409", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "adm1",
      tenantId: "tnt1",
      status: "REGISTERED",
    });
    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(409);
  });

  it("returns signed url on success", async () => {
    (prisma.admission.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "adm1",
      tenantId: "tnt1",
      status: "VISITED",
    });
    (storage.buildAdmissionFilePath as ReturnType<typeof vi.fn>).mockReturnValue(
      "tenant/tnt1/admission/adm1/family-card-uuid.pdf",
    );
    (storage.createSignedUploadUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      signedUrl: "https://x.supabase.co/sign/up",
      token: "tk",
      path: "tenant/tnt1/admission/adm1/family-card-uuid.pdf",
    });

    const res = await POST(makeReq({ admissionId: "adm1", kind: "family-card", ext: "pdf" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signedUrl).toBe("https://x.supabase.co/sign/up");
    expect(json.path).toMatch(/tenant\/tnt1\/admission\/adm1\/family-card-/);
  });

  it("rejects unknown file kind with 400", async () => {
    const res = await POST(makeReq({ admissionId: "adm1", kind: "passport", ext: "pdf" }));
    expect(res.status).toBe(400);
  });
});
