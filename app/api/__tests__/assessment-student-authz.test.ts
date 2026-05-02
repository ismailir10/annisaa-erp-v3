import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT } from "../assessments/student/[id]/route";
import { POST } from "../assessments/student/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 30 })),
}));

vi.mock("@/lib/db", () => {
  type TeachingAssignment = { id: string; employeeId: string; classSectionId: string };
  type ClassSection = { id: string; tenantId: string; programId: string; status: string };
  type Enrollment = { studentId: string; classSectionId: string; status: string };
  type Student = { id: string; tenantId: string };
  type Template = { id: string; tenantId: string; programId: string; isActive: boolean };
  type Assessment = { id: string; studentId: string; templateId: string; period: string; status: string };

  const state = {
    assignments: [] as TeachingAssignment[],
    classSections: [] as ClassSection[],
    enrollments: [] as Enrollment[],
    students: [] as Student[],
    templates: [] as Template[],
    assessments: [] as Assessment[],
  };

  function matchTeachingAssignment(where: Record<string, unknown>) {
    return state.assignments.find((a) => {
      if (where.employeeId && a.employeeId !== where.employeeId) return false;
      if (where.classSectionId) {
        const cs = where.classSectionId;
        if (typeof cs === "string") {
          if (a.classSectionId !== cs) return false;
        } else if (cs && typeof cs === "object" && "in" in cs) {
          const arr = (cs as { in: string[] }).in;
          if (!arr.includes(a.classSectionId)) return false;
        }
      }
      if (where.classSection && typeof where.classSection === "object") {
        const csFilter = where.classSection as Record<string, unknown>;
        const cs = state.classSections.find((x) => x.id === a.classSectionId);
        if (!cs) return false;
        if (csFilter.tenantId && cs.tenantId !== csFilter.tenantId) return false;
        if (csFilter.programId && cs.programId !== csFilter.programId) return false;
        if (csFilter.status && cs.status !== csFilter.status) return false;
      }
      return true;
    });
  }

  const prisma = {
    __state: state,
    teachingAssignment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const hit = matchTeachingAssignment(where);
        return hit ? { id: hit.id } : null;
      }),
    },
    student: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const s = state.students.find((st) => {
          if (where.id && st.id !== where.id) return false;
          if (where.tenantId && st.tenantId !== where.tenantId) return false;
          return true;
        });
        if (!s) return null;
        return {
          ...s,
          enrollments: state.enrollments
            .filter((e) => e.studentId === s.id && e.status === "ACTIVE")
            .map((e) => ({ classSectionId: e.classSectionId })),
        };
      }),
    },
    assessmentTemplate: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          state.templates.find((t) => {
            if (where.id && t.id !== where.id) return false;
            if (where.tenantId && t.tenantId !== where.tenantId) return false;
            return true;
          }) ?? null
        );
      }),
    },
    studentAssessment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const a = state.assessments.find((x) => {
          if (where.id && x.id !== where.id) return false;
          if (where.student && typeof where.student === "object") {
            const sw = where.student as Record<string, unknown>;
            const s = state.students.find((st) => st.id === x.studentId);
            if (!s) return false;
            if (sw.tenantId && s.tenantId !== sw.tenantId) return false;
          }
          return true;
        });
        if (!a) return null;
        const tpl = state.templates.find((t) => t.id === a.templateId);
        return {
          ...a,
          template: { programId: tpl?.programId ?? "" },
          student: {
            enrollments: state.enrollments
              .filter((e) => e.studentId === a.studentId && e.status === "ACTIVE")
              .map((e) => ({ classSectionId: e.classSectionId })),
          },
        };
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.studentId_templateId_period) {
          const k = where.studentId_templateId_period as {
            studentId: string;
            templateId: string;
            period: string;
          };
          return (
            state.assessments.find(
              (a) => a.studentId === k.studentId && a.templateId === k.templateId && a.period === k.period
            ) ?? null
          );
        }
        if (where.id) {
          return state.assessments.find((a) => a.id === where.id) ?? null;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: { studentId: string; templateId: string; period: string } }) => {
        const a = { id: `a-${state.assessments.length + 1}`, status: "DRAFT", ...data };
        state.assessments.push(a);
        return a;
      }),
      update: vi.fn(async () => ({})),
    },
    studentAssessmentScore: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  return { prisma };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

type PrismaMock = {
  __state: {
    assignments: Array<{ id: string; employeeId: string; classSectionId: string }>;
    classSections: Array<{ id: string; tenantId: string; programId: string; status: string }>;
    enrollments: Array<{ studentId: string; classSectionId: string; status: string }>;
    students: Array<{ id: string; tenantId: string }>;
    templates: Array<{ id: string; tenantId: string; programId: string; isActive: boolean }>;
    assessments: Array<{ id: string; studentId: string; templateId: string; period: string; status: string }>;
  };
};

async function getState() {
  const { prisma } = (await import("@/lib/db")) as unknown as { prisma: PrismaMock };
  return prisma.__state;
}

function makeSession(
  role: SessionUser["role"],
  opts: Partial<Pick<SessionUser, "tenantId" | "employeeId" | "id">> = {}
): SessionUser {
  return {
    id: opts.id ?? "u1",
    email: "t@t.com",
    name: "T",
    role,
    tenantId: opts.tenantId ?? "t1",
    employeeId: opts.employeeId ?? null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function putReq(body: unknown) {
  return new Request("http://localhost/api/assessments/student/a-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/assessments/student", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seed() {
  const s = await getState();
  s.assignments.length = 0;
  s.classSections.length = 0;
  s.enrollments.length = 0;
  s.students.length = 0;
  s.templates.length = 0;
  s.assessments.length = 0;

  // Two classes, same program
  s.classSections.push(
    { id: "cs-A", tenantId: "t1", programId: "p1", status: "ACTIVE" },
    { id: "cs-B", tenantId: "t1", programId: "p1", status: "ACTIVE" },
  );
  // Teacher emp-1 assigned to class A only
  s.assignments.push({ id: "ta-1", employeeId: "emp-1", classSectionId: "cs-A" });
  // Students: one in A, one in B
  s.students.push(
    { id: "stu-A", tenantId: "t1" },
    { id: "stu-B", tenantId: "t1" },
  );
  s.enrollments.push(
    { studentId: "stu-A", classSectionId: "cs-A", status: "ACTIVE" },
    { studentId: "stu-B", classSectionId: "cs-B", status: "ACTIVE" },
  );
  s.templates.push({ id: "tpl-1", tenantId: "t1", programId: "p1", isActive: true });
  s.assessments.push(
    { id: "a-A", studentId: "stu-A", templateId: "tpl-1", period: "Semester 1 2026/2027", status: "DRAFT" },
    { id: "a-B", studentId: "stu-B", templateId: "tpl-1", period: "Semester 1 2026/2027", status: "DRAFT" },
  );
}

describe("PUT /api/assessments/student/[id] — stricter class-level authz", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seed();
  });

  it("rejects teacher assigned to class A saving scores for a student in class B (403)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", { employeeId: "emp-1" }));

    const res = await PUT(putReq({ scores: [{ indicatorId: "ind-1", score: "BSH" }] }) as never, {
      params: Promise.resolve({ id: "a-B" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows teacher assigned to class A saving scores for a student in class A (200)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", { employeeId: "emp-1" }));

    const res = await PUT(putReq({ scores: [{ indicatorId: "ind-1", score: "BSH" }] }) as never, {
      params: Promise.resolve({ id: "a-A" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows admin regardless of teaching assignment (200)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));

    const res = await PUT(putReq({ scores: [{ indicatorId: "ind-1", score: "BSH" }] }) as never, {
      params: Promise.resolve({ id: "a-B" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects invalid score enum via Zod (400)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN"));

    const res = await PUT(putReq({ scores: [{ indicatorId: "ind-1", score: "INVALID" }] }) as never, {
      params: Promise.resolve({ id: "a-A" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when session is null", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await PUT(putReq({ scores: [] }) as never, {
      params: Promise.resolve({ id: "a-A" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/assessments/student — stricter class-level authz", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seed();
  });

  it("rejects teacher creating assessment for student in a class they don't teach (403)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", { employeeId: "emp-1" }));

    const res = await POST(postReq({
      studentId: "stu-B",
      templateId: "tpl-1",
      period: "Semester 1 2026/2027",
    }) as never);
    expect(res.status).toBe(403);
  });

  it("allows teacher creating assessment for student in their class (200)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER", { employeeId: "emp-1" }));

    const res = await POST(postReq({
      studentId: "stu-A",
      templateId: "tpl-1",
      period: "Semester 1 2026/2027",
    }) as never);
    expect(res.status).toBe(200);
  });
});
