// @vitest-environment node
//
// Unit tests for GET /api/scaffold/[entity] (route.ts).
//
// Mocked-prisma + mocked-session tests covering: 401 unauth, 400 unknown
// entity, happy 200 with hasMore=false, happy 200 with hasMore=true (more
// rows than limit), q substring match, q with empty result, tenant-scope
// leak guard, soft-deleted exclusion.
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T2)

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, programFindManyMock, householdFindManyMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    programFindManyMock: vi.fn(),
    householdFindManyMock: vi.fn(),
  }));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    program: { findMany: programFindManyMock },
    household: { findMany: householdFindManyMock },
    student: { findMany: vi.fn() },
    guardian: { findMany: vi.fn() },
    studentIdentifier: { findMany: vi.fn() },
    guardianInvitation: { findMany: vi.fn() },
  },
}));

import { GET } from "../route";

const SESSION = {
  tenantId: "t_1",
  userId: "u_1",
  supabaseUserId: "sup_1",
  role: "admin" as const,
  currentTermId: "at_1",
};

function makeReq(entity: string, query: string = ""): {
  req: Request;
  ctx: { params: Promise<{ entity: string }> };
} {
  const url = `http://localhost/api/scaffold/${entity}${query ? `?${query}` : ""}`;
  return {
    req: new Request(url, { method: "GET" }),
    ctx: { params: Promise.resolve({ entity }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/scaffold/[entity]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const { req, ctx } = makeReq("Program");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(programFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 unknown_entity for non-allowlisted entity", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    const { req, ctx } = makeReq("NotARealEntity");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "unknown_entity",
      entity: "NotARealEntity",
    });
  });

  it("returns 200 with items + hasMore=false when rows fit under limit", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    programFindManyMock.mockResolvedValueOnce([
      { id: "p1", name: "TK A" },
      { id: "p2", name: "SD B" },
    ]);
    const { req, ctx } = makeReq("Program", "limit=20");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { id: "p1", label: "TK A" },
        { id: "p2", label: "SD B" },
      ],
      hasMore: false,
    });
    expect(programFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t_1", deletedAt: null },
        take: 21,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    );
  });

  it("returns hasMore=true when delegate returns limit+1 rows", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      code: `KK-00${i}`,
    }));
    householdFindManyMock.mockResolvedValueOnce(rows);
    const { req, ctx } = makeReq("Household", "limit=5");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.items).toHaveLength(5);
  });

  it("forwards q as case-insensitive contains across searchFields", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    householdFindManyMock.mockResolvedValueOnce([
      { id: "h1", code: "KK-001" },
    ]);
    const { req, ctx } = makeReq("Household", "q=KK-0&limit=20");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    expect(householdFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t_1",
          deletedAt: null,
          OR: [{ code: { contains: "KK-0", mode: "insensitive" } }],
        },
      }),
    );
  });

  it("returns empty items on no q match", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    householdFindManyMock.mockResolvedValueOnce([]);
    const { req, ctx } = makeReq("Household", "q=ZZZZZ");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], hasMore: false });
  });

  it("threads session.tenantId — never reads tenantId from request", async () => {
    getSessionMock.mockResolvedValueOnce({ ...SESSION, tenantId: "t_BLUE" });
    householdFindManyMock.mockResolvedValueOnce([]);
    const { req, ctx } = makeReq("Household", "tenantId=t_RED&q=KK");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    const call = householdFindManyMock.mock.calls[0]?.[0];
    expect(call?.where.tenantId).toBe("t_BLUE");
    expect(JSON.stringify(call?.where)).not.toContain("t_RED");
  });

  it("excludes soft-deleted rows via where.deletedAt = null", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    householdFindManyMock.mockResolvedValueOnce([
      { id: "h1", code: "KK-001" },
    ]);
    const { req, ctx } = makeReq("Household");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    expect(householdFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it("falls back to id when displayField is null", async () => {
    getSessionMock.mockResolvedValueOnce(SESSION);
    householdFindManyMock.mockResolvedValueOnce([{ id: "h1", code: null }]);
    const { req, ctx } = makeReq("Household");
    const res = await GET(req as never, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [{ id: "h1", label: "h1" }],
      hasMore: false,
    });
  });
});
