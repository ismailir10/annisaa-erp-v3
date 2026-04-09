import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const DEMO_COOKIE = "school-erp-session";

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
