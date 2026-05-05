// Permission resolver per spec §4.2 + §6.4 + §6.5.
//
// resolvePermissions(args) returns materialized ID Sets for the seven
// PermissionScope members granted to a (userId, currentTermId) pair within a
// tenant. Sets are cached in-memory for 5 minutes per (tenant, user, term)
// triple. When any single scope's resolved cardinality would exceed
// ALLOWLIST_CAP (5000), the resolver returns `overflow: true` with empty
// Sets — callers must fall back to a JOIN subquery against the source table.
//
// Cache invalidation: in-memory only this cycle (single-process, MVP).
// Multi-instance staleness acceptable per spec §4.2 ("in-memory 5 min").
// `clearPermissionCache()` exposed for explicit role-mutation flows in
// downstream cycles + tests.

import type { ScaffoldScope } from "./entity";

export const ALLOWLIST_CAP = 5000;
export const CACHE_TTL_MS = 5 * 60 * 1000;

export type ResolvedPermissions = {
  readonly userId: string;
  readonly tenantId: string;
  readonly currentTermId: string;
  /** True when any granted permission carries `ALL` scope. */
  readonly all: boolean;
  readonly campusIds: ReadonlySet<string>;
  readonly programIds: ReadonlySet<string>;
  readonly classIds: ReadonlySet<string>;
  readonly sessionIds: ReadonlySet<string>;
  readonly studentIds: ReadonlySet<string>;
  /** Set when total resolved cardinality > ALLOWLIST_CAP — caller must JOIN. */
  readonly overflow: boolean;
  /**
   * True when OWN_STUDENT scope was granted but the Student model is not yet
   * in the schema (lands p2-students-guardians-household). Callers MUST treat
   * this as a fail-closed signal — do not interpret `studentIds.size === 0` as
   * "no permission set"; instead surface a server-side error or block the
   * page until p2 wires the resolver.
   */
  readonly studentScopeUnresolved: boolean;
};

// Minimal Prisma surface needed by the resolver. Tests pass a mock; production
// passes the real PrismaClient. Avoids importing the heavy generated client at
// type level so this module is testable in node + jsdom without DB connection.

type FindManyArgs = { where?: unknown; select?: unknown; include?: unknown };

type GrantedPermission = { resource: string; action: string; scope: string };
type UserRoleRow = {
  role: { rolePermissions: Array<{ permission: GrantedPermission }> };
};

export type PermissionPrismaLike = {
  userRole: { findMany(args: FindManyArgs): Promise<UserRoleRow[]> };
  employee: {
    findFirst(args: FindManyArgs): Promise<{ id: string } | null>;
  };
  employeeCampusAssignment: {
    findMany(args: FindManyArgs): Promise<Array<{ campusId: string }>>;
  };
  classSection: {
    findMany(args: FindManyArgs): Promise<
      Array<{ id: string; programId: string }>
    >;
  };
  teachingDefault: {
    findMany(args: FindManyArgs): Promise<Array<{ classSectionId: string }>>;
  };
  sentraRotation: {
    findMany(args: FindManyArgs): Promise<Array<{ classSectionId: string }>>;
  };
  sessionTeacher: {
    findMany(args: FindManyArgs): Promise<Array<{ classSessionId: string }>>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type CacheEntry = { value: ResolvedPermissions; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, userId: string, currentTermId: string): string {
  return `${tenantId}|${userId}|${currentTermId}`;
}

export function clearPermissionCache(): void {
  cache.clear();
}

// Single warn per process for OWN_STUDENT before Student model lands (p2).
let warnedMissingStudent = false;
export function _resetMissingStudentWarning(): void {
  warnedMissingStudent = false;
}

export type ResolveArgs = {
  userId: string;
  tenantId: string;
  currentTermId: string;
  prisma: PermissionPrismaLike;
};

/** Test-only seam — clock injection for cache-TTL tests. Not exported. */
type InternalArgs = ResolveArgs & { now?: () => number };

export async function resolvePermissions(
  args: ResolveArgs,
): Promise<ResolvedPermissions> {
  return resolvePermissionsInternal(args);
}

export async function _resolvePermissionsForTest(
  args: InternalArgs,
): Promise<ResolvedPermissions> {
  return resolvePermissionsInternal(args);
}

async function resolvePermissionsInternal(
  args: InternalArgs,
): Promise<ResolvedPermissions> {
  const now = args.now ?? Date.now;
  const key = cacheKey(args.tenantId, args.userId, args.currentTermId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.value;

  // Step 1 — load all (resource, action, scope) tuples granted via roles.
  const userRoles = await args.prisma.userRole.findMany({
    where: { userId: args.userId, tenantId: args.tenantId },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  });

  const grantedScopes = new Set<ScaffoldScope>();
  for (const ur of userRoles) {
    for (const rp of ur.role.rolePermissions) {
      grantedScopes.add(rp.permission.scope as ScaffoldScope);
    }
  }

  const all = grantedScopes.has("ALL");

  // Step 2 — find Employee row owned by this user (single).
  const employee = await args.prisma.employee.findFirst({
    where: { tenantId: args.tenantId, supabaseUserId: args.userId, deletedAt: null },
    select: { id: true },
  });
  const employeeId: string | null = employee?.id ?? null;

  // Step 3 — materialize per-scope ID sets.
  const campusIds = new Set<string>();
  const programIds = new Set<string>();
  const classIds = new Set<string>();
  const sessionIds = new Set<string>();
  const studentIds = new Set<string>();

  // Active employee-campus assignments — needed by both OWN_CAMPUS and
  // OWN_PROGRAM scopes (programs are derived from class sections in active
  // campuses). Loaded once if either scope is granted; only exported on
  // `campusIds` when OWN_CAMPUS is granted.
  const employeeCampusIds = new Set<string>();
  const wantsCampus = all || grantedScopes.has("OWN_CAMPUS");
  const wantsProgram = all || grantedScopes.has("OWN_PROGRAM");
  if (employeeId && (wantsCampus || wantsProgram)) {
    const today = new Date(now());
    const rows = await args.prisma.employeeCampusAssignment.findMany({
      where: {
        employeeId,
        tenantId: args.tenantId,
        AND: [
          { OR: [{ endDate: null }, { endDate: { gt: today } }] },
          { startDate: { lte: today } },
        ],
      },
      select: { campusId: true },
    });
    for (const r of rows) employeeCampusIds.add(r.campusId);
  }
  if (wantsCampus) {
    for (const id of employeeCampusIds) campusIds.add(id);
  }
  if (employeeId && wantsProgram && employeeCampusIds.size > 0) {
    const rows = await args.prisma.classSection.findMany({
      where: {
        tenantId: args.tenantId,
        deletedAt: null,
        campusId: { in: [...employeeCampusIds] },
      },
      select: { id: true, programId: true },
    });
    for (const r of rows) programIds.add(r.programId);
  }

  if (employeeId && (all || grantedScopes.has("OWN_CLASS"))) {
    // Sentra-teacher mappings for the current term.
    const tdf = await args.prisma.teachingDefault.findMany({
      where: {
        employeeId,
        tenantId: args.tenantId,
        academicTermId: args.currentTermId,
      },
      select: { classSectionId: true },
    });
    for (const t of tdf) classIds.add(t.classSectionId);
    // Walas mappings — class sections where this employee is homeroom teacher.
    const walas = await args.prisma.classSection.findMany({
      where: {
        tenantId: args.tenantId,
        walasEmployeeId: employeeId,
        deletedAt: null,
      },
      select: { id: true, programId: true },
    });
    for (const c of walas) classIds.add(c.id);
  }

  if (employeeId && (all || grantedScopes.has("OWN_SESSION"))) {
    const rows = await args.prisma.sessionTeacher.findMany({
      where: { teacherEmployeeId: employeeId, tenantId: args.tenantId },
      select: { classSessionId: true },
    });
    for (const r of rows) sessionIds.add(r.classSessionId);
  }

  // OWN_STUDENT — Student model lands p2-students-guardians-household.
  // Emit a single warn so p2 integration testing surfaces wiring gaps loudly.
  // Result carries `studentScopeUnresolved: true` so callers fail-closed
  // rather than misinterpreting the empty set.
  const studentScopeUnresolved = grantedScopes.has("OWN_STUDENT");
  if (studentScopeUnresolved && !warnedMissingStudent) {
    console.warn(
      `[scaffold/permission] OWN_STUDENT scope requested for userId=${args.userId} ` +
        `but Student model not yet in schema (lands p2-students-guardians-household). ` +
        `Returning empty studentIds Set + studentScopeUnresolved=true.`,
    );
    warnedMissingStudent = true;
  }

  // Step 4 — overflow check (per-scope, not aggregate, to surface a single
  // overgrown scope clearly). Per spec §4.2: cap allowlist at 5000.
  const overflow =
    campusIds.size > ALLOWLIST_CAP ||
    programIds.size > ALLOWLIST_CAP ||
    classIds.size > ALLOWLIST_CAP ||
    sessionIds.size > ALLOWLIST_CAP ||
    studentIds.size > ALLOWLIST_CAP;

  // Overflow empties materialized Sets — caller MUST fall back to a JOIN
  // subquery against the source table. `all: true` is preserved because ALL
  // is a "no cap applies" signal, not a materialized list. (In practice, ALL
  // never produces overflow because ALL never materializes IDs at all.)
  const result: ResolvedPermissions = Object.freeze({
    userId: args.userId,
    tenantId: args.tenantId,
    currentTermId: args.currentTermId,
    all,
    campusIds: overflow ? new Set<string>() : campusIds,
    programIds: overflow ? new Set<string>() : programIds,
    classIds: overflow ? new Set<string>() : classIds,
    sessionIds: overflow ? new Set<string>() : sessionIds,
    studentIds: overflow ? new Set<string>() : studentIds,
    overflow,
    studentScopeUnresolved,
  });

  cache.set(key, { value: result, expiresAt: now() + CACHE_TTL_MS });
  return result;
}

/**
 * Read tenant_id from the Postgres `request.jwt.claims` setting injected by
 * the Supabase Custom Access Token Hook (spec §6.5). Mirrors the RLS pattern
 * in `verify-rls-coverage.sh` policies. Caller is responsible for setting
 * the JWT context (typically via PostgREST or an explicit `set_config` call).
 */
export async function getJwtTenantId(
  prisma: Pick<PermissionPrismaLike, "$queryRaw">,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string | null }>>`
    SELECT (current_setting('request.jwt.claims', true)::json->>'tenant_id') as tenant_id
  `;
  return rows[0]?.tenant_id ?? null;
}
