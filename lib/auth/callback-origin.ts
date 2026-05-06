// Resolve the browser-facing origin for an OAuth-callback redirect.
//
// Production contract — NEXT_PUBLIC_SITE_URL is REQUIRED. The OAuth callback
// uses this origin to redirect the user's browser back into the app post-
// exchange; an attacker-controlled value here is an open-redirect primitive.
//
// Why no x-forwarded-host fallback: that header is only trustworthy on
// topologies where the CDN/load-balancer constrains it to known aliases
// (Vercel does this implicitly). On self-hosted Docker / generic nginx
// setups it's attacker-controlled, and a callback redirecting to
// `https://evil.com/admin` is a textbook open-redirect. Operator-set
// NEXT_PUBLIC_SITE_URL is the single trusted source of truth in prod.
//
// Why no x-forwarded-host even on Vercel: Vercel sets `x-forwarded-host`
// per-deployment, and per-deployment Vercel URLs drift from the alias where
// the PKCE code-verifier cookie was stored — causing "PKCE code verifier
// not found in storage" loops. NEXT_PUBLIC_SITE_URL pinning the canonical
// alias closes that incident pattern (v1 commit 2529e17 history).
//
// Dev: request.url is always localhost/LAN/127.0.0.1, framework-supplied,
// safe to use without env config.

export function resolveCallbackOrigin(request: Request): string {
  if (process.env.NODE_ENV === "development") {
    return new URL(request.url).origin;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error(
      "resolveCallbackOrigin: NEXT_PUBLIC_SITE_URL env var is required in production. " +
        "Set it to the canonical alias (e.g. https://app.example.com) in Vercel project env."
    );
  }
  return siteUrl;
}
