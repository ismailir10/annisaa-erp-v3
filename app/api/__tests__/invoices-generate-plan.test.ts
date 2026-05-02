import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    studentEnrollment: { findMany: vi.fn() },
    programFeeStructure: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

// Most tests want rate-limit out of the way; the dedicated rate-limit test
// re-mocks it locally to assert the 429 path.

import { POST } from "../invoices/generate/plan/route";

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/invoices/generate/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminSession() {
  return {
    id: "u-1",
    email: "admin@test.com",
    name: "Admin",
    role: "SUPER_ADMIN" as const,
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
    permissions: [] as string[],
    customRoleCode: null,
  };
}

const validBody = {
  periodLabel: "April 2026",
  dueDate: "2026-04-30",
  academicYearId: "ay-1",
};

describe("POST /api/invoices/generate/plan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when periodLabel is missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ dueDate: "2026-04-30", academicYearId: "ay-1" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when dueDate format is wrong", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ ...validBody, dueDate: "30/04/2026" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when academicYearId is missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ periodLabel: "April 2026", dueDate: "2026-04-30" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("classifies 3 students into eligible / already-invoiced / no-fee-structure", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    // s-1: program has fees, no existing invoice → eligible.
    // s-2: program has fees, BUT already invoiced for the period → skipped.
    // s-3: program has NO fee structure → skipped.
    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue([
      { student: { id: "s-1" }, classSection: { programId: "p-A" } },
      { student: { id: "s-2" }, classSection: { programId: "p-A" } },
      { student: { id: "s-3" }, classSection: { programId: "p-B" } },
    ] as never);

    // Only program p-A has an active recurring fee structure.
    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue([
      { programId: "p-A", feeComponentId: "fc-1", amount: 100_000 },
    ] as never);

    // s-2 already has an invoice for "April 2026".
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { studentId: "s-2" },
    ] as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      eligibleStudentIds: ["s-1"],
      skippedAlreadyInvoiced: 1,
      skippedNoFeeStructure: 1,
      total: 3,
      eligible: 1,
    });

    // Existing-invoice query is scoped to the trimmed period label + tenant.
    expect(vi.mocked(prisma.invoice.findMany).mock.calls[0][0]).toMatchObject({
      where: {
        tenantId: "tnt-1",
        periodLabel: "April 2026",
        studentId: { in: ["s-1", "s-2", "s-3"] },
      },
      select: { studentId: true },
    });
  });

  it("dedupes student with multiple active enrollments to one entry", async () => {
    // One student in two active class sections (e.g. siblings of a teacher's
    // homeroom or a kid in two parallel groups). The plan must classify them
    // exactly once — `total` and `eligibleStudentIds` count students, not
    // enrollment rows. Otherwise the admin's preview misrepresents what the
    // batch endpoint will actually create (one invoice per student per period).
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue([
      { student: { id: "s-1" }, classSection: { programId: "p-A" } },
      { student: { id: "s-1" }, classSection: { programId: "p-A" } },
    ] as never);

    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue([
      { programId: "p-A", feeComponentId: "fc-1", amount: 100_000 },
    ] as never);

    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      eligibleStudentIds: ["s-1"],
      skippedAlreadyInvoiced: 0,
      skippedNoFeeStructure: 0,
      total: 1,
      eligible: 1,
    });
  });

  it("returns zeros when there are no active enrollments", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue([] as never);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      eligibleStudentIds: [],
      skippedAlreadyInvoiced: 0,
      skippedNoFeeStructure: 0,
      total: 0,
      eligible: 0,
    });

    // No enrollments → no need to fan out fee-structure / existing-invoice queries.
    expect(prisma.programFeeStructure.findMany).not.toHaveBeenCalled();
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

});
