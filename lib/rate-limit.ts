// In-memory rate limiter per spec §16. Token-bucket variant: each
// (scope, key) tuple has a bucket with a fixed window. When the
// window expires, the bucket resets. When the count exceeds the
// limit within the active window, the call is rejected with the
// remaining ms until the window's natural reset.
//
// Storage: in-process Map<string, Bucket>. Single-region Vercel —
// counters lost on cold start (assumption 4 in cycle doc; acceptable
// for v1; multi-region/Redis migration deferred to p3+).
//
// Eviction: on every write we opportunistically prune any expired
// buckets we encounter. No setInterval — keeps the module stateless
// across worker reuse.

export type RateLimitScope =
  | "oauth_callback"
  | "demo_login"
  | "upload"
  | "admission_submit";

export type CheckRateLimitArgs = {
  /** A unique identifier within the scope — e.g. an IP address or userId. */
  key: string;
  /**
   * The rate-limit policy bucket. Different scopes share the same key
   * namespace but maintain independent counters.
   */
  scope: RateLimitScope;
  /**
   * Override the default limit (per RATE_LIMIT_REQUESTS_PER_MINUTE
   * env, default 60). Useful for stricter scopes (e.g. login) that
   * want a tighter limit than the default.
   */
  limit?: number;
  /**
   * Override the default window (per RATE_LIMIT_STORAGE_TTL_MS env,
   * default 60_000). Useful for tests + special scopes.
   */
  windowMs?: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

const DEFAULT_LIMIT = parsePositiveInt(
  process.env.RATE_LIMIT_REQUESTS_PER_MINUTE,
  60,
);
const DEFAULT_WINDOW_MS = parsePositiveInt(
  process.env.RATE_LIMIT_STORAGE_TTL_MS,
  60_000,
);

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

function bucketKey(scope: RateLimitScope, key: string): string {
  return `${scope}|${key}`;
}

export function checkRateLimit(args: CheckRateLimitArgs): RateLimitResult {
  return checkRateLimitInternal(args, Date.now);
}

/** Test-only seam — clock injection. */
export function _checkRateLimitForTest(
  args: CheckRateLimitArgs,
  now: () => number,
): RateLimitResult {
  return checkRateLimitInternal(args, now);
}

/** Test-only seam — reset all buckets between tests. */
export function _resetRateLimitStore(): void {
  store.clear();
}

function checkRateLimitInternal(
  args: CheckRateLimitArgs,
  now: () => number,
): RateLimitResult {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const windowMs = args.windowMs ?? DEFAULT_WINDOW_MS;
  const k = bucketKey(args.scope, args.key);
  const t = now();

  // Opportunistic eviction — drop the current key's bucket if expired
  // (so a fresh window is created below) and one other expired bucket
  // per write to keep the map bounded under steady state without
  // scheduling.
  evictExpiredAround(t, k);

  let bucket = store.get(k);
  if (!bucket || bucket.resetAt <= t) {
    bucket = { count: 0, resetAt: t + windowMs };
    store.set(k, bucket);
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - t) };
  }

  bucket.count += 1;
  return { ok: true, remaining: Math.max(0, limit - bucket.count) };
}

function evictExpiredAround(t: number, currentKey: string): void {
  // Drop the current key's bucket if expired (so the new bucket above
  // gets a fresh window).
  const cur = store.get(currentKey);
  if (cur && cur.resetAt <= t) {
    store.delete(currentKey);
  }
  // Opportunistically drop ONE other expired bucket per call. Keeps
  // the map bounded over time without iterating every entry.
  for (const [k, b] of store) {
    if (k !== currentKey && b.resetAt <= t) {
      store.delete(k);
      break;
    }
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}
