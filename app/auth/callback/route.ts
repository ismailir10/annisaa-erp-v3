// @public — OAuth callback handler. WRITES the session (no getSession() call).
//
// Verified against verify-api-auth.sh allowlist via the `// @public` sentinel.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §8.1
// Cycle: docs/cycles/2026-05-06-p1-auth-google-oauth.md (T6)
//
// Flow:
//   1. Read ?code= → exchangeCodeForSession (PKCE one-shot; double-click =
//      invalid_grant → redirect /auth/error?reason=oauth_provider_declined).
//   2. Resolve User by EMAIL (findMany take:2) — enforce one-tenant invariant
//      at callback time. The runtime defensive check in getSession is
//      fail-closed but not user-actionable; this redirect path IS.
//   3. Count UserRole rows — User w/o any role → no_role_assigned redirect
//      (deliberate fail-loud; JWT hook uses LEFT JOIN so unroled would
//      otherwise produce a tenant_id-only token + empty result sets).
//   4. Backfill supabaseUserId on first login (audit UPDATE).
//   5. Validate ?next= via two-layer regex + URL.origin same-origin check.
//   6. Reset school-erp-last-active idle-timeout cookie before redirect to
//      portal path (otherwise stale demo-session timestamp loops the user
//      back to / via proxy.ts enforceIdleTimeout).
//
// Cookie-write survival: ambient cookies().set() writes do NOT carry over
// to NextResponse.redirect() from a route handler (vercel/next.js#49442,
// not fixed in Next.js 16). v1 pattern: capture pending cookies in an
// array via the createServerClient `setAll` callback, then re-apply each
// to the final redirect response. Without this the Set-Cookie headers
// are dropped and the next request lands without a session.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveCallbackOrigin } from "@/lib/auth/callback-origin";
import { DEMO_SUPABASE_PREFIX } from "@/lib/auth/demo-cookie";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { AuditAction } from "@/lib/generated/prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Extract the client IP from forwarding headers (Vercel/standard proxy chain).
 * Trust the leftmost `x-forwarded-for` entry — Next.js 15+ removed
 * `request.ip`, so the header is the only reliable source. Falls back to
 * `x-real-ip` then `"unknown"`. A flood of `"unknown"` hits trips the per-key
 * limit faster (single shared bucket), which is the desired conservative
 * behavior — better to over-throttle anonymous load than to leak unmetered
 * traffic.
 */
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

type PendingCookie = {
  name: string;
  value: string;
  options: Parameters<ReturnType<typeof NextResponse.next>["cookies"]["set"]>[2];
};

const PORTAL_PREFIXES = ["/admin", "/teacher", "/parent"] as const;

function isPortalPath(path: string): boolean {
  return PORTAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Validate ?next= redirect target — three-layer defense (per spec-time review M3).
 *  - Layer 0: reject percent-encoded path separators (`%2F`, `%5C`). The URL
 *    constructor preserves these in `pathname` w/o decoding, so Layer 2's
 *    `URL.origin === base` would pass for `/%2Fevil.com` even though browsers
 *    may treat the decoded path as protocol-relative on some redirects.
 *  - Layer 1: regex `^/[^/]` rejects literal protocol-relative `//evil.com`
 *    and backslash-prefixed paths.
 *  - Layer 2: `new URL(next, base).origin === base` defends against any
 *    remaining same-origin escape attempts the regex misses.
 * Returns the validated path or null. Caller falls back to /admin on null.
 */
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  // Reject any percent-encoded slash/backslash variants — single-encoded
  // (`%2F`/`%5C`), double-encoded (`%252F`/`%255C`, which decode through a
  // downstream `decodeURIComponent` to the single-encoded form), and the
  // literal `%25` which is the gateway to any future re-encoding tier.
  if (/%(2[Ff]|5[Cc]|25)/.test(next)) return null;
  if (!/^\/[^/]/.test(next)) return null;
  try {
    const base = "http://localhost";
    const u = new URL(next, base);
    if (u.origin !== base) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");

  const base = resolveCallbackOrigin(request);
  const pending: PendingCookie[] = [];

  function respond(path: string): NextResponse {
    const res = NextResponse.redirect(`${base}${path}`);
    for (const c of pending) {
      res.cookies.set(c.name, c.value, c.options);
    }
    // Reset idle-timeout cookie on fresh login to portal paths. Without this,
    // a stale `school-erp-last-active` from a prior demo session causes
    // proxy.ts enforceIdleTimeout to redirect /admin → / immediately.
    if (isPortalPath(path)) {
      res.cookies.set("school-erp-last-active", String(Date.now()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }
    return res;
  }

  function errorRedirect(reason: string): NextResponse {
    return respond(`/auth/error?reason=${encodeURIComponent(reason)}`);
  }

  if (!code) return errorRedirect("missing_code");

  // Per-IP rate-limit gate — runs AFTER code-extract so the missing_code path
  // stays cheap, BEFORE the Supabase exchange so a flood of valid-shape
  // requests cannot drive Supabase auth load. Scope is `oauth_callback`;
  // limit defaults from `RATE_LIMIT_REQUESTS_PER_MINUTE` env (60/min).
  // Reject path matches the route's redirect-error contract — login lands at
  // `/login?error=rate_limit` (NOT a 429 JSON body), so the user sees a
  // standard error toast instead of a raw HTTP error.
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: ip, scope: "oauth_callback" });
  if (!rateLimit.ok) {
    console.warn(
      `[auth/callback] rate-limited ip=${ip} retryAfterMs=${rateLimit.retryAfterMs}`,
    );
    return NextResponse.redirect(new URL("/login?error=rate_limit", request.url));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            pending.push({ name: c.name, value: c.value, options: c.options });
          }
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // Covers both provider-declined errors AND PKCE-code-reuse (invalid_grant).
    console.error("[auth/callback] exchangeCodeForSession failed:", exchangeError.message);
    return errorRedirect("oauth_provider_declined");
  }

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user?.email) {
    console.error("[auth/callback] no user/email after exchange:", userError?.message);
    return errorRedirect("oauth_provider_declined");
  }
  const supabaseUser = userResult.user;
  const email = supabaseUser.email!;

  // Resolve User row by email — enforce one-Supabase-account ↔ one-tenant.
  // schema.prisma:273 has no @@unique on email; findMany take:2 is the only
  // fail-closed defense at the application layer.
  const rows = await prisma.user.findMany({
    where: { email, isActive: true, deletedAt: null },
    select: { id: true, tenantId: true, supabaseUserId: true },
    take: 2,
  });

  if (rows.length === 0) return errorRedirect("no_invitation");
  if (rows.length > 1) {
    console.error(
      `[auth/callback] cross_tenant_email: ${email} matches ${rows.length} active User rows`,
    );
    return errorRedirect("cross_tenant_email");
  }
  const row = rows[0];

  // Identity-collision: User row already bound to a different Supabase user.
  // Reject + log; the legitimate path is admin-issued reset (out of scope).
  // Exception: `demo:*` synthetic prefix from /api/_demo/login is overwritten
  // on first real login — otherwise a User who was demo'd locally would be
  // permanently stuck on prod login (T8 review MAJOR).
  const isDemoSynthetic =
    row.supabaseUserId !== null && row.supabaseUserId.startsWith(DEMO_SUPABASE_PREFIX);
  if (row.supabaseUserId && row.supabaseUserId !== supabaseUser.id && !isDemoSynthetic) {
    console.error(
      `[auth/callback] identity_collision: User ${row.id} bound to ${row.supabaseUserId}, ` +
        `OAuth supplied ${supabaseUser.id}`,
    );
    return errorRedirect("identity_collision");
  }

  // No-role-assigned guard (per spec-time review finding M2). User exists but
  // no UserRole rows means provisioning incomplete. JWT hook would emit a
  // tenant_id-only token; portal RLS reads return empty sets — fail-soft.
  // This callback is the SOLE gate that fails-loud.
  const roleCount = await prisma.userRole.count({
    where: { userId: row.id, tenantId: row.tenantId },
  });
  if (roleCount === 0) {
    console.error(`[auth/callback] no_role_assigned: User ${row.id} has 0 UserRole rows`);
    return errorRedirect("no_role_assigned");
  }

  // Backfill supabaseUserId on first login via a CAS-style updateMany —
  // updates ONLY if supabaseUserId is still null OR is a demo:* synthetic
  // value (cleaned up here so a User who was demo'd locally can log in
  // for real). Two simultaneous fresh OAuth flows for the same User row
  // both pass the read-time null check, but exactly one wins the CAS
  // write; the loser sees count === 0 and re-fetches to confirm identity
  // match. Without CAS, the second writer could clobber a different
  // supabaseUserId set by a concurrent flow, bypassing the
  // identity_collision guard above.
  const needsBackfill = row.supabaseUserId === null || isDemoSynthetic;
  if (needsBackfill) {
    const casWhere = isDemoSynthetic
      ? { id: row.id, supabaseUserId: row.supabaseUserId } // exact-match the demo:... value
      : { id: row.id, supabaseUserId: null };
    const cas = await prisma.user.updateMany({
      where: casWhere,
      data: { supabaseUserId: supabaseUser.id, lastLoginAt: new Date() },
    });
    if (cas.count === 1) {
      // Won the race — record audit. Audit failures are non-fatal: the
      // backfill already committed and the user has a valid session;
      // stranding the user on a partition-trigger throw or DB-glitch would
      // re-show "Login Google ditolak" on the next click w/ no state hint.
      try {
        await writeAuditLog({
          tenantId: row.tenantId,
          actorUserId: row.id,
          action: AuditAction.UPDATE,
          resource: "User",
          resourceId: row.id,
          before: { supabaseUserId: row.supabaseUserId },
          after: { supabaseUserId: supabaseUser.id },
        });
      } catch (auditErr) {
        console.error(
          "[auth/callback] writeAuditLog failed (non-fatal, backfill committed):",
          auditErr,
        );
      }
    } else {
      // Lost the race — concurrent callback set supabaseUserId. Confirm it
      // matches the current Supabase user; reject if a different account.
      const refetch = await prisma.user.findUnique({
        where: { id: row.id },
        select: { supabaseUserId: true },
      });
      if (!refetch || refetch.supabaseUserId !== supabaseUser.id) {
        console.error(
          `[auth/callback] identity_collision (post-race): expected ${supabaseUser.id}, ` +
            `found ${refetch?.supabaseUserId ?? "<null>"}`,
        );
        return errorRedirect("identity_collision");
      }
      // Race winner stamped the same supabaseUserId — bump lastLoginAt only.
      await prisma.user.update({
        where: { id: row.id },
        data: { lastLoginAt: new Date() },
      });
    }
  } else {
    // supabaseUserId already matches — bump lastLoginAt only.
    await prisma.user.update({
      where: { id: row.id },
      data: { lastLoginAt: new Date() },
    });
  }

  const safe = safeNextPath(nextParam);
  return respond(safe ?? "/admin");
}
