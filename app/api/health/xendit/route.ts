// @public — deploy-time health probe; no user session, no PII, no mutation.
/**
 * Deploy-time health probe for the configured Xendit credential.
 *
 * Pings Xendit `GET /balance` (the canonical key-validity endpoint) and
 * surfaces a normalized result. Use in deploy verification scripts and
 * uptime monitors so a missing/wrong `XENDIT_SECRET_KEY` fails loud
 * instead of silently accumulating `PENDING_PAYMENT_LINK` rows on the
 * next bulk-create run.
 *
 * ### Security checklist (.claude/standards/security.md)
 * - **Auth posture:** intentionally **public** (no auth) — must be
 *   pingable from Vercel deploy-protection bypass + uptime monitors.
 * - **Input validation:** `GET` with no params; nothing to validate.
 * - **Rate limit:** mandatory 30 req/min/IP via `lib/rate-limit.ts`.
 * - **No secret echo:** response body returns only the derived `tier`
 *   label (`"live" | "sandbox" | "unknown"`) — never the raw key,
 *   never the key prefix beyond the derived label.
 * - **Error sanitization:** error responses surface `error.message`
 *   from the typed `XenditApiError` only. No stack traces, no env
 *   values, no headers echoed.
 * - **Route inventory:** added in cycle 2026-04-28-finance-bulk-throttle.
 *
 * ### Cache + rate-limit ordering (cycle 2026-04-28 T4)
 * Hits flow: rate-limit → cache → Xendit ping. Cached responses still
 * count against the per-IP cap, so a hot cache cannot be used to burn
 * function invocations at unlimited QPS from a single IP.
 *
 * ### Tier detection (cycle 2026-04-28 T4)
 * Xendit serves both sandbox and live from `https://api.xendit.co`.
 * Tier is determined exclusively from the `XENDIT_SECRET_KEY` prefix:
 *   - `xnd_production_*`  → `"live"`
 *   - `xnd_development_*` → `"sandbox"`
 *   - missing / other     → `"unknown"`
 */

import { NextResponse } from "next/server";

import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { pingXenditBalance } from "@/lib/xendit/client";
import { prefixForError } from "@/lib/xendit/error-prefix";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 30_000;

type Tier = "live" | "sandbox" | "unknown";

type CachedHealthResult =
  | {
      ok: true;
      source: "xendit";
      tier: Tier;
      checkedAt: string;
    }
  | {
      ok: false;
      source: "xendit";
      tier: Tier;
      error: string;
      code: string;
      checkedAt: string;
    };

interface HealthCacheEntry {
  result: CachedHealthResult;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __xenditHealthCache: HealthCacheEntry | undefined;
}

function detectTier(): Tier {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) return "unknown";
  if (key.startsWith("xnd_production_")) return "live";
  if (key.startsWith("xnd_development_")) return "sandbox";
  return "unknown";
}

export async function GET(request: Request): Promise<NextResponse> {
  // Step 1 — Rate limit (per-IP). Must run BEFORE the cache check so cached
  // responses still count against the cap (cycle 2026-04-28 T4 ordering pin).
  const ip = getClientIp(request);
  const limit = rateLimit(`health:xendit:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter: RATE_WINDOW_MS / 1000 },
      { status: 429 },
    );
  }

  // Step 2 — Cache check. Single-slot singleton (NOT a Map<tier, ...>) — a
  // tier-keyed Map would invite cache poisoning if a future change ever lets
  // `tier` come from a header or query param.
  const now = Date.now();
  const cached = globalThis.__xenditHealthCache;
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.result, { status: cached.result.ok ? 200 : 503 });
  }

  // Step 3 — Cache miss → ping Xendit.
  const tier = detectTier();

  if (tier === "unknown") {
    // Short-circuit: missing/malformed key. Skip the network ping (it would
    // throw on `getAuthHeader()` anyway) and report a clean error directly.
    const result: CachedHealthResult = {
      ok: false,
      source: "xendit",
      tier,
      error: "XENDIT_SECRET_KEY not configured or has unrecognized prefix",
      code: "unknown",
      checkedAt: new Date(now).toISOString(),
    };
    globalThis.__xenditHealthCache = { result, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(result, { status: 503 });
  }

  try {
    await pingXenditBalance();
    const result: CachedHealthResult = {
      ok: true,
      source: "xendit",
      tier,
      checkedAt: new Date(now).toISOString(),
    };
    globalThis.__xenditHealthCache = { result, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { prefix, message } = prefixForError(err);
    const result: CachedHealthResult = {
      ok: false,
      source: "xendit",
      tier,
      error: message,
      code: prefix,
      checkedAt: new Date(now).toISOString(),
    };
    // Cache failure results too — repeated failed pings within 30s would
    // hammer Xendit on a misconfigured deploy. Same TTL as success. If the
    // caught error wasn't a `XenditApiError` (programmer bug), `prefixForError`
    // returns `code: "unknown"` and the message is what was thrown.
    globalThis.__xenditHealthCache = { result, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(result, { status: 503 });
  }
}
