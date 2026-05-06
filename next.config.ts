import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // sharp is a native module (libvips). Webpack-bundling it produces a runtime
  // 500 on Vercel ("Could not load the 'sharp' module using the linux-x64
  // runtime"). Externalising forces Next.js to require() it from node_modules
  // at request time, where the prebuilt @img/sharp-linux-x64 binary resolves
  // correctly. See cycle docs/cycles/2026-05-06-p1-upload-route-sharp.md
  // BLOCKER §1 + sharp issue #3870 / vercel issue #14001.
  serverExternalPackages: ["sharp"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      {
        source: "/admin/assessment-templates",
        destination: "/admin/assessments/templates",
        permanent: true,
      },
      {
        source: "/admin/assessment-templates/:path*",
        destination: "/admin/assessments/templates/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Content-Security-Policy in REPORT-ONLY mode — logs violations to the
    // browser console without blocking. To graduate to enforcing, rename the
    // header key to "Content-Security-Policy" once violations are clean.
    //
    // 'unsafe-inline' + 'unsafe-eval' are required by Next.js 16 client
    // bundles today; harden later via per-request nonces or sha256 hashes.
    // Allowlist:
    //   - Supabase realtime (wss + https)
    //   - Xendit Checkout SDK (js.xendit.co)
    //   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
    //   - Vercel Analytics + Speed Insights (vitals.vercel-insights.com)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.xendit.co https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.xendit.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      // 'self' (not 'none') so /admin/design-system can embed the static
      // /admin/design-system-reference.html via <iframe>. Same-origin only —
      // external sites still cannot frame the app.
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          // SAMEORIGIN (not DENY) so /admin/design-system can embed the
          // static /admin/design-system-reference.html via <iframe>.
          // Aligns with the matching CSP frame-ancestors 'self' above.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
