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
    return NextResponse.next();
  }

  // Demo mode: if demo cookie is present, allow through without Supabase check
  const demoEmail = request.cookies.get(DEMO_COOKIE)?.value;
  if (demoEmail) {
    return NextResponse.next();
  }

  // Supabase auth: if configured, delegate to Supabase session check
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return await updateSession(request);
  }

  // Fallback: no session → redirect to login
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
