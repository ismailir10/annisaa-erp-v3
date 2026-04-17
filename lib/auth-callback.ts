/**
 * Resolve the browser-facing origin for a redirect from a route handler.
 *
 * On Vercel, `request.url` reports the internal deployment host; the browser
 * sits on `x-forwarded-host` behind the load balancer. Redirecting to the
 * internal host causes cookies set during `exchangeCodeForSession` to be
 * bound to the wrong domain — the browser never sends them back and the
 * middleware on `/admin` then sees no user, producing a login loop.
 * Matches the Supabase Next.js canonical callback pattern.
 */
export function resolveCallbackOrigin(request: Request): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV === "development") return origin;
  if (forwardedHost) return `https://${forwardedHost}`;
  return origin;
}
