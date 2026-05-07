// Demo-mode session cookie — HMAC-signed JSON payload for E2E + local-dev only.
//
// Production guard: this module is gated by `process.env.DEMO_MODE === 'true'`
// at every public consumer (lib/auth/session.ts, app/api/_demo/login/route.ts).
// The /api/_demo/login route 404s outside DEMO_MODE so no attacker can plant
// a cookie in production. The HMAC closes a defense-in-depth gap against
// `DEMO_MODE=true` being accidentally set in prod (forging requires
// SESSION_COOKIE_SECRET).
//
// Format: `<base64url(JSON.stringify(payload))>.<base64url(HMAC-SHA256(secret, b64payload))>`
//
// Cookie name `school-erp-session` MUST match proxy.ts:5 (DEMO_COOKIE) — proxy
// reads the cookie to short-circuit Supabase auth in DEMO_MODE.
//
// Server-only: imports `node:crypto` + `next/headers`. Client bundle inclusion
// would fail-fast on `cookies()` import.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { RoleCode } from "@/lib/entities/_types";

export const DEMO_COOKIE_NAME = "school-erp-session";

// Synthetic supabaseUserId prefix used by /api/_demo/login when stamping the
// User row's id-derived placeholder onto the demo cookie. The OAuth callback
// (app/auth/callback/route.ts) checks for this prefix and overwrites instead
// of raising identity_collision — otherwise a User who was ever demo'd gets
// permanently stuck on prod login.
export const DEMO_SUPABASE_PREFIX = "demo:";

// Payload shape extended in p2-scaffold-pages (2026-05-07) to carry role +
// currentTermId. Cookies issued before this cycle are missing the new fields
// and fail validation in verifyDemoCookie → fall through to Supabase path
// (effectively forcing re-login). 24h max-age is the natural expiry. CI/E2E
// unaffected (login route called per-test). Local-dev developers refresh via
// `curl -X POST 'http://localhost:3000/api/_demo/login?role=admin'`.
export type DemoSessionPayload = {
  tenantId: string;
  userId: string;
  supabaseUserId: string;
  role: RoleCode;
  currentTermId: string;
};

const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24h, matches proxy idle thresholds

function getSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_COOKIE_SECRET env var is required (>=32 chars) for demo cookie sign/verify."
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signDemoCookie(payload: DemoSessionPayload): string {
  const secret = getSecret();
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(secret, body));
  return `${body}.${sig}`;
}

export function verifyDemoCookie(raw: string | undefined | null): DemoSessionPayload | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    // Missing/short secret in env — cannot verify; fail closed.
    return null;
  }

  const expected = b64url(hmac(secret, body));
  // Constant-time compare. timingSafeEqual throws on length mismatch — guard.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  // Signature OK — decode payload. JSON.parse may throw on tampered input
  // that survives split (b64url decoded yields invalid JSON). Fail closed.
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof (decoded as Record<string, unknown>).tenantId !== "string" ||
    typeof (decoded as Record<string, unknown>).userId !== "string" ||
    typeof (decoded as Record<string, unknown>).supabaseUserId !== "string" ||
    typeof (decoded as Record<string, unknown>).role !== "string" ||
    (decoded as Record<string, unknown>).role === "" ||
    typeof (decoded as Record<string, unknown>).currentTermId !== "string" ||
    (decoded as Record<string, unknown>).currentTermId === ""
  ) {
    return null;
  }
  return decoded as DemoSessionPayload;
}

export async function setDemoSessionCookie(payload: DemoSessionPayload): Promise<void> {
  const cookieStore = await cookies();
  const value = signDemoCookie(payload);
  cookieStore.set(DEMO_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearDemoSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE_NAME);
}
