import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { applySecurityHeaders } from "@/lib/security/headers";

const DEMO_COOKIE = "school-erp-session";
const LAST_ACTIVE_COOKIE = "school-erp-last-active";

// Idle timeout thresholds per portal (milliseconds)
const IDLE_THRESHOLDS: { prefix: string; ms: number }[] = [
  { prefix: "/admin", ms: 4 * 60 * 60 * 1000 },   // 4 hours
  { prefix: "/teacher", ms: 24 * 60 * 60 * 1000 }, // 24 hours
  { prefix: "/parent", ms: 24 * 60 * 60 * 1000 },  // 24 hours
];

/**
 * Enforce idle timeout using a cookie timestamp.
 * Applies to /admin (4h), /teacher (24h), /parent (24h).
 * If idle exceeds threshold → redirect to login.
 * On every page request → refresh the timestamp cookie.
 */
function enforceIdleTimeout(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;

  // Find matching threshold for this route
  const rule = IDLE_THRESHOLDS.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return response;

  const lastActive = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;

  if (lastActive) {
    const elapsed = Date.now() - parseInt(lastActive, 10);
    if (elapsed > rule.ms) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete(LAST_ACTIVE_COOKIE);
      return redirect;
    }
  }

  // Refresh the timestamp on the existing response
  response.cookies.set(LAST_ACTIVE_COOKIE, String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const response = await proxyImpl(request);
  // /api/csp-report receives the violation reports themselves — applying
  // CSP headers here would be redundant and could create report loops.
  if (!request.nextUrl.pathname.startsWith("/api/csp-report")) {
    applySecurityHeaders(response);
  }
  return response;
}

async function proxyImpl(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Public routes — allow but still refresh Supabase session if present so
  // that a logged-in user landing on `/` keeps a fresh access token. Exact
  // segment match on `/auth` + `/api/auth` prevents hypothetical routes like
  // `/authentic-*` from inheriting the public bypass. `/auth/callback` +
  // `/auth/error` (shipped p1-auth-google-oauth) ride the `startsWith("/auth/")`
  // path.
  if (
    pathname === "/" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/legal/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo")
  ) {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return await updateSession(request);
    }
    return NextResponse.next();
  }

  // Demo mode — when enabled (E2E + local dev), skip Supabase auth entirely.
  // The cookie is HMAC-signed by lib/auth/demo-cookie.ts (cannot be forged
  // without SESSION_COOKIE_SECRET); no-cookie or unsigned-cookie cases fall
  // through to the protected-route Supabase path or final redirect.
  if (process.env.DEMO_MODE === "true") {
    const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
    if (demoCookie) {
      return enforceIdleTimeout(request, NextResponse.next());
    }
    // No cookie + DEMO_MODE=true: fall through to final redirect (no Supabase
    // path in CI — NEXT_PUBLIC_SUPABASE_URL unset).
  }

  // API routes call getSession() themselves — skip the redundant middleware getUser()
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Supabase auth (production)
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const response = await updateSession(request);
    // If updateSession redirected (no user), don't check idle
    if (response.status === 307 || response.headers.get("location")) {
      return response;
    }
    return enforceIdleTimeout(request, response);
  }

  // No session → redirect to login. Reached when neither demo cookie is
  // present nor Supabase is configured. The legacy "demo cookie fallback
  // when Supabase NOT configured" branch was dropped in p1-auth-google-oauth
  // T4 — DEMO_MODE=true is set in CI build + e2e jobs (.github/workflows/
  // ci.yml lines 49, 75, 84) so the priority block above handles all CI
  // paths; the dropped branch was only reachable via DEMO_MODE !== 'true' +
  // hand-planted cookie + Supabase env unset (degenerate, no caller).
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
