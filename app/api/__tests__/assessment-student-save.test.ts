import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT } from "../assessments/student/[id]/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 30 })),
}));

vi.mock("@/lib/db", () => {
  type Score = { id: string; assessmentId: string; indicatorId: string; score: string; notes: string | null };
  type Assessment = { id: string; studentId: string; templateId: string; period: string; status: string };

  const state = {
    assessments: [] as Assessment[],
    scores: [] as Score[],
  };
  let nextScoreId = 1;

  const tx = {
    studentAssessmentScore: {
      deleteMany: vi.fn(async ({ where }: { where: { assessmentId: string } }) => {
        const before = state.scores.length;
        state.scores = state.scores.filter((s) => s.assessmentId !== where.assessmentId);
        return { count: before - state.scores.length };
      }),
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: Array<{ assessmentId: string; indicatorId: string; score: string; notes: string | null }>;
        }) => {
          for (const row of data) {
            state.scores.push({ id: `s-${nextScoreId++}`, ...row });
          }
          return { count: data.length };
        },
      ),
    },
    studentAssessment: {
      update: vi.fn(async () => ({})),
    },
  };

  const prisma = {
    __state: state,
    studentAssessment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const a = state.assessments.find((x) => x.id === where.id);
        if (!a) return null;
        return {
          ...a,
          template: { programId: "p1" },
          // Always satisfy class-level authz for these save-semantic tests;
          // authz coverage lives in assessment-student-authz.test.ts.
          student: { enrollments: [{ classSectionId: "cs-A" }] },
        };
      }),
      update: tx.studentAssessment.update,
    },
    studentAssessmentScore: tx.studentAssessmentScore,
    teachingAssignment: {
      findFirst: vi.fn(async () => ({ id: "ta-1" })),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  return { prisma };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

type PrismaMock = {
  __state: {
    assessments: Array<{ id: string; studentId: string; templateId: string; period: string; status: string }>;
    scores: Array<{ id: string; assessmentId: string; indicatorId: string; score: string; notes: string | null }>;
  };
};

async function getState() {
  const { prisma } = (await import("@/lib/db")) as unknown as { prisma: PrismaMock };
  return prisma.__state;
}

function adminSession(): SessionUser {
  return {
    id: "u1",
    email: "a@a.com",
    name: "A",
    role: "SCHOOL_ADMIN",
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function putReq(id: string, body: unknown) {
  return new Request(`http://localhost/api/assessments/student/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seed() {
  const s = await getState();
  s.assessments.length = 0;
  s.scores.length = 0;
  s.assessments.push({
    id: "a-1",
    studentId: "stu-A",
    templateId: "tpl-1",
    period: "Semester 2 2025/2026",
    status: "DRAFT",
  });
}

describe("PUT /api/assessments/student/[id] — save semantics", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seed();
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
  });

  it("persists non-empty scores by replacing the existing set", async () => {
    const res = await PUT(
      putReq("a-1", {
        scores: [
          { indicatorId: "ind-1", score: "BSH" },
          { indicatorId: "ind-2", score: "MB", notes: "perlu latihan" },
        ],
      }) as never,
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const s = await getState();
    expect(s.scores).toHaveLength(2);
    expect(s.scores.map((x) => x.indicatorId).sort()).toEqual(["ind-1", "ind-2"]);
    expect(s.scores.find((x) => x.indicatorId === "ind-2")?.notes).toBe("perlu latihan");
  });

  it("clears all scores when payload is an empty array (regression: deselect-all must persist)", async () => {
    // Pre-populate with two scores
    const s = await getState();
    s.scores.push(
      { id: "s-pre-1", assessmentId: "a-1", indicatorId: "ind-1", score: "BSH", notes: null },
      { id: "s-pre-2", assessmentId: "a-1", indicatorId: "ind-2", score: "MB", notes: null },
    );

    const res = await PUT(putReq("a-1", { scores: [] }) as never, {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(200);
    expect((await getState()).scores).toHaveLength(0);
  });

  it("leaves existing scores untouched when scores is omitted (status-only update)", async () => {
    const s = await getState();
    s.scores.push(
      { id: "s-pre-1", assessmentId: "a-1", indicatorId: "ind-1", score: "BSH", notes: null },
    );

    const res = await PUT(putReq("a-1", { publish: true }) as never, {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(200);
    expect((await getState()).scores).toHaveLength(1);
  });
});
