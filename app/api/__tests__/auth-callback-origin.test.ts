import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCallbackOrigin } from "@/lib/auth-callback";

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("resolveCallbackOrigin", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers NEXT_PUBLIC_SITE_URL over x-forwarded-host (avoids per-deployment URL mismatch)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://annisaa-erp-v3.vercel.app");
    const req = makeRequest("https://internal.vercel.app/auth/callback?code=abc", {
      "x-forwarded-host": "annisaa-erp-v3-858q41m0i-ismails-projects-196d40d3.vercel.app",
    });
    expect(resolveCallbackOrigin(req)).toBe("https://annisaa-erp-v3.vercel.app");
  });

  it("falls back to x-forwarded-host in production when NEXT_PUBLIC_SITE_URL is unset", () => {
    const req = makeRequest("https://internal.vercel.app/auth/callback?code=abc", {
      "x-forwarded-host": "annisaa-erp-v3.vercel.app",
    });
    expect(resolveCallbackOrigin(req)).toBe("https://annisaa-erp-v3.vercel.app");
  });

  it("falls back to request origin in production when no x-forwarded-host", () => {
    const req = makeRequest("https://annisaa-erp-v3.vercel.app/auth/callback?code=abc");
    expect(resolveCallbackOrigin(req)).toBe("https://annisaa-erp-v3.vercel.app");
  });

  it("uses request origin in development even if x-forwarded-host is present", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = makeRequest("http://localhost:3000/auth/callback?code=abc", {
      "x-forwarded-host": "should-be-ignored.example.com",
    });
    expect(resolveCallbackOrigin(req)).toBe("http://localhost:3000");
  });

  it("always returns https scheme when forwarding (browser-facing HTTPS)", () => {
    const req = makeRequest("http://internal.host/auth/callback?code=abc", {
      "x-forwarded-host": "staging-preview.vercel.app",
    });
    expect(resolveCallbackOrigin(req)).toBe("https://staging-preview.vercel.app");
  });
});
