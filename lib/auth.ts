import { cache } from "react";
import { createClient } from "./supabase/server";
import { prisma } from "./db";
import { getSystemRolePermissions } from "./permissions";

// User row shape we cache — includes the optional customRole relation because
// session resolution needs the role's permission JSON and code on every hit.
type CachedUser = NonNullable<
  Awaited<ReturnType<typeof prisma.user.findFirst>>
> & {
  customRole?: {
    id: string;
    code: string;
    permissions: string;
  } | null;
};

type CachedEntry = {
  user: CachedUser;
  permissions: string[];
  customRoleCode: string | null;
  expiresAt: number;
};

// In-memory cache of Prisma User rows keyed by email. Every API route and
// every server-rendered page calls getSession(), and previously each call hit
// the database for the same User row. TTL is 10s — long enough to collapse
// the cluster of fetches a single page render makes, short enough that
// role/tenant/status changes propagate within one user page-navigation.
// See README ADR on userCache staleness window.
//
// The cache stores the derived permissions/customRoleCode alongside the raw
// User row so we don't re-parse the customRole.permissions JSON on every hit —
// every request can trigger many getSession() calls, and re-derivation would
// mean repeated JSON.parse + getSystemRolePermissions() for the same user.
const USER_CACHE_TTL_MS = 10_000;
const userCache = new Map<string, CachedEntry>();

function getCachedEntry(email: string): CachedEntry | undefined {
  const entry = userCache.get(email);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    userCache.delete(email);
    return undefined;
  }
  return entry;
}

function setCachedEntry(
  email: string,
  user: CachedUser,
  permissions: string[],
  customRoleCode: string | null,
) {
  userCache.set(email, {
    user,
    permissions,
    customRoleCode,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
}

/**
 * Derive the effective permission set + custom-role code for a loaded user.
 *
 * Precedence:
 *   1. customRole present → parse customRole.permissions JSON.
 *   2. No customRole → fall back to getSystemRolePermissions(user.role).
 *
 * Defensive on malformed JSON: we log and fall back to role defaults rather
 * than silently granting `[]` to a user who should have access. Failing closed
 * here would lock an admin out of the whole app if one customRole row gets
 * corrupted.
 */
function derivePermissions(
  user: CachedUser,
): { permissions: string[]; customRoleCode: string | null } {
  const customRole = user.customRole;
  if (customRole) {
    try {
      const parsed = JSON.parse(customRole.permissions);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
        return { permissions: parsed, customRoleCode: customRole.code };
      }
      console.error(
        `[AUTH] customRole.permissions for role ${JSON.stringify(customRole.code)} is not a string[] — falling back to role defaults`,
      );
    } catch {
      console.error(
        `[AUTH] Failed to parse customRole.permissions for role ${JSON.stringify(customRole.code)} — falling back to role defaults`,
      );
    }
    // malformed → fall back to enum-role defaults, but keep customRoleCode
    // so downstream code can still see which role the user is linked to.
    return {
      permissions: getSystemRolePermissions(user.role),
      customRoleCode: customRole.code,
    };
  }
  return {
    permissions: getSystemRolePermissions(user.role),
    customRoleCode: null,
  };
}

// Multi-tenant safety rail. Session resolution currently keys on email
// alone (single-tenant MVP). Throwing early forces whoever onboards a
// second tenant to implement tenant-from-host resolution before the
// silent cross-tenant collapse bug lands in production.
//
// Result is cached for SINGLE_TENANT_CHECK_TTL_MS so hot paths don't
// hit the DB on every getSession() call. The TTL is short enough that a
// freshly seeded second tenant fires the guard within ~1 minute — we
// explicitly refuse to cache forever, because the one moment the guard
// must fire (tenant seeded after process start) is exactly when a
// permanent flag would silently bypass it.
const SINGLE_TENANT_CHECK_TTL_MS = 60_000;
let singleTenantCheckedAt = 0;
export async function assertSingleTenant(): Promise<void> {
  if (Date.now() - singleTenantCheckedAt < SINGLE_TENANT_CHECK_TTL_MS) return;
  const count = await prisma.tenant.count();
  if (count > 1) {
    throw new Error(
      `[AUTH] Multi-tenant seed detected (tenant.count=${count}) but session ` +
        `resolver keys on email alone. Implement tenant-from-host resolution ` +
        `in lib/auth.ts before onboarding a second tenant.`,
    );
  }
  singleTenantCheckedAt = Date.now();
}

export type SessionUser = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN";
  name: string | null;
  tenantId: string | null;
  employeeId: string | null;
  parentId: string | null;
  /**
   * Effective permission codes for this session. Derived from either the
   * user's customRole (JSON array) or getSystemRolePermissions(role) when no
   * custom role is assigned. Always an array — never null — so callers can
   * `.includes()` without a guard.
   */
  permissions: string[];
  /**
   * Code of the assigned customRole, or null when the user falls back to
   * their enum role defaults. Useful for UI labels ("Peran: Finance Admin").
   */
  customRoleCode: string | null;
};

/** Full access including payroll and salary data. */
export const isSuperAdmin = (role: string): boolean => role === "SUPER_ADMIN";

/** Either admin persona — can access /admin but not necessarily salary data. */
export const isAdminRole = (role: string): boolean =>
  role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";

/** Guard for salary-bearing routes and UI. Only SUPER_ADMIN passes. */
export const canViewSalary = (role: string): boolean => role === "SUPER_ADMIN";

/**
 * Get the current session user.
 * Reads Supabase Auth session, then looks up the Prisma User by email.
 * Auto-creates the Prisma User on first login if employee exists with that email.
 *
 * Wrapped in React's `cache()` so that layout + page + server components in
 * the same request dedupe to a single Supabase auth + Prisma lookup. This is
 * complementary to the 60s in-memory `userCache` above: `cache()` dedupes
 * within a single request, `userCache` dedupes across requests.
 */
export const getSession = cache(_getSession);

async function _getSession(): Promise<SessionUser | null> {
  // Demo mode requires explicit opt-in via DEMO_MODE=true env var.
  // This prevents accidental demo activation in production if Supabase is down.
  if (process.env.DEMO_MODE === "true") {
    return getDemoSession();
  }

  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser?.email) return null;

    // Multi-tenant safety rail: single-tenant MVP resolves User by email
    // alone. The moment a second tenant is seeded, `findFirst({ email })`
    // collapses across tenants and returns whichever row Postgres picks
    // first — silent cross-tenant leak. Fail loud instead.
    await assertSingleTenant();

    // Look up Prisma User by email — serve from cache if fresh.
    // status: "ACTIVE" filter ensures a deactivated user loses access
    // within USER_CACHE_TTL_MS of the admin-UI toggle.
    let cached = getCachedEntry(authUser.email);
    let user: CachedUser | null = cached?.user ?? null;
    if (!cached) {
      // email is unique per-tenant — findFirst returns the only match
      // in the single-tenant MVP; guarded by assertSingleTenant above.
      // include customRole so derivePermissions can read its JSON without
      // a follow-up query.
      user = (await prisma.user.findFirst({
        where: { email: authUser.email, status: "ACTIVE" },
        include: { customRole: true },
      })) as CachedUser | null;
      if (user) {
        const derived = derivePermissions(user);
        setCachedEntry(authUser.email, user, derived.permissions, derived.customRoleCode);
        cached = getCachedEntry(authUser.email);
      }
    }

    // Auto-create User on first Supabase Auth login.
    //
    // Precedence: Employee-first. If an email matches both Employee and
    // Parent (e.g. a teacher whose spouse is also a guardian using the
    // same email), the user is auto-provisioned as TEACHER. This matches
    // the routing fallback in app/auth/callback/route.ts (Employee check
    // before Parent check) so both code paths agree on the final role.
    // Admin override: an admin can manually create a GUARDIAN User row
    // before first login to force the Parent role.
    if (!user) {
      // Check if there's an employee with this email
      const employee = await prisma.employee.findFirst({
        where: { email: authUser.email },
      });

      if (employee) {
        // Create Teacher user linked to employee
        user = (await prisma.user.create({
          data: {
            tenantId: employee.tenantId,
            email: authUser.email,
            role: "TEACHER",
            name: employee.nama,
            employeeId: employee.id,
          },
          include: { customRole: true },
        })) as CachedUser;
        const derived = derivePermissions(user);
        setCachedEntry(authUser.email, user, derived.permissions, derived.customRoleCode);
        cached = getCachedEntry(authUser.email);
      } else {
        // Check if there's a parent with this email
        const parent = await prisma.parent.findFirst({
          where: { email: authUser.email },
        });

        if (parent) {
          user = (await prisma.user.create({
            data: {
              tenantId: parent.tenantId,
              email: authUser.email,
              role: "GUARDIAN",
              name: parent.name,
              parentId: parent.id,
            },
            include: { customRole: true },
          })) as CachedUser;
          const derived = derivePermissions(user);
          setCachedEntry(authUser.email, user, derived.permissions, derived.customRoleCode);
          cached = getCachedEntry(authUser.email);
        } else {
          // Not an employee, not a guardian, no existing User → deny access
          return null;
        }
      }
    }

    if (!user) return null;

    // Update last login — skip if updated within last 5 minutes to avoid
    // writing on every single getSession() call (every API route + page load).
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    if (!user.lastLoginAt || user.lastLoginAt < fiveMinutesAgo) {
      const updated = (await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
        include: { customRole: true },
      })) as CachedUser;
      const derived = derivePermissions(updated);
      setCachedEntry(updated.email, updated, derived.permissions, derived.customRoleCode);
      cached = getCachedEntry(updated.email);
      user = updated;
    }

    // For guardian users, find their parent ID
    let parentId: string | null = (user as { parentId?: string | null }).parentId ?? null;
    if (user.role === "GUARDIAN" && !parentId) {
      const parent = await prisma.parent.findFirst({ where: { email: user.email } });
      parentId = parent?.id ?? null;
    }

    // Fallback derivation in the rare case the cache entry wasn't populated
    // above (e.g. setCachedEntry skipped due to race). Matches the
    // invariant that SessionUser.permissions is always populated.
    const { permissions, customRoleCode } = cached
      ? { permissions: cached.permissions, customRoleCode: cached.customRoleCode }
      : derivePermissions(user);

    return {
      id: user.id,
      email: user.email,
      role: user.role as SessionUser["role"],
      name: user.name,
      tenantId: user.tenantId,
      employeeId: user.employeeId,
      parentId,
      permissions,
      customRoleCode,
    };
  } catch {
    // In production, don't fall back to demo mode on auth errors.
    // Return null so the middleware redirects to login.
    console.error("[AUTH] Session retrieval failed");
    return null;
  }
}

/**
 * Demo mode fallback — cookie-based auth for local development.
 */
async function getDemoSession(): Promise<SessionUser | null> {
  // Dynamic import to avoid issues in production
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const userId = cookieStore.get("school-erp-session")?.value;
  if (!userId) return null;

  const user = (await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    include: { customRole: true },
  })) as CachedUser | null;
  if (!user) return null;

  let parentId: string | null = (user as { parentId?: string | null }).parentId ?? null;
  if (user.role === "GUARDIAN" && !parentId) {
    const parent = await prisma.parent.findFirst({ where: { email: user.email } });
    parentId = parent?.id ?? null;
  }

  const { permissions, customRoleCode } = derivePermissions(user);

  return {
    id: user.id,
    email: user.email,
    role: user.role as SessionUser["role"],
    name: user.name,
    tenantId: user.tenantId,
    employeeId: user.employeeId,
    parentId,
    permissions,
    customRoleCode,
  };
}
