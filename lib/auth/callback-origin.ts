// Resolve the browser-facing origin for an OAuth-callback redirect.
//
// Production contract — NEXT_PUBLIC_SITE_URL is REQUIRED. The OAuth callback
// uses this origin to redirect the user's browser back into the app post-
// exchange; an attacker-controlled value here is an open-redirect primitive.
//
// Preview contract — Vercel preview deployments fall back to request.url
// origin when NEXT_PUBLIC_SITE_URL is unset. Each preview gets a distinct
// `*.vercel.app` host; pinning a single alias would break OAuth on every
// PR preview. Vercel constrains the host header to deployment-controlled
// values, so this fallback is not an open-redirect primitive on this
// provider. The git-branch alias (e.g.
// `annisaa-erp-v3-git-staging-<team>.vercel.app`) is stable per branch
// across deployments, so the PKCE cookie set on the alias matches the
// callback host.
//
// Why no x-forwarded-host fallback in prod: that header is only trustworthy
// on topologies where the CDN/load-balancer constrains it to known aliases
// (Vercel does this implicitly). On self-hosted Docker / generic nginx
// setups it's attacker-controlled, and a callback redirecting to
// `https://evil.com/admin` is a textbook open-redirect. Operator-set
// NEXT_PUBLIC_SITE_URL is the single trusted source of truth in prod.
//
// Why we still pin in prod: per-deployment Vercel URLs drift from the alias
// where the PKCE code-verifier cookie was stored — causing "PKCE code
// verifier not found in storage" loops. NEXT_PUBLIC_SITE_URL pinning the
// canonical production alias closes that incident pattern.
//
// Dev: request.url is always localhost/LAN/127.0.0.1, framework-supplied,
// safe to use without env config.

export function resolveCallbackOrigin(request: Request): string {
  if (process.env.NODE_ENV === "development") {
    return new URL(request.url).origin;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl;

  // Vercel preview — VERCEL_ENV=preview is set by Vercel on every preview
  // deployment. Trust the request origin since Vercel constrains it.
  if (process.env.VERCEL_ENV === "preview") {
    return new URL(request.url).origin;
  }

  throw new Error(
    "resolveCallbackOrigin: NEXT_PUBLIC_SITE_URL env var is required in production. " +
      "Set it to the canonical alias (e.g. https://app.example.com) in Vercel project env."
  );
}
