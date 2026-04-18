import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

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
  const { pathname } = request.nextUrl;

  // Fully public routes — NO auth check at all (external webhooks, payment pages)
  if (
    pathname.startsWith("/api/xendit/webhook") ||
    pathname.startsWith("/payment/")
  ) {
    return NextResponse.next();
  }

  // OAuth PKCE callback — bypass updateSession entirely. Running getUser() here
  // before the route handler exchanges the code risks interfering with the PKCE
  // code verifier cookie, producing "PKCE code verifier not found in storage".
  if (pathname === "/auth/callback" && request.nextUrl.searchParams.has("code")) {
    return NextResponse.next();
  }

  // Public routes — allow but still refresh Supabase session if present
  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo")
  ) {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return await updateSession(request);
    }
    return NextResponse.next();
  }

  // Demo mode takes priority when enabled — skip Supabase auth entirely
  if (process.env.DEMO_MODE === "true") {
    const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
    if (demoCookie) {
      return NextResponse.next();
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
