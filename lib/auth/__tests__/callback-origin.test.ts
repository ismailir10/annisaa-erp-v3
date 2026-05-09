import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCallbackOrigin } from "../callback-origin";

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("resolveCallbackOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns request.url origin in development regardless of env", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://prod.example.com");
    const req = makeRequest("http://localhost:3000/auth/callback?code=abc", {
      "x-forwarded-host": "evil.example.com",
    });
    expect(resolveCallbackOrigin(req)).toBe("http://localhost:3000");
  });

  it("returns NEXT_PUBLIC_SITE_URL in production (ignores x-forwarded-host)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    const req = makeRequest("https://deploy-hash.vercel.app/auth/callback", {
      "x-forwarded-host": "evil.example.com",
    });
    expect(resolveCallbackOrigin(req)).toBe("https://app.example.com");
  });

  it("throws in production (VERCEL_ENV=production) when NEXT_PUBLIC_SITE_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const req = makeRequest("https://app.example.com/auth/callback", {
      "x-forwarded-host": "alias.example.com",
    });
    expect(() => resolveCallbackOrigin(req)).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("falls back to request.url origin on Vercel preview when NEXT_PUBLIC_SITE_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    const req = makeRequest(
      "https://annisaa-erp-v3-git-staging-team.vercel.app/auth/callback?code=abc",
    );
    expect(resolveCallbackOrigin(req)).toBe(
      "https://annisaa-erp-v3-git-staging-team.vercel.app",
    );
  });

  it("on Vercel preview NEXT_PUBLIC_SITE_URL still wins when set (operator override)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.com");
    vi.stubEnv("VERCEL_ENV", "preview");
    const req = makeRequest(
      "https://annisaa-erp-v3-git-staging-team.vercel.app/auth/callback",
    );
    expect(resolveCallbackOrigin(req)).toBe("https://staging.example.com");
  });

  it("never trusts x-forwarded-host in production — env wins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com");
    // Spoofed forwarded-host header attempting open-redirect to evil.example.com.
    const req = makeRequest("https://deploy-hash.vercel.app/auth/callback", {
      "x-forwarded-host": "evil.example.com",
    });
    // Trusted env value wins; no attacker-controlled origin reaches the redirect.
    expect(resolveCallbackOrigin(req)).toBe("https://app.example.com");
    // CRLF in header values is rejected by the Headers API itself per RFC 7230,
    // so request-side header injection cannot surface in this function.
  });
});
