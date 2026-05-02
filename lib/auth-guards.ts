import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "./auth";
import { hasPermission, type PermissionCode } from "./permissions";

/**
 * API-route permission guard.
 *
 * Returns `{ session }` when the caller is authenticated, carries a `tenantId`,
 * and holds `perm` (either via enum-role defaults or a custom-role grant).
 * Otherwise returns `{ error: Response }` ready to be returned from the
 * handler — discriminated via `"error" in result`.
 *
 * Shape matches `requireAdmin` in `lib/student-journal/guards.ts` but uses the
 * permission layer (`hasPermission`) instead of role-enum equality. Use this
 * for every HR-gated handler; reserve `requireAdmin` for coarse admin-only
 * routes that pre-date the RBAC table.
 *
 * Response bodies:
 *   - 401 `{ error: "unauthorized" }` — no session.
 *   - 401 `{ error: "no-tenant" }` — session without tenantId (should not
 *     happen in the single-tenant MVP but fails loud).
 *   - 403 `{ error: "forbidden", missing: perm }` — authenticated but missing
 *     the required permission. The `missing` field is intentional so clients
 *     (and tests) can distinguish which permission gate fired.
 */
export async function requirePermission(
  perm: PermissionCode,
): Promise<
  | { session: SessionUser & { tenantId: string } }
  | { error: Response }
> {
  const session = await getSession();
  if (!session) {
    return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!session.tenantId) {
    return { error: Response.json({ error: "no-tenant" }, { status: 401 }) };
  }
  if (!hasPermission(session, perm)) {
    return {
      error: Response.json(
        { error: "forbidden", missing: perm },
        { status: 403 },
      ),
    };
  }
  // tenantId is narrowed to `string` above — the return type reflects that
  // so handlers can pass `session.tenantId` to helpers expecting non-null.
  return { session: session as SessionUser & { tenantId: string } };
}

/**
 * Server-component / page.tsx permission guard.
 *
 * Resolves to the `SessionUser` on pass. On failure, calls `redirect()` from
 * `next/navigation` — which throws a NEXT_REDIRECT internally, so the function
 * effectively never returns on the failure path and callers can treat the
 * return type as always-populated.
 *
 * Redirect targets:
 *   - No session or missing `tenantId` → `/` (login or landing).
 *   - Authenticated but missing `perm` → `/admin` (bounce to admin home
 *     rather than loop back to login).
 *
 * WARNING — redirect-loop contract:
 *   The `/admin` redirect target MUST stay permission-free. If `/admin/page.tsx`
 *   or `/admin/layout.tsx` ever wraps itself in `assertPermission(...)` that a
 *   user lacks, the redirect bounces back into the same page and loops (307
 *   storm). Any future `/admin` gate must use a permission every authenticated
 *   admin persona already holds (e.g. `settings.view`), or this helper must be
 *   updated to target a dedicated unguarded `/admin/forbidden` page.
 *
 * Use at the top of a server component or route-group layout:
 *     const session = await assertPermission("hr.view");
 */
export async function assertPermission(
  perm: PermissionCode,
): Promise<SessionUser> {
  const session = await getSession();
  if (!session || !session.tenantId) {
    redirect("/");
  }
  if (!hasPermission(session, perm)) {
    redirect("/admin");
  }
  return session;
}
