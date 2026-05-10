/**
 * Simple in-memory rate limiter.
 * Tracks request counts per key (usually IP or user ID) with a sliding window.
 * Suitable for serverless — resets on cold start, which is acceptable.
 */

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count };
}

/**
 * Extract client identifier from request.
 * Uses X-Forwarded-For (Vercel sets this), falls back to generic key.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  // Use the last entry — Vercel appends the real client IP at the end.
  // The first entry is user-controlled and can be spoofed.
  return (
    forwarded?.split(",").at(-1)?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

/**
 * Reset the in-memory store. Test-only — never call from production code.
 */
export function __resetRateLimitForTest(): void {
  store.clear();
}
