import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    teachingAssignment: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn() },
    studentEnrollment: { findMany: vi.fn() },
    studentAttendance: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function makeSession(
  role: SessionUser["role"],
  employeeId: string | null = null
): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
    employeeId,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/student-attendance/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  classSectionId: "cs-1",
  date: "2026-04-20",
  records: [{ studentId: "s-1", status: "PRESENT" }],
};

describe("POST /api/student-attendance/mark — role + Zod + tenant-scoped assignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no session", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null as never);
    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for GUARDIAN", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));
    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when `status` is not one of the enum values (Zod)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", "emp-1"));
    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(
      makeReq({
        ...validBody,
        records: [{ studentId: "s-1", status: "GHOSTED" }],
      }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validasi/i);
  });

  it("returns 403 when TEACHER is not assigned to the class (tenant-scoped lookup)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", "emp-1"));
    vi.mocked(prisma.teachingAssignment.findFirst).mockResolvedValue(null);

    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);

    // Verify the lookup included the tenant filter.
    expect(prisma.teachingAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: "emp-1",
        classSectionId: "cs-1",
        classSection: { tenantId: "t1" },
      },
    });
  });

  it("proceeds for TEACHER assigned to the class, no ClassSession that day → legacy sessionId:null path", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", "emp-1"));
    vi.mocked(prisma.teachingAssignment.findFirst).mockResolvedValue({ id: "ta-1" } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        studentEnrollment: {
          findMany: vi.fn().mockResolvedValue([{ studentId: "s-1" }]),
        },
        // No ClassSession row for this date → falls back to the legacy
        // sessionId:null upsert (findFirst + create/update) after the
        // @@unique([studentId, date]) drop (cycle 2026-05-15
        // academic-hierarchy-refactor).
        classSession: { findMany: vi.fn().mockResolvedValue([]) },
        studentAttendance: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });

    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(1);
  });

  it("proceeds for TEACHER assigned to the class, exactly one ClassSession that day → writes into that session's row (pilot-readiness-audit T2: prevents double-count vs the session-based flow)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", "emp-1"));
    vi.mocked(prisma.teachingAssignment.findFirst).mockResolvedValue({ id: "ta-1" } as never);
    const upsert = vi.fn().mockResolvedValue({});
    const legacyFindFirst = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        studentEnrollment: {
          findMany: vi.fn().mockResolvedValue([{ studentId: "s-1" }]),
        },
        classSession: { findMany: vi.fn().mockResolvedValue([{ id: "sess-1" }]) },
        studentAttendance: {
          findFirst: legacyFindFirst,
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
          upsert,
        },
      };
      return cb(tx);
    });

    const { POST } = await import("../student-attendance/mark/route");
    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(1);
    // Wrote into the session's unique row, not the sessionId:null legacy path.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_sessionId: { studentId: "s-1", sessionId: "sess-1" } },
      })
    );
    expect(legacyFindFirst).not.toHaveBeenCalled();
  });
});
