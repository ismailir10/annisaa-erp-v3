import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ALLOWLIST_CAP,
  CACHE_TTL_MS,
  clearPermissionCache,
  getJwtTenantId,
  resolvePermissions,
  _resolvePermissionsForTest,
  _resetMissingStudentWarning,
  type PermissionPrismaLike,
} from "../permission";

type Mock = ReturnType<typeof vi.fn>;
type MockPrisma = {
  userRole: { findMany: Mock };
  employee: { findFirst: Mock };
  employeeCampusAssignment: { findMany: Mock };
  classSection: { findMany: Mock };
  teachingDefault: { findMany: Mock };
  sentraRotation: { findMany: Mock };
  sessionTeacher: { findMany: Mock };
  $queryRaw: Mock;
};

function makePrisma(overrides: Partial<MockPrisma> = {}): MockPrisma & PermissionPrismaLike {
  const base: MockPrisma = {
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { findFirst: vi.fn().mockResolvedValue(null) },
    employeeCampusAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    classSection: { findMany: vi.fn().mockResolvedValue([]) },
    teachingDefault: { findMany: vi.fn().mockResolvedValue([]) },
    sentraRotation: { findMany: vi.fn().mockResolvedValue([]) },
    sessionTeacher: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return { ...base, ...overrides } as MockPrisma & PermissionPrismaLike;
}

const ARGS = {
  userId: "u1",
  // Supabase auth uuid — distinct from User.id (CUID). See ResolveArgs JSDoc.
  supabaseUserId: "00000000-0000-0000-0000-000000000001",
  tenantId: "t1",
  currentTermId: "term-2026-1",
} as const;

function rolePerm(scope: string) {
  return { permission: { resource: "Student", action: "read", scope } };
}

beforeEach(() => {
  clearPermissionCache();
  _resetMissingStudentWarning();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resolvePermissions — empty paths", () => {
  it("returns empty Sets + all:false when user has no roles", async () => {
    const prisma = makePrisma();
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.all).toBe(false);
    expect(r.campusIds.size).toBe(0);
    expect(r.programIds.size).toBe(0);
    expect(r.classIds.size).toBe(0);
    expect(r.sessionIds.size).toBe(0);
    expect(r.studentIds.size).toBe(0);
    expect(r.overflow).toBe(false);
  });

  it("does not query scope tables when user has no Employee row", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await resolvePermissions({ ...ARGS, prisma });
    expect(prisma.employeeCampusAssignment.findMany).not.toHaveBeenCalled();
  });

  it("preserves identity fields on result", async () => {
    const prisma = makePrisma();
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.userId).toBe(ARGS.userId);
    expect(r.tenantId).toBe(ARGS.tenantId);
    expect(r.currentTermId).toBe(ARGS.currentTermId);
  });

  it("returns frozen result", async () => {
    const r = await resolvePermissions({ ...ARGS, prisma: makePrisma() });
    expect(Object.isFrozen(r)).toBe(true);
  });
});

describe("resolvePermissions — ALL scope", () => {
  function allPrisma(): MockPrisma & PermissionPrismaLike {
    return makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("ALL")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: {
        findMany: vi.fn().mockResolvedValue([{ campusId: "c1" }, { campusId: "c2" }]),
      },
      classSection: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "cs1", programId: "p1" }, { id: "cs2", programId: "p2" }])
          .mockResolvedValueOnce([{ id: "cs3", programId: "p1" }]),
      },
      teachingDefault: {
        findMany: vi.fn().mockResolvedValue([{ classSectionId: "cs1" }]),
      },
      sessionTeacher: {
        findMany: vi.fn().mockResolvedValue([{ classSessionId: "ses1" }, { classSessionId: "ses2" }]),
      },
    });
  }

  it("sets all:true", async () => {
    const r = await resolvePermissions({ ...ARGS, prisma: allPrisma() });
    expect(r.all).toBe(true);
  });

  it("materializes campus + program + class + session sets", async () => {
    const r = await resolvePermissions({ ...ARGS, prisma: allPrisma() });
    expect([...r.campusIds].sort()).toEqual(["c1", "c2"]);
    expect([...r.programIds].sort()).toEqual(["p1", "p2"]);
    // T1 + walas merged
    expect([...r.classIds].sort()).toEqual(["cs1", "cs3"]);
    expect([...r.sessionIds].sort()).toEqual(["ses1", "ses2"]);
  });
});

describe("resolvePermissions — OWN_CAMPUS scope", () => {
  it("queries EmployeeCampusAssignment scoped to employee + tenant", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: {
        findMany: vi.fn().mockResolvedValue([{ campusId: "cMetland" }]),
      },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.campusIds.has("cMetland")).toBe(true);
    const call = prisma.employeeCampusAssignment.findMany.mock.calls[0]?.[0];
    expect(call?.where?.employeeId).toBe("emp1");
    expect(call?.where?.tenantId).toBe(ARGS.tenantId);
  });

  it("does not query other scope tables", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    await resolvePermissions({ ...ARGS, prisma });
    expect(prisma.classSection.findMany).not.toHaveBeenCalled();
    expect(prisma.teachingDefault.findMany).not.toHaveBeenCalled();
    expect(prisma.sessionTeacher.findMany).not.toHaveBeenCalled();
  });
});

describe("resolvePermissions — OWN_PROGRAM scope", () => {
  it("derives programIds from class sections in assigned campuses", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: {
              rolePermissions: [rolePerm("OWN_CAMPUS"), rolePerm("OWN_PROGRAM")],
            },
          },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: {
        findMany: vi.fn().mockResolvedValue([{ campusId: "c1" }]),
      },
      classSection: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "cs1", programId: "TK_A" },
            { id: "cs2", programId: "TK_B" },
          ]),
      },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect([...r.programIds].sort()).toEqual(["TK_A", "TK_B"]);
  });

  it("returns empty programIds when user has no campus assignments", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: {
              rolePermissions: [rolePerm("OWN_PROGRAM")],
            },
          },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.programIds.size).toBe(0);
    expect(prisma.classSection.findMany).not.toHaveBeenCalled();
  });

  it("resolves OWN_PROGRAM independently of OWN_CAMPUS grant", async () => {
    // User has ONLY OWN_PROGRAM scope (not OWN_CAMPUS). Should still see
    // programs derived from active campus assignments.
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_PROGRAM")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: {
        findMany: vi.fn().mockResolvedValue([{ campusId: "c1" }]),
      },
      classSection: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cs1", programId: "TK_A" },
        ]),
      },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    // campusIds NOT exported because OWN_CAMPUS not granted
    expect(r.campusIds.size).toBe(0);
    // programIds derived correctly
    expect([...r.programIds]).toEqual(["TK_A"]);
  });
});

describe("resolvePermissions — EmployeeCampusAssignment date filtering", () => {
  it("excludes future-dated startDate (pre-assigned but not yet active)", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    await _resolvePermissionsForTest({
      ...ARGS,
      prisma,
      now: () => new Date("2026-05-05T00:00:00Z").getTime(),
    });
    const where = prisma.employeeCampusAssignment.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.AND).toBeDefined();
    const startDateClause = (where!.AND as Array<{ startDate?: { lte: Date } }>)
      .find((c) => c.startDate);
    expect(startDateClause?.startDate?.lte).toBeInstanceOf(Date);
  });

  it("excludes ended assignments (endDate <= now)", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    await resolvePermissions({ ...ARGS, prisma });
    const where = prisma.employeeCampusAssignment.findMany.mock.calls[0]?.[0]?.where;
    const endDateClause = (where!.AND as Array<{ OR?: unknown }>)
      .find((c) => "OR" in c);
    expect(endDateClause).toBeDefined();
  });
});

describe("resolvePermissions — OWN_CLASS scope", () => {
  it("merges sentra-teaching + walas class sections", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CLASS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      teachingDefault: {
        findMany: vi.fn().mockResolvedValue([
          { classSectionId: "cs1" },
          { classSectionId: "cs2" },
        ]),
      },
      classSection: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cs2", programId: "p1" }, // walas, dedupes with teaching cs2
          { id: "cs9", programId: "p2" },
        ]),
      },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect([...r.classIds].sort()).toEqual(["cs1", "cs2", "cs9"]);
  });

  it("filters teachingDefault to current term", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CLASS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    await resolvePermissions({ ...ARGS, prisma });
    const tdfWhere = prisma.teachingDefault.findMany.mock.calls[0]?.[0]?.where;
    expect(tdfWhere?.academicTermId).toBe(ARGS.currentTermId);
  });
});

describe("resolvePermissions — OWN_SESSION scope", () => {
  it("collects classSessionIds from SessionTeacher", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_SESSION")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      sessionTeacher: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { classSessionId: "ses1" },
            { classSessionId: "ses2" },
            { classSessionId: "ses1" }, // dup
          ]),
      },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect([...r.sessionIds].sort()).toEqual(["ses1", "ses2"]);
  });
});

describe("resolvePermissions — OWN_STUDENT scope (p2 stub)", () => {
  it("returns empty studentIds + studentScopeUnresolved:true + warns once per process", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_STUDENT")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    const warnSpy = vi.spyOn(console, "warn");
    const r1 = await resolvePermissions({ ...ARGS, prisma });
    const r2 = await resolvePermissions({
      ...ARGS,
      userId: "u2",
      prisma,
    });
    expect(r1.studentIds.size).toBe(0);
    expect(r1.studentScopeUnresolved).toBe(true);
    expect(r2.studentIds.size).toBe(0);
    expect(r2.studentScopeUnresolved).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("p2-students-guardians-household");
  });

  it("studentScopeUnresolved is false for users without OWN_STUDENT scope", async () => {
    const prisma = makePrisma();
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.studentScopeUnresolved).toBe(false);
  });
});

describe("resolvePermissions — SELF scope", () => {
  it("does not query scope tables (resolution at policy layer)", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("SELF")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.all).toBe(false);
    expect(prisma.employeeCampusAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.classSection.findMany).not.toHaveBeenCalled();
    expect(prisma.teachingDefault.findMany).not.toHaveBeenCalled();
    expect(prisma.sessionTeacher.findMany).not.toHaveBeenCalled();
  });
});

describe("resolvePermissions — caching", () => {
  it("returns cached result within TTL", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("ALL")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    let t = 1_000_000;
    const now = () => t;
    await _resolvePermissionsForTest({ ...ARGS, prisma, now });
    const callsBefore = prisma.userRole.findMany.mock.calls.length;
    t += CACHE_TTL_MS - 1;
    await _resolvePermissionsForTest({ ...ARGS, prisma, now });
    expect(prisma.userRole.findMany.mock.calls.length).toBe(callsBefore);
  });

  it("re-resolves after TTL expires", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("ALL")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    let t = 1_000_000;
    const now = () => t;
    await _resolvePermissionsForTest({ ...ARGS, prisma, now });
    t += CACHE_TTL_MS + 1;
    await _resolvePermissionsForTest({ ...ARGS, prisma, now });
    expect(prisma.userRole.findMany.mock.calls.length).toBe(2);
  });

  it("public resolvePermissions has no `now` parameter (fail-closed against attacker-controlled clock)", () => {
    type Args = Parameters<typeof resolvePermissions>[0];
    type HasNow = "now" extends keyof Args ? true : false;
    const v: HasNow = false;
    expect(v).toBe(false);
  });

  it("scopes cache by tenantId + userId + currentTermId triple", async () => {
    const prisma = makePrisma();
    await resolvePermissions({ ...ARGS, prisma });
    await resolvePermissions({ ...ARGS, userId: "u2", prisma });
    await resolvePermissions({ ...ARGS, tenantId: "t2", prisma });
    await resolvePermissions({ ...ARGS, currentTermId: "term-2026-2", prisma });
    expect(prisma.userRole.findMany.mock.calls.length).toBe(4);
  });

  it("clearPermissionCache forces re-resolution", async () => {
    const prisma = makePrisma();
    await resolvePermissions({ ...ARGS, prisma });
    clearPermissionCache();
    await resolvePermissions({ ...ARGS, prisma });
    expect(prisma.userRole.findMany.mock.calls.length).toBe(2);
  });
});

describe("resolvePermissions — overflow (>5000 cap)", () => {
  it("returns overflow:true + empty Sets when classIds > 5000", async () => {
    const tdfRows = Array.from({ length: ALLOWLIST_CAP + 1 }, (_, i) => ({
      classSectionId: `cs${i}`,
    }));
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CLASS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      teachingDefault: { findMany: vi.fn().mockResolvedValue(tdfRows) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.overflow).toBe(true);
    expect(r.classIds.size).toBe(0);
    expect(r.campusIds.size).toBe(0);
  });

  it("does not flag overflow at exactly the cap", async () => {
    const rows = Array.from({ length: ALLOWLIST_CAP }, (_, i) => ({
      classSectionId: `cs${i}`,
    }));
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CLASS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      teachingDefault: { findMany: vi.fn().mockResolvedValue(rows) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.overflow).toBe(false);
    expect(r.classIds.size).toBe(ALLOWLIST_CAP);
  });
});

describe("resolvePermissions — multi-scope merge", () => {
  it("evaluates all granted scopes in a single resolve", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          {
            role: {
              rolePermissions: [
                rolePerm("OWN_CAMPUS"),
                rolePerm("OWN_CLASS"),
                rolePerm("OWN_SESSION"),
              ],
            },
          },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: { findMany: vi.fn().mockResolvedValue([{ campusId: "c1" }]) },
      teachingDefault: { findMany: vi.fn().mockResolvedValue([{ classSectionId: "cs1" }]) },
      classSection: { findMany: vi.fn().mockResolvedValue([]) }, // walas empty
      sessionTeacher: { findMany: vi.fn().mockResolvedValue([{ classSessionId: "ses1" }]) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.campusIds.has("c1")).toBe(true);
    expect(r.classIds.has("cs1")).toBe(true);
    expect(r.sessionIds.has("ses1")).toBe(true);
  });

  it("merges duplicate scope grants from multiple roles", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
          { role: { rolePermissions: [rolePerm("OWN_SESSION")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
      employeeCampusAssignment: { findMany: vi.fn().mockResolvedValue([{ campusId: "c1" }]) },
      sessionTeacher: { findMany: vi.fn().mockResolvedValue([{ classSessionId: "ses1" }]) },
    });
    const r = await resolvePermissions({ ...ARGS, prisma });
    expect(r.campusIds.size).toBe(1);
    expect(prisma.employeeCampusAssignment.findMany.mock.calls.length).toBe(1);
  });
});

describe("resolvePermissions — tenant isolation", () => {
  it("forwards tenantId to userRole query", async () => {
    const prisma = makePrisma();
    await resolvePermissions({ ...ARGS, tenantId: "t-x", prisma });
    const call = prisma.userRole.findMany.mock.calls[0]?.[0];
    expect(call?.where?.tenantId).toBe("t-x");
  });

  it("forwards tenantId to employee lookup", async () => {
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
    });
    await resolvePermissions({ ...ARGS, tenantId: "t-x", prisma });
    const call = prisma.employee.findFirst.mock.calls[0]?.[0];
    expect(call?.where?.tenantId).toBe("t-x");
  });
});

describe("resolvePermissions — User.id vs supabaseUserId contract", () => {
  it("uses supabaseUserId (not userId) when looking up the Employee row", async () => {
    // Mismatched user/supabaseUser pair — proves the Step 2 query reads
    // args.supabaseUserId, not args.userId. Pre-fix this would have failed:
    // the Employee lookup keyed by User.id CUID instead of supabase uuid.
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue({ id: "emp1" }) },
    });
    await resolvePermissions({
      ...ARGS,
      userId: "user_cuid_abc",
      supabaseUserId: "supabase_uuid_xyz",
      prisma,
    });
    const where = prisma.employee.findFirst.mock.calls[0]?.[0]?.where;
    expect(where?.supabaseUserId).toBe("supabase_uuid_xyz");
    // Sanity: NOT the userId value
    expect(where?.supabaseUserId).not.toBe("user_cuid_abc");
    // And the role lookup keeps using args.userId (User.id)
    const userRoleWhere = prisma.userRole.findMany.mock.calls[0]?.[0]?.where;
    expect(userRoleWhere?.userId).toBe("user_cuid_abc");
  });

  it("returns empty employee-derived sets when supabaseUserId has no matching Employee row", async () => {
    // Grant OWN_CAMPUS via roles, but no Employee row matches supabaseUserId.
    // Resolver must short-circuit the campus assignment query and return
    // empty campusIds (NOT throw, NOT mis-key off args.userId).
    const prisma = makePrisma({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { rolePermissions: [rolePerm("OWN_CAMPUS")] } },
        ]),
      },
      employee: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const r = await resolvePermissions({
      ...ARGS,
      userId: "user_cuid_abc",
      supabaseUserId: "supabase_uuid_no_employee",
      prisma,
    });
    expect(r.campusIds.size).toBe(0);
    expect(r.all).toBe(false);
    expect(prisma.employeeCampusAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("getJwtTenantId", () => {
  it("returns tenant_id from JWT claims setting", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ tenant_id: "t-jwt" }]),
    };
    const t = await getJwtTenantId(prisma);
    expect(t).toBe("t-jwt");
  });

  it("returns null when JWT claim missing", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ tenant_id: null }]),
    };
    expect(await getJwtTenantId(prisma)).toBeNull();
  });

  it("returns null when no row returned", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    expect(await getJwtTenantId(prisma)).toBeNull();
  });

  it("uses RLS-pattern current_setting('request.jwt.claims', true)", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ tenant_id: "x" }]),
    };
    await getJwtTenantId(prisma);
    const sql = prisma.$queryRaw.mock.calls[0]?.[0];
    const sqlText = Array.isArray(sql) ? sql.join(" ") : String(sql);
    expect(sqlText).toContain("request.jwt.claims");
    expect(sqlText).toContain("tenant_id");
  });
});
