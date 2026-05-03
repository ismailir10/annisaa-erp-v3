// Security headers applied to every response in proxy.ts.
// CSP is Report-Only this cycle — graduates to enforcing post-launch +1wk
// once /api/csp-report shows zero noise from legitimate flows.

import type { NextResponse } from "next/server";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.xendit.co https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // wss://*.supabase.co for Realtime; vitals.vercel-insights.com for Analytics.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.xendit.co https://api.resend.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join("; ");

export function applySecurityHeaders<T extends NextResponse>(response: T): T {
  response.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  // No `preload` directive — preload-list submission is effectively
  // irreversible (months to remove). Defer to post-launch +30d once
  // the apex domain's HSTS posture is finalized.
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}
