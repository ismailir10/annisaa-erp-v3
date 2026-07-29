import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, update, getSession, isAdminRole, programFindFirst } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getSession: vi.fn(),
  isAdminRole: vi.fn(),
  programFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { enrollmentApplication: { findUnique, update }, program: { findFirst: programFindFirst } },
}));
vi.mock("@/lib/auth", () => ({ getSession, isAdminRole }));

import { GET, PATCH } from "../route";

const ctx = (id = "ea-1") => ({ params: Promise.resolve({ id }) });
function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/enrollments/ea-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ id: "u-1", tenantId: "t-1", role: "SUPER_ADMIN" });
  isAdminRole.mockReturnValue(true);
  update.mockResolvedValue({ id: "ea-1", status: "UNDER_REVIEW" });
});

describe("GET /api/enrollments/[id]", () => {
  it("403 for non-admin", async () => {
    isAdminRole.mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/enrollments/ea-1"), ctx());
    expect(res.status).toBe(403);
  });

  it("404 cross-tenant", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "other" });
    const res = await GET(new NextRequest("http://localhost/api/enrollments/ea-1"), ctx());
    expect(res.status).toBe(404);
  });

  it("returns the application", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED" });
    const res = await GET(new NextRequest("http://localhost/api/enrollments/ea-1"), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("ea-1");
  });
});

describe("PATCH /api/enrollments/[id]", () => {
  it("409 when already converted", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "ACCEPTED", studentId: "s-1" });
    const res = await PATCH(patchReq({ status: "REJECTED" }), ctx());
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a valid transition SUBMITTED → UNDER_REVIEW", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED", studentId: null });
    const res = await PATCH(patchReq({ status: "UNDER_REVIEW" }), ctx());
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.status).toBe("UNDER_REVIEW");
  });

  it("rejects an illegal transition REJECTED → ACCEPTED", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "REJECTED", studentId: null });
    const res = await PATCH(patchReq({ status: "ACCEPTED" }), ctx());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("edits blobs and mirrors childName", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED", studentId: null });
    const res = await PATCH(patchReq({ studentData: { childName: "  Budi  " } }), ctx());
    expect(res.status).toBe(200);
    const data = update.mock.calls[0][0].data;
    expect(data.childName).toBe("Budi");
    expect(data.studentData).toEqual({ childName: "  Budi  " });
  });

  it("400 on empty patch body", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED", studentId: null });
    const res = await PATCH(patchReq({}), ctx());
    expect(res.status).toBe(400);
  });

  it("accepts a prefixed (non-cuid) programId that belongs to the tenant", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED", studentId: null });
    programFindFirst.mockResolvedValue({ id: "program_ab57fd0432e25d5b3013" });
    const res = await PATCH(patchReq({ programId: "program_ab57fd0432e25d5b3013" }), ctx());
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.programId).toBe("program_ab57fd0432e25d5b3013");
  });

  it("400 when the chosen program is not in the admin's tenant (IDOR guard)", async () => {
    findUnique.mockResolvedValue({ id: "ea-1", tenantId: "t-1", status: "SUBMITTED", studentId: null });
    programFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ programId: "program_from-another-tenant" }), ctx());
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
