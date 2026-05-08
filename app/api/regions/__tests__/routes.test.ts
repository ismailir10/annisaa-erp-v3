// @vitest-environment node
//
// Unit tests for GET /api/regions/{provinces,regencies,districts,villages}.
//
// Uses Vitest `describe.each` to share assertion shape across
// regencies/districts/villages (parentId-gated routes). Provinces tested
// separately (no parent param, full 38-row list).
//
// Covered per describe.each route:
//   - missing required parent → 400 { error: "missing_parent_id", field: "<paramName>" }
//   - orphan parent (well-formed but non-existent) → 200 { items: [], hasMore: false }
//   - valid parent → children + pagination shape
//   - invalid-format parent (letters in numeric field) → 400 { error: "invalid_query" }
//   - pagination: pageSize=10 + hasMore=true when total > 10
//   - unauthenticated → 401
//
// Provinces (separate describe):
//   - returns rows with hasMore: false
//   - unauthenticated → 401
//   - ?pageSize=10 silently ignored (no Zod parsing in provinces route)
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T3)

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — share state across vi.mock factories.
const {
  getSessionMock,
  provinceFindManyMock,
  regencyFindManyMock,
  districtFindManyMock,
  villageFindManyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  provinceFindManyMock: vi.fn(),
  regencyFindManyMock: vi.fn(),
  districtFindManyMock: vi.fn(),
  villageFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    province: { findMany: provinceFindManyMock },
    regency: { findMany: regencyFindManyMock },
    district: { findMany: districtFindManyMock },
    village: { findMany: villageFindManyMock },
  },
}));

import { GET as getProvinces } from "../provinces/route";
import { GET as getRegencies } from "../regencies/route";
import { GET as getDistricts } from "../districts/route";
import { GET as getVillages } from "../villages/route";

const SESSION = {
  tenantId: "t_1",
  userId: "u_1",
  supabaseUserId: "sup_1",
  role: "admin" as const,
  currentTermId: "at_1",
};

// Build a NextRequest-compatible Request for the parentId-gated routes.
function makeParentedReq(
  route: string,
  params: Record<string, string> = {},
): Request {
  const url = new URL(`http://localhost/api/regions/${route}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" }) as unknown as Request;
}

function makeProvincesReq(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/regions/provinces");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" }) as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(SESSION);
});

// ── describe.each for parentId-gated routes ──────────────────────────────────

describe.each([
  {
    routeName: "regencies",
    parentParam: "provinceId",
    validParent: "31",
    invalidParentFormat: "ZZ",
    GET: getRegencies,
    findManyMock: regencyFindManyMock,
  },
  {
    routeName: "districts",
    parentParam: "regencyId",
    validParent: "3171",
    invalidParentFormat: "ZZZZ",
    GET: getDistricts,
    findManyMock: districtFindManyMock,
  },
  {
    routeName: "villages",
    parentParam: "districtId",
    validParent: "317101",
    invalidParentFormat: "ZZZZZZ",
    GET: getVillages,
    findManyMock: villageFindManyMock,
  },
])(
  "GET /api/regions/$routeName",
  ({ routeName, parentParam, validParent, invalidParentFormat, GET, findManyMock }) => {
    it("returns 401 when no session", async () => {
      getSessionMock.mockResolvedValueOnce(null);
      const req = makeParentedReq(routeName);
      const res = await GET(req as never);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it(`returns 400 missing_parent_id when ${parentParam} is absent`, async () => {
      const req = makeParentedReq(routeName);
      const res = await GET(req as never);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "missing_parent_id",
        field: parentParam,
      });
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it(`returns 400 invalid_query when ${parentParam} has wrong format`, async () => {
      const req = makeParentedReq(routeName, { [parentParam]: invalidParentFormat });
      const res = await GET(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_query");
      expect(body.issues).toBeDefined();
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it("returns 200 { items: [], hasMore: false } for orphan parent (Postel's law)", async () => {
      // Well-formed but non-existent parent — DB returns empty array.
      findManyMock.mockResolvedValueOnce([]);
      const req = makeParentedReq(routeName, { [parentParam]: validParent });
      const res = await GET(req as never);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [], hasMore: false });
    });

    it("returns 200 with items array of { id, label } and hasMore: false when results fit", async () => {
      findManyMock.mockResolvedValueOnce([
        { id: `${validParent}01`, name: "Alpha" },
        { id: `${validParent}02`, name: "Beta" },
      ]);
      const req = makeParentedReq(routeName, { [parentParam]: validParent });
      const res = await GET(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasMore).toBe(false);
      expect(body.items).toEqual([
        { id: `${validParent}01`, label: "Alpha" },
        { id: `${validParent}02`, label: "Beta" },
      ]);
    });

    it("returns hasMore: true and trims to pageSize when DB returns pageSize+1 rows", async () => {
      // pageSize=10, DB returns 11 rows → hasMore=true, items.length=10
      const rows = Array.from({ length: 11 }, (_, i) => ({
        id: `${validParent}${String(i).padStart(2, "0")}`,
        name: `Item ${i}`,
      }));
      findManyMock.mockResolvedValueOnce(rows);
      const req = makeParentedReq(routeName, {
        [parentParam]: validParent,
        pageSize: "10",
      });
      const res = await GET(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hasMore).toBe(true);
      expect(body.items).toHaveLength(10);
      // Verify each item has { id, label } shape
      for (const item of body.items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("label");
        expect(typeof item.id).toBe("string");
        expect(typeof item.label).toBe("string");
      }
    });

    it("passes default pagination (page=1, pageSize=50) to findMany", async () => {
      findManyMock.mockResolvedValueOnce([]);
      const req = makeParentedReq(routeName, { [parentParam]: validParent });
      await GET(req as never);
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51, // pageSize(50) + 1
          skip: 0,  // (page(1) - 1) * pageSize(50)
        }),
      );
    });

    it("forwards parentId to the where clause", async () => {
      findManyMock.mockResolvedValueOnce([]);
      const req = makeParentedReq(routeName, { [parentParam]: validParent });
      await GET(req as never);
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { [parentParam]: validParent },
        }),
      );
    });

    it("orders results by name ascending", async () => {
      findManyMock.mockResolvedValueOnce([]);
      const req = makeParentedReq(routeName, { [parentParam]: validParent });
      await GET(req as never);
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: "asc" },
        }),
      );
    });

    it("returns 400 invalid_query when pageSize=0 (Zod min(1) boundary)", async () => {
      const req = makeParentedReq(routeName, {
        [parentParam]: validParent,
        pageSize: "0",
      });
      const res = await GET(req as never);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_query");
      expect(findManyMock).not.toHaveBeenCalled();
    });
  },
);

// ── Provinces (no parent param, full list) ────────────────────────────────────

describe("GET /api/regions/provinces", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const req = makeProvincesReq();
    const res = await getProvinces(makeProvincesReq() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(provinceFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 200 with items array of { id, label } and hasMore: false", async () => {
    const provinceRows = Array.from({ length: 38 }, (_, i) => ({
      id: String(i + 1).padStart(2, "0"),
      name: `Provinsi ${i + 1}`,
    }));
    provinceFindManyMock.mockResolvedValueOnce(provinceRows);
    const res = await getProvinces(makeProvincesReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.items).toHaveLength(38);
    for (const item of body.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
    }
  });

  it("orders results by name ascending", async () => {
    provinceFindManyMock.mockResolvedValueOnce([]);
    await getProvinces(makeProvincesReq() as never);
    expect(provinceFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
      }),
    );
  });

  it("selects only id and name columns", async () => {
    provinceFindManyMock.mockResolvedValueOnce([]);
    await getProvinces(makeProvincesReq() as never);
    expect(provinceFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true },
      }),
    );
  });

  it("maps rows to { id, label } — name becomes label", async () => {
    provinceFindManyMock.mockResolvedValueOnce([
      { id: "11", name: "Aceh" },
      { id: "12", name: "Sumatera Utara" },
    ]);
    const res = await getProvinces(makeProvincesReq() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { id: "11", label: "Aceh" },
        { id: "12", label: "Sumatera Utara" },
      ],
      hasMore: false,
    });
  });

  it("returns 400 invalid_query when ANY query param is sent (strict mode per AC3)", async () => {
    // Provinces is deliberately unbounded (38 rows constant); pagination
    // params have no meaning. Reject any query param to surface client typos.
    const req = makeProvincesReq({ pageSize: "10" });
    const res = await getProvinces(req as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_query",
      message: "provinces route accepts no query params",
    });
    expect(provinceFindManyMock).not.toHaveBeenCalled();
  });
});
