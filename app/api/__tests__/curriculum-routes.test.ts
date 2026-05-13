import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";

// Integration tests for admin curriculum routes (C1/T5).
// Covers: auth gates, tenant scoping, parent-active guards, audit emission,
// Week overlap → 409, unique-violation → 409, soft-delete via PUT.

const semesterFindMany = vi.fn();
const semesterFindFirst = vi.fn();
const semesterCount = vi.fn();
const semesterCreate = vi.fn();
const semesterUpdate = vi.fn();

const themeFindMany = vi.fn();
const themeFindFirst = vi.fn();
const themeCount = vi.fn();
const themeCreate = vi.fn();
const themeUpdate = vi.fn();

const subThemeFindMany = vi.fn();
const subThemeFindFirst = vi.fn();
const subThemeCount = vi.fn();
const subThemeCreate = vi.fn();
const subThemeUpdate = vi.fn();

const weekFindMany = vi.fn();
const weekFindFirst = vi.fn();
const weekCount = vi.fn();
const weekCreate = vi.fn();
const weekUpdate = vi.fn();

const academicYearFindFirst = vi.fn();
const auditLogCreate = vi.fn();

const learningObjectiveFindFirst = vi.fn();
const learningObjectiveUpdate = vi.fn();
const learningObjectiveCreate = vi.fn();

const achievementIndicatorFindFirst = vi.fn();
const achievementIndicatorCreate = vi.fn();
const achievementIndicatorUpdate = vi.fn();
const achievementIndicatorAggregate = vi.fn();

const themeFindFirstForLink = vi.fn();
const indicatorThemeLinkFindFirst = vi.fn();
const indicatorThemeLinkCreate = vi.fn();
const indicatorThemeLinkDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    semester: {
      findMany: semesterFindMany,
      findFirst: semesterFindFirst,
      count: semesterCount,
      create: semesterCreate,
      update: semesterUpdate,
    },
    theme: {
      findMany: themeFindMany,
      findFirst: themeFindFirst,
      count: themeCount,
      create: themeCreate,
      update: themeUpdate,
    },
    subTheme: {
      findMany: subThemeFindMany,
      findFirst: subThemeFindFirst,
      count: subThemeCount,
      create: subThemeCreate,
      update: subThemeUpdate,
    },
    week: {
      findMany: weekFindMany,
      findFirst: weekFindFirst,
      count: weekCount,
      create: weekCreate,
      update: weekUpdate,
    },
    academicYear: { findFirst: academicYearFindFirst },
    auditLog: { create: auditLogCreate },
    learningObjective: {
      findFirst: learningObjectiveFindFirst,
      update: learningObjectiveUpdate,
      create: learningObjectiveCreate,
    },
    achievementIndicator: {
      findFirst: achievementIndicatorFindFirst,
      create: achievementIndicatorCreate,
      update: achievementIndicatorUpdate,
      aggregate: achievementIndicatorAggregate,
    },
    indicatorThemeLink: {
      findFirst: indicatorThemeLinkFindFirst,
      create: indicatorThemeLinkCreate,
      delete: indicatorThemeLinkDelete,
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const superAdmin = {
  id: "u-super",
  email: "super@demo.local",
  name: "Super",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-curr",
  employeeId: null,
  parentId: null,
  permissions: [],
  customRoleCode: null,
};

const teacher = {
  ...superAdmin,
  id: "u-teach",
  role: "TEACHER" as const,
  permissions: ["curriculum.read"],
};

const guardian = {
  ...superAdmin,
  id: "u-guard",
  role: "GUARDIAN" as const,
  permissions: [],
};

function jsonReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/admin/curriculum", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to neutral defaults so a stray mock from a previous test does
  // not leak into the next case.
  semesterFindMany.mockResolvedValue([]);
  semesterCount.mockResolvedValue(0);
  themeFindMany.mockResolvedValue([]);
  themeCount.mockResolvedValue(0);
  subThemeFindMany.mockResolvedValue([]);
  subThemeCount.mockResolvedValue(0);
  weekFindMany.mockResolvedValue([]);
  weekCount.mockResolvedValue(0);
  auditLogCreate.mockResolvedValue({ id: "a1" });
});

describe("curriculum routes — auth + permissions", () => {
  it("GET /semesters → 401 when no session", async () => {
    const { GET } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET(new Request("http://l/x") as never);
    expect(res.status).toBe(401);
  });

  it("POST /semesters → 403 when caller lacks curriculum.write", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacher); // read-only
    const res = await POST(
      jsonReq({ academicYearId: "ay1", number: 1, startDate: "2026-07-14", endDate: "2026-12-19" }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("GET /semesters → 200 for TEACHER (read permission)", async () => {
    const { GET } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacher);
    const res = await GET(new Request("http://l/api/admin/curriculum/semesters") as never);
    expect(res.status).toBe(200);
    expect(semesterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-curr" }) }),
    );
  });

  it("GET /semesters → 403 for GUARDIAN", async () => {
    const { GET } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(guardian);
    const res = await GET(new Request("http://l/x") as never);
    expect(res.status).toBe(403);
  });
});

describe("POST /semesters", () => {
  it("rejects when AcademicYear is missing / wrong tenant / INACTIVE", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    academicYearFindFirst.mockResolvedValue(null);

    const res = await POST(
      jsonReq({ academicYearId: "missing", number: 1, startDate: "2026-07-14", endDate: "2026-12-19" }) as never,
    );
    expect(res.status).toBe(400);
    expect(academicYearFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "missing", tenantId: "t-curr", status: "ACTIVE" },
      }),
    );
  });

  it("creates a semester + writes an audit row on happy path", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    academicYearFindFirst.mockResolvedValue({ id: "ay1" });
    semesterCreate.mockResolvedValue({
      id: "sem1",
      academicYearId: "ay1",
      number: 1,
      startDate: new Date("2026-07-14T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      status: "ACTIVE",
    });

    const res = await POST(
      jsonReq({ academicYearId: "ay1", number: 1, startDate: "2026-07-14", endDate: "2026-12-19" }) as never,
    );
    expect(res.status).toBe(201);
    expect(semesterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-curr",
          academicYearId: "ay1",
          number: 1,
        }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-curr",
          entity: "Semester",
          action: "create",
        }),
      }),
    );
  });

  it("returns 409 on P2002 unique-constraint violation", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/semesters/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    academicYearFindFirst.mockResolvedValue({ id: "ay1" });
    semesterCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await POST(
      jsonReq({ academicYearId: "ay1", number: 1, startDate: "2026-07-14", endDate: "2026-12-19" }) as never,
    );
    expect(res.status).toBe(409);
  });
});

describe("PUT /themes/[id] — soft-delete via status flip", () => {
  it("PUT { status: 'INACTIVE' } updates with status flip + audits action=status:INACTIVE", async () => {
    const { PUT } = await import("@/app/api/admin/curriculum/themes/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    themeFindFirst.mockResolvedValue({ id: "th1", name: "X", order: 0, status: "ACTIVE" });
    themeUpdate.mockResolvedValue({ id: "th1", name: "X", order: 0, status: "INACTIVE", semesterId: "sem1", _count: { subThemes: 0 } });

    const res = await PUT(
      jsonReq({ status: "INACTIVE" }, "PUT") as never,
      { params: Promise.resolve({ id: "th1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(themeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "INACTIVE" }) }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "Theme", action: "status:INACTIVE" }),
      }),
    );
  });

  it("returns 404 when row belongs to a different tenant", async () => {
    const { PUT } = await import("@/app/api/admin/curriculum/themes/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    themeFindFirst.mockResolvedValue(null); // tenant filter screened it out

    const res = await PUT(
      jsonReq({ name: "X" }, "PUT") as never,
      { params: Promise.resolve({ id: "th-other-tenant" }) } as never,
    );
    expect(res.status).toBe(404);
    expect(themeUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /semesters/[id]", () => {
  it("rejects when merged startDate >= endDate (cross-field check after merge)", async () => {
    const { PUT } = await import("@/app/api/admin/curriculum/semesters/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    semesterFindFirst.mockResolvedValue({
      id: "sem1",
      number: 1,
      startDate: new Date("2026-07-14T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      status: "ACTIVE",
    });

    // Only endDate sent; merged result puts endDate before existing startDate.
    const res = await PUT(
      jsonReq({ endDate: "2026-07-01" }, "PUT") as never,
      { params: Promise.resolve({ id: "sem1" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(semesterUpdate).not.toHaveBeenCalled();
  });

  it("date-only update audits with full date snapshot in before/after", async () => {
    const { PUT } = await import("@/app/api/admin/curriculum/semesters/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    const before = {
      id: "sem1",
      number: 1,
      startDate: new Date("2026-07-14T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      status: "ACTIVE",
    };
    semesterFindFirst.mockResolvedValue(before);
    semesterUpdate.mockResolvedValue({
      ...before,
      endDate: new Date("2026-12-31T00:00:00Z"),
      academicYearId: "ay1",
    });

    const res = await PUT(
      jsonReq({ endDate: "2026-12-31" }, "PUT") as never,
      { params: Promise.resolve({ id: "sem1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(auditLogCreate).toHaveBeenCalled();
    const auditCall = auditLogCreate.mock.calls[0][0];
    expect(auditCall.data.entity).toBe("Semester");
    expect(auditCall.data.action).toBe("update");
    expect(auditCall.data.before.startDate).toBe("2026-07-14T00:00:00.000Z");
    expect(auditCall.data.before.endDate).toBe("2026-12-19T00:00:00.000Z");
    expect(auditCall.data.after.endDate).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("PUT /weeks/[id] — reactivation overlap", () => {
  it("rejects { status: 'ACTIVE' } when the slot is now occupied by a sibling", async () => {
    const { PUT } = await import("@/app/api/admin/curriculum/weeks/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    weekFindFirst.mockResolvedValue({
      id: "w-dormant",
      subThemeId: "st1",
      number: 1,
      startDate: new Date("2026-07-13T00:00:00Z"),
      endDate: new Date("2026-07-17T00:00:00Z"),
      status: "INACTIVE",
    });
    // A different ACTIVE sibling already covers the same range.
    weekFindMany.mockResolvedValue([
      {
        id: "w-current",
        startDate: new Date("2026-07-13T00:00:00Z"),
        endDate: new Date("2026-07-17T00:00:00Z"),
        status: "ACTIVE",
      },
    ]);

    const res = await PUT(
      jsonReq({ status: "ACTIVE" }, "PUT") as never,
      { params: Promise.resolve({ id: "w-dormant" }) } as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflictingWeekId).toBe("w-current");
    expect(weekUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /objectives/[id] — C3", () => {
  it("updates competencyText + content; audits action=update", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/objectives/[id]/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    learningObjectiveFindFirst.mockResolvedValue({
      id: "obj1",
      competencyText: "Lama",
      content: "Lama TP",
      status: "ACTIVE",
    });
    learningObjectiveUpdate.mockResolvedValue({
      id: "obj1",
      semesterId: "sem1",
      ageGroup: "A",
      element: "RELIGIOUS_MORAL",
      number: 1,
      competencyText: "Baru",
      content: "Baru TP",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      jsonReq(
        { competencyText: "Baru", content: "Baru TP" },
        "PUT",
      ) as never,
      { params: Promise.resolve({ id: "obj1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(learningObjectiveUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          competencyText: "Baru",
          content: "Baru TP",
        }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "LearningObjective",
          action: "update",
        }),
      }),
    );
  });

  it("status-only deactivate emits action=status:INACTIVE", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/objectives/[id]/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    learningObjectiveFindFirst.mockResolvedValue({
      id: "obj1",
      competencyText: "X",
      content: "Y",
      status: "ACTIVE",
    });
    learningObjectiveUpdate.mockResolvedValue({
      id: "obj1",
      semesterId: "sem1",
      ageGroup: "A",
      element: "RELIGIOUS_MORAL",
      number: 1,
      competencyText: "X",
      content: "Y",
      status: "INACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      jsonReq({ status: "INACTIVE" }, "PUT") as never,
      { params: Promise.resolve({ id: "obj1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "LearningObjective",
          action: "status:INACTIVE",
        }),
      }),
    );
  });

  it("returns 404 when row belongs to a different tenant", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/objectives/[id]/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    learningObjectiveFindFirst.mockResolvedValue(null);

    const res = await PUT(
      jsonReq({ content: "X" }, "PUT") as never,
      { params: Promise.resolve({ id: "obj-other" }) } as never,
    );
    expect(res.status).toBe(404);
    expect(learningObjectiveUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when caller lacks curriculum.write", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/objectives/[id]/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(teacher);

    const res = await PUT(
      jsonReq({ content: "X" }, "PUT") as never,
      { params: Promise.resolve({ id: "obj1" }) } as never,
    );
    expect(res.status).toBe(403);
    expect(learningObjectiveUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 on empty patch body", async () => {
    const { PUT } = await import(
      "@/app/api/admin/curriculum/objectives/[id]/route"
    );
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    learningObjectiveFindFirst.mockResolvedValue({
      id: "obj1",
      competencyText: "X",
      content: "Y",
      status: "ACTIVE",
    });

    const res = await PUT(
      jsonReq({}, "PUT") as never,
      { params: Promise.resolve({ id: "obj1" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(learningObjectiveUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /weeks — overlap detection", () => {
  it("returns 409 + conflictingWeekId when proposed range overlaps an ACTIVE sibling", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/weeks/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    subThemeFindFirst.mockResolvedValue({ id: "st1" });
    weekFindMany.mockResolvedValue([
      { id: "w-existing", startDate: "2026-07-13", endDate: "2026-07-17", status: "ACTIVE" },
    ]);

    const res = await POST(
      jsonReq({ subThemeId: "st1", number: 2, startDate: "2026-07-15", endDate: "2026-07-21" }) as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflictingWeekId).toBe("w-existing");
    expect(weekCreate).not.toHaveBeenCalled();
  });

  it("creates + audits when range does NOT overlap (touching boundary)", async () => {
    const { POST } = await import("@/app/api/admin/curriculum/weeks/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(superAdmin);
    subThemeFindFirst.mockResolvedValue({ id: "st1" });
    weekFindMany.mockResolvedValue([
      { id: "w-existing", startDate: "2026-07-13", endDate: "2026-07-17", status: "ACTIVE" },
    ]);
    weekCreate.mockResolvedValue({
      id: "w-new",
      subThemeId: "st1",
      number: 2,
      startDate: new Date("2026-07-20T00:00:00Z"),
      endDate: new Date("2026-07-24T00:00:00Z"),
      status: "ACTIVE",
    });

    const res = await POST(
      jsonReq({ subThemeId: "st1", number: 2, startDate: "2026-07-20", endDate: "2026-07-24" }) as never,
    );
    expect(res.status).toBe(201);
    expect(weekCreate).toHaveBeenCalled();
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "Week", action: "create" }),
      }),
    );
  });
});
