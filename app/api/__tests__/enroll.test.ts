import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../students/[id]/enroll/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn() },
    studentEnrollment: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/students/s1/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return { id: "u1", email: "t@t", name: "T", role, tenantId: "t1", employeeId: null, parentId: null, permissions: [], customRoleCode: null };
}

const params = Promise.resolve({ id: "s1" });

// Helper: build a tx mock for the $transaction callback.
// existingEnrollment: optional row returned by tx.studentEnrollment.findFirst
// sectionRow: row returned by tx.$queryRaw (SELECT … FOR UPDATE). Empty array = missing row.
// activeCount: number returned by tx.studentEnrollment.count
// createResult: row returned by tx.studentEnrollment.create
function makeTx(opts: {
  existingEnrollment?: { id: string } | null;
  sectionRow?: Array<{ id: string; capacity: number }>;
  activeCount?: number;
  createResult?: { id: string; studentId: string; classSectionId: string };
}) {
  return {
    studentEnrollment: {
      findFirst: vi.fn().mockResolvedValue(opts.existingEnrollment ?? null),
      count: vi.fn().mockResolvedValue(opts.activeCount ?? 0),
      create: vi.fn().mockResolvedValue(opts.createResult ?? { id: "e1", studentId: "s1", classSectionId: "cs1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.sectionRow ?? [{ id: "cs1", capacity: 10 }]),
  };
}

describe("POST /api/students/[id]/enroll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 with JSON error when student already has an ACTIVE enrollment", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue({
      id: "cs1",
      tenantId: "t1",
      program: { ageMin: null, ageMax: null },
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb(makeTx({ existingEnrollment: { id: "e1" } })),
    );

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sudah terdaftar/i);
  });

  it("returns 400 with JSON error when class is full", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue({
      id: "cs1",
      tenantId: "t1",
      program: { ageMin: null, ageMax: null },
    } as never);
    const tx = makeTx({ sectionRow: [{ id: "cs1", capacity: 10 }], activeCount: 10 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(tx));

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/penuh/i);
    // Lock in the count() shape — if a future edit drops `status: 'ACTIVE'`, the count would
    // include GRADUATED/WITHDRAWN rows and inflate capacity-full responses.
    expect(tx.studentEnrollment.count).toHaveBeenCalledWith({
      where: { classSectionId: "cs1", status: "ACTIVE" },
    });
  });

  it("returns 201 with the created enrollment on success", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue({
      id: "cs1",
      tenantId: "t1",
      program: { ageMin: null, ageMax: null },
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb(makeTx({ sectionRow: [{ id: "cs1", capacity: 10 }], activeCount: 3 })),
    );

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("e1");
  });

  it("returns 400 when student age is below program ageMin", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // 1-month-old child, program min 24 months
    const dob = new Date();
    dob.setMonth(dob.getMonth() - 1);
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      dateOfBirth: dob.toISOString().slice(0, 10),
    } as never);
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue({
      id: "cs1",
      tenantId: "t1",
      program: { ageMin: 24, ageMax: 72 },
    } as never);

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/di bawah batas minimum/i);
  });

  it("returns 400 when student age is above program ageMax", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // 10-year-old child, program max 72 months
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 10);
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      dateOfBirth: dob.toISOString().slice(0, 10),
    } as never);
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue({
      id: "cs1",
      tenantId: "t1",
      program: { ageMin: 24, ageMax: 72 },
    } as never);

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/di atas batas maksimum/i);
  });

  it("returns 404 when classSectionId belongs to a different tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    // findFirst with tenantId filter returns null → cross-tenant access blocked
    vi.mocked(prisma.classSection.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq({ classSectionId: "cs-from-other-tenant" }) as never, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ditemukan/i);
  });
});
