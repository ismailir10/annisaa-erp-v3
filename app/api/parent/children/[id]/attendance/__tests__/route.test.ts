import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 60 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/db", () => {
  type Row = { id: string; date: string; status: string };
  const state = {
    rows: [] as Row[],
    guardianLink: null as null | { studentId: string; parentId: string },
    user: null as null | { id: string; parentId: string | null },
  };

  const prisma = {
    __state: state,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (state.user && state.user.id === where.id) {
          return { parentId: state.user.parentId };
        }
        return null;
      }),
    },
    studentGuardian: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { studentId: string; parentId: string; status: string };
        }) => {
          if (
            state.guardianLink &&
            state.guardianLink.studentId === where.studentId &&
            state.guardianLink.parentId === where.parentId
          ) {
            return { id: "sg-1" };
          }
          return null;
        },
      ),
    },
    studentAttendance: {
      findMany: vi.fn(
        async ({
          where,
          skip = 0,
          take = 20,
          orderBy,
        }: {
          where: { studentId: string; status?: string };
          skip?: number;
          take?: number;
          orderBy?: Record<string, "asc" | "desc">;
        }) => {
          let rows = state.rows.filter((r) => {
            if (where.studentId && r.status === undefined) return false;
            if (where.status && r.status !== where.status) return false;
            return true;
          });
          if (orderBy && "date" in orderBy) {
            rows = [...rows].sort((a, b) =>
              orderBy.date === "desc"
                ? b.date.localeCompare(a.date)
                : a.date.localeCompare(b.date),
            );
          }
          return rows.slice(skip, skip + take).map((r) => ({
            ...r,
            checkInTime: null,
            checkOutTime: null,
            notes: null,
          }));
        },
      ),
      count: vi.fn(async ({ where }: { where: { status?: string } }) => {
        return state.rows.filter((r) =>
          where.status ? r.status === where.status : true,
        ).length;
      }),
    },
  };

  return { prisma };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

type PrismaMock = {
  __state: {
    rows: { id: string; date: string; status: string }[];
    guardianLink: null | { studentId: string; parentId: string };
    user: null | { id: string; parentId: string | null };
  };
};

async function getState() {
  const { prisma } = (await import("@/lib/db")) as unknown as {
    prisma: PrismaMock;
  };
  return prisma.__state;
}

function makeSession(
  role: SessionUser["role"],
  opts: Partial<Pick<SessionUser, "tenantId" | "id" | "parentId">> = {},
): SessionUser {
  return {
    id: opts.id ?? "u1",
    email: "p@p.com",
    name: "Parent",
    role,
    tenantId: opts.tenantId ?? "t1",
    employeeId: null,
    parentId: opts.parentId ?? null,
    permissions: [],
    customRoleCode: null,
  };
}

function getReq(query = "") {
  return new Request(
    `http://localhost/api/parent/children/stu-1/attendance${query}`,
  );
}

async function seed() {
  const s = await getState();
  s.rows.length = 0;
  // 25 records, dates desc
  for (let i = 0; i < 25; i++) {
    const day = String(i + 1).padStart(2, "0");
    s.rows.push({
      id: `att-${i + 1}`,
      date: `2026-04-${day}`,
      status: i % 5 === 0 ? "ABSENT" : "PRESENT",
    });
  }
  s.guardianLink = { studentId: "stu-1", parentId: "p1" };
  s.user = { id: "u1", parentId: "p1" };
}

describe("GET /api/parent/children/[id]/attendance", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await seed();
  });

  it("returns 401 when session is null", async () => {
    const { GET } = await import("../route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(getReq() as never, {
      params: Promise.resolve({ id: "stu-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-guardian role", async () => {
    const { GET } = await import("../route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER"));

    const res = await GET(getReq() as never, {
      params: Promise.resolve({ id: "stu-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 200 with default page (page=1, pageSize=20)", async () => {
    const { GET } = await import("../route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));

    const res = await GET(getReq() as never, {
      params: Promise.resolve({ id: "stu-1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(20);
    expect(json.total).toBe(25);
    expect(json.totalPages).toBe(2);
    expect(json.data).toHaveLength(20);
  });

  it("returns 200 with page=2 yielding the next slice", async () => {
    const { GET } = await import("../route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));

    const res = await GET(getReq("?page=2") as never, {
      params: Promise.resolve({ id: "stu-1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: unknown[];
      page: number;
    };
    expect(json.page).toBe(2);
    expect(json.data).toHaveLength(5); // 25 - 20
  });

  it("returns 403 when guardian has no link to the student", async () => {
    const s = await getState();
    s.guardianLink = null;

    const { GET } = await import("../route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN"));

    const res = await GET(getReq() as never, {
      params: Promise.resolve({ id: "stu-1" }),
    });
    expect(res.status).toBe(403);
  });
});
