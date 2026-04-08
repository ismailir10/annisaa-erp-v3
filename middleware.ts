import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "school-erp-session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;

  // Public routes — no auth needed
  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // No session → redirect to login
  if (!sessionId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Role-based routing is checked server-side in layouts
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
