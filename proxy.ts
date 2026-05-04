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

  // Rebuild window (Phase 1, May–Jul 2026): /api/auth/*, /auth/callback, and
  // /api/xendit/webhook are not yet present — auth flow lands in
  // p1-auth-google-oauth, Xendit webhook ports back in p3-xendit-port-and-regen.
  // Their guards above (rate-limit, public bypass, PKCE callback) re-attach in
  // those cycles.

  // Public routes — allow but still refresh Supabase session if present.
  // Exact segment match on `/auth` + `/api/auth` prevents hypothetical
  // routes like `/authentic-*` from inheriting the public bypass.
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

  // Demo mode takes priority when enabled — skip Supabase auth entirely.
  // Still enforce idle timeout on portal paths so demo sessions expire
  // consistently with Supabase-authenticated sessions.
  if (process.env.DEMO_MODE === "true") {
    const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
    if (demoCookie) {
      return enforceIdleTimeout(request, NextResponse.next());
    }
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

  // Demo mode fallback (only when Supabase is NOT configured)
  const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
  if (demoCookie) {
    const response = NextResponse.next();
    return enforceIdleTimeout(request, response);
  }

  // No session → redirect to login
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
