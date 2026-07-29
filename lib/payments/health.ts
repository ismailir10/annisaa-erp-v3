/**
 * Shared health-check core for payment-gateway deploy-time probes.
 *
 * Introduced in cycle 2026-07-27-doku-payment-gateway T5 to back both
 * `GET /api/health/payments` (gateway-aware, AC-18) and the legacy
 * `GET /api/health/xendit` alias (pinned to Xendit for existing uptime
 * monitors). Both routes share the same rate-limit → cache → ping → format
 * flow; only the ping function, tier detector, cache storage and namespace
 * strings differ, so those are injected by the caller rather than hard-coded
 * here — this keeps each route's cache semantics independently testable
 * (the Xendit alias keeps its original single-slot global untouched; the
 * gateway-aware route uses a `Map` keyed by gateway id — see that route's
 * file for why).
 */
import { NextResponse } from "next/server";

import { getClientIp, rateLimit } from "@/lib/rate-limit";

import { prefixForError } from "./error-prefix";

export type Tier = "live" | "sandbox" | "unknown";

export type PaymentsHealthResult =
  | {
      ok: true;
      source: string;
      tier: Tier;
      checkedAt: string;
    }
  | {
      ok: false;
      source: string;
      tier: Tier;
      error: string;
      code: string;
      checkedAt: string;
    };

export interface PaymentsHealthCacheEntry {
  result: PaymentsHealthResult;
  expiresAt: number;
}

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
export const PAYMENTS_HEALTH_CACHE_TTL_MS = 30_000;

export interface RunPaymentsHealthCheckOptions {
  /** Rate-limit bucket namespace, e.g. "health:payments" or "health:xendit". The
   * per-IP suffix is appended here so callers never have to. */
  rateLimitNamespace: string;
  /** Value surfaced in the response body's `source` field. */
  source: string;
  /** Per-gateway tier detector. Xendit derives tier from the
   * `XENDIT_SECRET_KEY` prefix; DOKU derives it from `DOKU_ENV` because
   * DOKU's key format does not encode tier the way Xendit's does. */
  detectTier: () => Tier;
  /** Error message persisted/returned when `detectTier()` returns "unknown".
   * Short-circuits before any network call in that case. */
  unknownTierError: string;
  /** The network probe. Callers pass the concrete ping function (not a
   * wrapped gateway object) so each route's existing test seam keeps
   * working unmodified. */
  ping: () => Promise<void>;
  /** Cache read, keyed however the caller likes (single slot or Map). */
  getCached: () => PaymentsHealthCacheEntry | undefined;
  /** Cache write — same TTL (`PAYMENTS_HEALTH_CACHE_TTL_MS`) for every route. */
  setCached: (entry: PaymentsHealthCacheEntry) => void;
}

export async function runPaymentsHealthCheck(
  request: Request,
  opts: RunPaymentsHealthCheckOptions,
): Promise<NextResponse> {
  // Step 1 — Rate limit (per-IP). Must run BEFORE the cache check so cached
  // responses still count against the cap (cycle 2026-04-28 T4 ordering pin,
  // carried forward verbatim into the shared handler).
  const ip = getClientIp(request);
  const limit = rateLimit(
    `${opts.rateLimitNamespace}:${ip}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: RATE_WINDOW_MS / 1000 },
      { status: 429 },
    );
  }

  // Step 2 — Cache check.
  const now = Date.now();
  const cached = opts.getCached();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.result, {
      status: cached.result.ok ? 200 : 503,
    });
  }

  // Step 3 — Cache miss → detect tier, then ping only if a tier was determined.
  const tier = opts.detectTier();

  if (tier === "unknown") {
    // Short-circuit: missing/malformed credential. Skip the network ping
    // (it would throw at the client's own env-guard anyway) and report a
    // clean error directly.
    const result: PaymentsHealthResult = {
      ok: false,
      source: opts.source,
      tier,
      error: opts.unknownTierError,
      code: "unknown",
      checkedAt: new Date(now).toISOString(),
    };
    opts.setCached({ result, expiresAt: now + PAYMENTS_HEALTH_CACHE_TTL_MS });
    return NextResponse.json(result, { status: 503 });
  }

  try {
    await opts.ping();
    const result: PaymentsHealthResult = {
      ok: true,
      source: opts.source,
      tier,
      checkedAt: new Date(now).toISOString(),
    };
    opts.setCached({ result, expiresAt: now + PAYMENTS_HEALTH_CACHE_TTL_MS });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { prefix, message } = prefixForError(err);
    const result: PaymentsHealthResult = {
      ok: false,
      source: opts.source,
      tier,
      error: message,
      code: prefix,
      checkedAt: new Date(now).toISOString(),
    };
    // Cache failure results too — repeated failed pings within the TTL
    // would hammer the gateway on a misconfigured deploy. Same TTL as
    // success.
    opts.setCached({ result, expiresAt: now + PAYMENTS_HEALTH_CACHE_TTL_MS });
    return NextResponse.json(result, { status: 503 });
  }
}
