import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "../admin/class-sessions/[id]/route";
import { GET } from "../admin/class-sessions/route";
import type { SessionUser } from "@/lib/auth";

/**
 * ClassSession swap-teacher endpoint tests (academic-hierarchy-refactor C6).
 *
 * Prisma is fully mocked. `getTodayInTimezone` is mocked so the past/future
 * branch is deterministic (pinned "today" = 2026-05-15).
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    classSession: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    employee: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/attendance/timezone", () => ({
  getTodayInTimezone: vi.fn(() => "2026-05-15"),
}));

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return {
    id: "u1",
    email: "a@a",
    name: "A",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function makePatchReq(body: unknown) {
  return new Request("http://localhost:3000/api/admin/class-sessions/cs1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchParams(id = "cs1") {
  return { params: Promise.resolve({ id }) };
}

// A future-dated session (after the pinned 2026-05-15 "today").
const FUTURE_SESSION = {
  id: "cs1",
  date: "2026-06-10",
  teacherId: "homeroom1",
  defaultTeacherId: "homeroom1",
  substituteReason: null,
  isBackfilled: false,
};
// A past-dated session (before the pinned "today").
const PAST_SESSION = {
  id: "cs1",
  date: "2026-04-01",
  teacherId: "homeroom1",
  defaultTeacherId: "homeroom1",
  substituteReason: null,
  isBackfilled: false,
};

describe("PATCH /api/admin/class-sessions/[id] — swap teacher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when caller is not an admin", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER"));
    const res = await PATCH(
      makePatchReq({ teacherId: "sub1" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when the body fails Zod validation", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // substituteReason must be a string — number is invalid.
    const res = await PATCH(
      makePatchReq({ teacherId: "sub1", substituteReason: 123 }) as never,
      patchParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session is cross-tenant / not found", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(null);
    const res = await PATCH(
      makePatchReq({ teacherId: "sub1" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(404);
    // findFirst must scope through the parent section's tenantId.
    expect(prisma.classSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "cs1",
          classSection: { tenantId: "t1" },
        }),
      }),
    );
  });

  it("returns 400 when teacherId belongs to another tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    const res = await PATCH(
      makePatchReq({ teacherId: "cross-tenant-emp" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(400);
    expect(prisma.classSession.update).not.toHaveBeenCalled();
  });

  it("swaps teacherId + sets substituteReason, leaves defaultTeacherId untouched", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "sub1",
    } as never);
    vi.mocked(prisma.classSession.update).mockResolvedValue({
      id: "cs1",
      teacherId: "sub1",
      defaultTeacherId: "homeroom1",
      substituteReason: "wali kelas cuti",
      isBackfilled: false,
    } as never);

    const res = await PATCH(
      makePatchReq({ teacherId: "sub1", substituteReason: "wali kelas cuti" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(200);

    const updateArg = vi.mocked(prisma.classSession.update).mock.calls[0][0];
    expect(updateArg.data).toMatchObject({
      teacherId: "sub1",
      substituteReason: "wali kelas cuti",
      isBackfilled: false,
    });
    // defaultTeacherId must NOT be in the update payload.
    expect(updateArg.data).not.toHaveProperty("defaultTeacherId");
  });

  it("sets isBackfilled=true when the session date is in the past", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      PAST_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "sub1",
    } as never);
    vi.mocked(prisma.classSession.update).mockResolvedValue({
      id: "cs1",
      teacherId: "sub1",
      defaultTeacherId: "homeroom1",
      substituteReason: null,
      isBackfilled: true,
    } as never);

    await PATCH(
      makePatchReq({ teacherId: "sub1", substituteReason: "cuti" }) as never,
      patchParams(),
    );
    const updateArg = vi.mocked(prisma.classSession.update).mock.calls[0][0];
    expect(updateArg.data.isBackfilled).toBe(true);
  });

  it("returns 400 when a real substitution has no substituteReason", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "sub1",
    } as never);
    // teacherId !== defaultTeacherId ("homeroom1") and no reason → 400.
    const res = await PATCH(
      makePatchReq({ teacherId: "sub1" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(400);
    expect(prisma.classSession.update).not.toHaveBeenCalled();
  });

  it("returns 400 when clearing teacherId to null has no substituteReason", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    // teacherId: null !== defaultTeacherId → genuine substitution, reason required.
    const res = await PATCH(
      makePatchReq({ teacherId: null }) as never,
      patchParams(),
    );
    expect(res.status).toBe(400);
    expect(prisma.classSession.update).not.toHaveBeenCalled();
  });

  it("substitution with a reason → 200", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "sub1",
    } as never);
    vi.mocked(prisma.classSession.update).mockResolvedValue({
      id: "cs1",
      teacherId: "sub1",
      defaultTeacherId: "homeroom1",
      substituteReason: "wali kelas cuti",
      isBackfilled: false,
    } as never);

    const res = await PATCH(
      makePatchReq({ teacherId: "sub1", substituteReason: "wali kelas cuti" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(200);
    const updateArg = vi.mocked(prisma.classSession.update).mock.calls[0][0];
    expect(updateArg.data.substituteReason).toBe("wali kelas cuti");
  });

  it("revert to homeroom (teacherId = defaultTeacherId, no reason) works", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // A currently-substituted future session.
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue({
      ...FUTURE_SESSION,
      teacherId: "sub1",
      substituteReason: "wali kelas cuti",
    } as never);
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "homeroom1",
    } as never);
    vi.mocked(prisma.classSession.update).mockResolvedValue({
      id: "cs1",
      teacherId: "homeroom1",
      defaultTeacherId: "homeroom1",
      substituteReason: null,
      isBackfilled: false,
    } as never);

    const res = await PATCH(
      makePatchReq({ teacherId: "homeroom1" }) as never,
      patchParams(),
    );
    expect(res.status).toBe(200);
    const updateArg = vi.mocked(prisma.classSession.update).mock.calls[0][0];
    expect(updateArg.data.teacherId).toBe("homeroom1");
    expect(updateArg.data.substituteReason).toBeNull();
  });

  it("records an audit row for the swap", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { recordAudit } = await import("@/lib/audit");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findFirst).mockResolvedValue(
      FUTURE_SESSION as never,
    );
    vi.mocked(prisma.employee.findFirst).mockResolvedValue({
      id: "sub1",
    } as never);
    vi.mocked(prisma.classSession.update).mockResolvedValue({
      id: "cs1",
      teacherId: "sub1",
      defaultTeacherId: "homeroom1",
      substituteReason: "cuti",
      isBackfilled: false,
    } as never);

    await PATCH(
      makePatchReq({ teacherId: "sub1", substituteReason: "cuti" }) as never,
      patchParams(),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "ClassSession",
        action: "swap_teacher",
        entityId: "cs1",
      }),
    );
  });
});

describe("GET /api/admin/class-sessions — list", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeGetReq(query: string) {
    return new Request(
      `http://localhost:3000/api/admin/class-sessions?${query}`,
    );
  }

  it("returns 403 when caller is not an admin", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER"));
    const res = await GET(makeGetReq("classSectionId=sec1") as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when classSectionId is missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    const res = await GET(makeGetReq("month=2026-05") as never);
    expect(res.status).toBe(400);
  });

  it("scopes the query by tenant + classSectionId + month range (31-day month)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findMany).mockResolvedValue([] as never);

    const res = await GET(
      makeGetReq("classSectionId=sec1&month=2026-05") as never,
    );
    expect(res.status).toBe(200);
    expect(prisma.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classSectionId: "sec1",
          classSection: { tenantId: "t1" },
          date: { gte: "2026-05-01", lte: "2026-05-31" },
        }),
        orderBy: [{ date: "asc" }, { slot: "asc" }],
      }),
    );
  });

  it("clamps the month range to the real last day for a short month (April, 30 days)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findMany).mockResolvedValue([] as never);

    await GET(makeGetReq("classSectionId=sec1&month=2026-04") as never);
    expect(prisma.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          // April has 30 days — the upper bound must be -30, not -31.
          date: { gte: "2026-04-01", lte: "2026-04-30" },
        }),
      }),
    );
  });

  it("clamps the month range to the real last day for February (28 days)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findMany).mockResolvedValue([] as never);

    await GET(makeGetReq("classSectionId=sec1&month=2026-02") as never);
    expect(prisma.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          // Feb 2026 is not a leap year — 28 days.
          date: { gte: "2026-02-01", lte: "2026-02-28" },
        }),
      }),
    );
  });

  it("omits the date filter when no month/range is given", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.classSession.findMany).mockResolvedValue([] as never);

    await GET(makeGetReq("classSectionId=sec1") as never);
    const arg = vi.mocked(prisma.classSession.findMany).mock.calls[0][0];
    expect(arg?.where).not.toHaveProperty("date");
  });
});
