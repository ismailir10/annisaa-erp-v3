// Client IP extraction from forwarding headers (Vercel + standard reverse-proxy
// chain). Next.js 15+ removed `request.ip`, so the `x-forwarded-for` /
// `x-real-ip` headers are the only reliable source.
//
// Trust the LEFTMOST `x-forwarded-for` entry — that is the original client IP
// per the standard XFF chain ordering (proxies append their own address as
// they forward). Falls back to `x-real-ip`, then the literal `"unknown"`.
//
// Why `"unknown"` rather than throwing: rate-limit consumers want a stable
// non-null key. A flood of header-stripped requests collapses onto the shared
// `"unknown"` bucket and trips the per-key limit faster — desired conservative
// behavior, better than leaking unmetered traffic.
//
// Callers: app/auth/callback/route.ts (oauth_callback scope),
//          app/api/_demo/login/route.ts (demo_login scope).

import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
