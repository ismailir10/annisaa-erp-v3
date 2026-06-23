import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CONSENT_VERSION } from "@/lib/enrollment/consent-clauses";

const { findUnique, updateMany, programFindFirst } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  programFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    enrollmentApplication: { findUnique, updateMany },
    program: { findFirst: programFindFirst },
  },
}));

import { POST } from "../route";
import { __resetRateLimitForTest } from "@/lib/rate-limit";

const future = new Date(Date.now() + 86_400_000);
const ctx = { params: Promise.resolve({ token: "tok" }) };

function validBody() {
  return {
    programId: "c" + "a".repeat(24),
    dcareAddon: false,
    studentData: {
      childName: "Aisyah Putri",
      childGender: "P",
      birthPlace: "Bekasi",
      dateOfBirth: "2021-03-15",
      agama: "ISLAM",
      kewarganegaraan: "WNI",
    },
    ayahData: { name: "Bapak Ahmad" },
    ibuData: { name: "Ibu Fatimah" },
    consentData: {
      agreed: true,
      version: CONSENT_VERSION,
      ayah: { name: "Bapak Ahmad", signatureToken: "supabase:v1:enrollment/a/ayah-signature-1.png" },
      ibu: { name: "Ibu Fatimah", signatureToken: "supabase:v1:enrollment/a/ibu-signature-2.png" },
    },
  };
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/enrollments/token/tok/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTest();
  findUnique.mockResolvedValue({ id: "a", status: "INVITED", tokenExpiresAt: future, tenantId: "t-1" });
  updateMany.mockResolvedValue({ count: 1 });
  programFindFirst.mockResolvedValue({ id: "c" + "a".repeat(24) }); // program owned by tenant
});

describe("POST /api/enrollments/token/[token]/submit", () => {
  it("422 on validation failure (missing required field)", async () => {
    const b = validBody();
    b.studentData.childName = "";
    const res = await POST(req(b), ctx);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("validation_failed");
    expect(json.fields["studentData.childName"]).toBeTruthy();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("flips INVITED→SUBMITTED, stamps signedAt, and persists blobs", async () => {
    const res = await POST(req(validBody()), ctx);
    expect(res.status).toBe(201);
    expect((await res.json())).toEqual({ ok: true, id: "a" });
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "a", status: "INVITED" });
    expect(arg.data.status).toBe("SUBMITTED");
    expect(arg.data.submittedAt).toBeInstanceOf(Date);
    expect(arg.data.childName).toBe("Aisyah Putri");
    expect(arg.data.consentData.ayah.signedAt).toBeTruthy();
    expect(arg.data.consentData.ibu.signedAt).toBeTruthy();
  });

  it("409 when the row was already submitted (resolve guard)", async () => {
    findUnique.mockResolvedValue({ id: "a", status: "SUBMITTED", tokenExpiresAt: future });
    const res = await POST(req(validBody()), ctx);
    expect(res.status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("409 when the INVITED→SUBMITTED race is lost (updateMany count 0)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(validBody()), ctx);
    expect(res.status).toBe(409);
  });

  it("404 for an unknown token", async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(req(validBody()), ctx);
    expect(res.status).toBe(404);
  });

  it("422 when the chosen program is not in the application's tenant (IDOR guard)", async () => {
    programFindFirst.mockResolvedValue(null);
    const res = await POST(req(validBody()), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).fields.programId).toBe("Program tidak valid");
    expect(updateMany).not.toHaveBeenCalled();
  });
});
