import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const DEMO_COOKIE = "school-erp-session";
const ADMIN_LAST_ACTIVE = "school-erp-admin-last-active";
const ADMIN_IDLE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Enforce admin idle timeout using a cookie timestamp.
 * Only applies to /admin/* page routes (not API routes).
 * If the admin has been idle > 4h, redirect to login.
 * On every admin page request, refresh the timestamp cookie.
 *
 * Returns null if no action needed (non-admin route).
 * Returns the (possibly modified) response otherwise.
 */
function enforceAdminIdle(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;

  // Only check admin page routes
  if (!pathname.startsWith("/admin")) return response;

  const lastActive = request.cookies.get(ADMIN_LAST_ACTIVE)?.value;

  if (lastActive) {
    const elapsed = Date.now() - parseInt(lastActive, 10);
    if (elapsed > ADMIN_IDLE_MS) {
      // Idle too long → redirect to login
      const url = request.nextUrl.clone();
      url.pathname = "/";
      const redirect = NextResponse.redirect(url);
      redirect.cookies.delete(ADMIN_LAST_ACTIVE);
      return redirect;
    }
  }

  // Update the last-active timestamp on the existing response
  response.cookies.set(ADMIN_LAST_ACTIVE, String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24, // 24h — matches Supabase timebox
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

  // Supabase auth takes PRIORITY over demo cookie
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const response = await updateSession(request);
    // If updateSession redirected (no user), don't check idle
    if (response.status === 307 || response.headers.get("location")) {
      return response;
    }
    return enforceAdminIdle(request, response);
  }

  // Demo mode fallback (only when Supabase is NOT configured)
  const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
  if (demoCookie) {
    const response = NextResponse.next();
    return enforceAdminIdle(request, response);
  }

  // No session → redirect to login
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
