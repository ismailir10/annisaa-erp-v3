import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

/**
 * Coverage for the mechanical API-hardening batch (rate limits + zod body
 * validation) added to the student lifecycle routes: enroll, withdraw,
 * promote, and the per-guardian PATCH status toggle. Each route already has
 * its own dedicated test file for the happy-path business logic (enroll.test.ts,
 * promote-capacity-race.test.ts, ...) — this file targets only the new
 * malformed/invalid-body → 400 contract.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn() },
    studentEnrollment: { findFirst: vi.fn(), create: vi.fn() },
    studentGuardian: { findFirst: vi.fn(), update: vi.fn() },
    invoice: { count: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
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

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function makeReq(url: string, body: unknown | string) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const studentParams = Promise.resolve({ id: "s1" });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/students/[id]/enroll — malformed JSON", () => {
  it("returns 400 (not throw) on malformed JSON body", async () => {
    const { POST } = await import("../students/[id]/enroll/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());

    const req = new Request("http://localhost:3000/api/students/s1/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });

    const res = await POST(req as never, { params: studentParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("POST /api/students/[id]/withdraw — body validation", () => {
  it("returns 400 when reason exceeds 500 characters", async () => {
    const { POST } = await import("../students/[id]/withdraw/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());

    const req = makeReq("http://localhost:3000/api/students/s1/withdraw", {
      reason: "a".repeat(501),
    });

    const res = await POST(req as never, { params: studentParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("POST /api/students/[id]/promote — body validation", () => {
  it("returns 400 when targetClassSectionId is missing", async () => {
    const { POST } = await import("../students/[id]/promote/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());

    const req = makeReq("http://localhost:3000/api/students/s1/promote", {
      notes: "naik kelas",
    });

    const res = await POST(req as never, { params: studentParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("PATCH /api/students/[id]/guardians/[guardianId] — body validation", () => {
  it("returns 400 for an invalid status value", async () => {
    const { PATCH } = await import("../students/[id]/guardians/[guardianId]/route");
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1" } as never);
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue({
      id: "g1",
      studentId: "s1",
      status: "ACTIVE",
    } as never);

    const req = makeReq(
      "http://localhost:3000/api/students/s1/guardians/g1",
      { status: "GARBAGE" },
    );

    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: "s1", guardianId: "g1" }),
    });
    expect(res.status).toBe(400);
    expect(prisma.studentGuardian.update).not.toHaveBeenCalled();
  });
});
