import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const DEMO_COOKIE = "school-erp-session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — always allow
  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo")
  ) {
    // Still refresh Supabase session on public routes if configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return await updateSession(request);
    }
    return NextResponse.next();
  }

  // Supabase auth takes PRIORITY over demo cookie
  // This prevents demo cookie from bypassing Supabase auth in production
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return await updateSession(request);
  }

  // Demo mode fallback (only when Supabase is NOT configured)
  const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
  if (demoCookie) {
    return NextResponse.next();
  }

  // No session → redirect to login
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
