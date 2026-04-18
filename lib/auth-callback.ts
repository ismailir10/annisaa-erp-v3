/**
 * Resolve the browser-facing origin for a redirect from a route handler.
 *
 * Priority (production):
 *  1. NEXT_PUBLIC_SITE_URL — canonical alias URL configured in Vercel env vars.
 *     x-forwarded-host can resolve to a per-deployment Vercel URL (e.g.
 *     annisaa-erp-v3-858q41m0i-....vercel.app) which is a different subdomain
 *     from the alias where the PKCE code verifier cookie was stored — causing
 *     "PKCE code verifier not found in storage".
 *  2. x-forwarded-host — fallback when NEXT_PUBLIC_SITE_URL is unset.
 *  3. request.url origin — last resort.
 */
export function resolveCallbackOrigin(request: Request): string {
  const { origin } = new URL(request.url);
  if (process.env.NODE_ENV === "development") return origin;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) return `https://${forwardedHost}`;
  return origin;
}
