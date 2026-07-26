import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { tenantFindFirst, admissionCreate, admissionUpdate, programFindFirst, detectSibling, sendAdmissionSubmittedEmail } =
  vi.hoisted(() => ({
    tenantFindFirst: vi.fn(),
    admissionCreate: vi.fn(),
    admissionUpdate: vi.fn(),
    programFindFirst: vi.fn(),
    detectSibling: vi.fn(),
    sendAdmissionSubmittedEmail: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findFirst: tenantFindFirst },
    admission: { create: admissionCreate, update: admissionUpdate },
    program: { findFirst: programFindFirst },
  },
}));
vi.mock("@/lib/admission/sibling-detect", () => ({ detectSibling }));
vi.mock("@/lib/email/admission-submitted", () => ({ sendAdmissionSubmittedEmail }));

import { POST } from "../route";
import { __resetRateLimitForTest } from "@/lib/rate-limit";

const VALID = {
  childName: "Aisyah Putri",
  dateOfBirth: "2020-03-15",
  childGender: "P" as const,
  parentName: "Ibu Fatimah",
  parentPhone: "081234567890",
};

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admission/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTest();
  tenantFindFirst.mockResolvedValue({ id: "tenant_annisaa" });
  admissionCreate.mockResolvedValue({ id: "adm-1" });
  detectSibling.mockResolvedValue(null);
  sendAdmissionSubmittedEmail.mockResolvedValue({ sent: true });
});

describe("POST /api/admission/submit — programId tenant guard", () => {
  it("persists a prefixed programId that belongs to the resolved tenant", async () => {
    programFindFirst.mockResolvedValue({ id: "program_ab57fd0432e25d5b3013" });
    const res = await POST(req({ ...VALID, programId: "program_ab57fd0432e25d5b3013" }));
    expect(res.status).toBe(201);
    expect(admissionCreate.mock.calls[0][0].data.programId).toBe("program_ab57fd0432e25d5b3013");
  });

  it("drops a programId that does not belong to the resolved tenant (IDOR guard)", async () => {
    programFindFirst.mockResolvedValue(null);
    const res = await POST(req({ ...VALID, programId: "program_from-another-tenant" }));
    expect(res.status).toBe(201);
    expect(admissionCreate.mock.calls[0][0].data.programId).toBeNull();
  });

  it("stores null when programId is omitted", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(201);
    expect(admissionCreate.mock.calls[0][0].data.programId).toBeNull();
    expect(programFindFirst).not.toHaveBeenCalled();
  });
});
