// Layout-level portal-role guard per cycle p2-portal-shell-sidebar SD1.
//
// `assertPortalAccess(portal)` is called from the three portal layout files
// (`app/{admin,teacher,parent}/layout.tsx`). Resolves the session, verifies
// the role belongs to the portal's allowed set, and either returns the
// session or invokes `redirect("/")`.
//
// SD1 — redirect("/") was chosen over `notFound()` because:
//   1. The existing idle-timeout handler in `proxy.ts:36-42` already
//      redirects mismatched-state requests to "/" — consistent UX.
//   2. Route names are public knowledge in the Next.js client manifest
//      (`_buildManifest.js` ships every route segment) — `notFound()`
//      buys no security.
//   3. UX: a stale link to `/admin/foo` for a parent lands on the public
//      home rather than a confusing 404.
//
// Future: a distinct `/login` route will swap the unauthed branch to
// `redirect("/login?next=<original>")` post-`p2-auth-google-oauth-followup`.
// Out of scope this cycle.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

import { redirect } from "next/navigation";

import { getSession, type SessionContext } from "@/lib/auth/session";
import type { RoleCode } from "@/lib/entities/_types";

export type PortalKey = "admin" | "teacher" | "parent";

/**
 * Allowed-roles set per portal. Frozen at module load. Adding a new role to
 * `ROLE_CODES` does NOT auto-grant any portal — explicit edit here required.
 *
 * Per foundation §10A.1:
 *   • admin    → administrative + finance + admission + leadership roles.
 *   • teacher  → homeroom_teacher + sentra_teacher.
 *   • parent   → parent only.
 */
export const ALLOWED_ROLES: Readonly<Record<PortalKey, ReadonlySet<RoleCode>>> =
  Object.freeze({
    admin: new Set<RoleCode>([
      "admin",
      "principal",
      "kadiv",
      "admission_officer",
      "finance_officer",
    ]),
    teacher: new Set<RoleCode>(["homeroom_teacher", "sentra_teacher"]),
    parent: new Set<RoleCode>(["parent"]),
  });

/**
 * Layout guard: resolves session, redirects on mismatch or unauthed.
 * Returns the session for downstream consumers (e.g. layout-level user-menu).
 *
 * `redirect()` throws a special Next.js error that propagates up through
 * the RSC boundary — the calling layout's render is aborted before any
 * children render. Same pattern as Next.js docs example for auth checks.
 */
export async function assertPortalAccess(
  portal: PortalKey,
): Promise<SessionContext> {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  if (!ALLOWED_ROLES[portal].has(session.role)) {
    redirect("/");
  }
  return session;
}
