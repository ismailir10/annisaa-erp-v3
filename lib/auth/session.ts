// getSession — server-only session resolver.
//
// Production path: wraps lib/supabase/server.ts createClient().auth.getUser()
// and resolves the matching local User row by supabaseUserId. Returns the
// tenant + user pair the rest of the server uses (callers — e.g. /api/upload —
// own the 401 shape).
//
// Demo path (extension shipped p1-auth-google-oauth): when
// `process.env.DEMO_MODE === 'true'` AND the request carries a valid
// HMAC-signed `school-erp-session` cookie, return the synthetic session
// without calling Supabase. The HMAC closes a defense-in-depth gap against
// `DEMO_MODE=true` accidentally set in prod (forging requires
// SESSION_COOKIE_SECRET; the /api/_demo/login route 404s outside DEMO_MODE
// so no attacker can plant a cookie). HMAC-mismatch falls through to the
// Supabase path — same observable shape as no cookie.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §16.1
//       + §6.5 (JWT custom-claim hook) + §8.1 (Auth Google OAuth only)
// Cycle: docs/cycles/2026-05-06-p1-auth-google-oauth.md (T3)
//
// Why null on every failure path: the caller owns the response shape (401 JSON
// body with `{ error: 'unauthorized' }` for /api/upload). Throwing here would
// force every call site to wrap in try/catch for the same outcome.
//
// Tenant scope: this helper DEFINES the tenant from the resolved User row.
// Callers must NOT pass an external tenantId to cross-check until the auth
// refactor extends the signature with a tenant-context argument (e.g. for
// subdomain routing or admin tenant-switching). For now, /api/upload trusts
// the session-derived tenantId entirely and never reads it from the request.
//
// Server-only by construction: imports `prisma` from @/lib/db (DATABASE_URL
// throws on missing env), `createClient` from @/lib/supabase/server (Supabase
// env throws on missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY), `next/headers`
// (cookies()), and `verifyDemoCookie` (node:crypto). Same boundary marker
// pattern as lib/audit/write.ts — accidental client-bundle inclusion fails
// fast at runtime.

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { DEMO_COOKIE_NAME, verifyDemoCookie } from "@/lib/auth/demo-cookie";

export type SessionContext = {
  tenantId: string;
  userId: string;
  supabaseUserId: string;
};

export async function getSession(): Promise<SessionContext | null> {
  // Demo path runs FIRST so E2E + local-dev short-circuit Supabase entirely.
  // Production safety: verifyDemoCookie returns null when SESSION_COOKIE_SECRET
  // is missing (operator-controlled), the cookie is absent, or the HMAC fails.
  // Falling through to the Supabase path on any null preserves the same
  // observable shape regardless of cookie tampering.
  if (process.env.DEMO_MODE === "true") {
    const cookieStore = await cookies();
    const raw = cookieStore.get(DEMO_COOKIE_NAME)?.value;
    const verified = verifyDemoCookie(raw);
    if (verified) return verified;
    // HMAC-mismatch / missing cookie: fall through to Supabase path.
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  // The schema's only index involving supabaseUserId is the non-unique
  // @@index([tenantId, supabaseUserId]) (prisma/schema.prisma:294). NO unique
  // constraint exists on supabaseUserId alone or in any composite. The OAuth
  // callback (app/auth/callback/route.ts) enforces the one-Supabase-account
  // ↔ one-tenant invariant by REJECTING cross-tenant email collisions at
  // login time. This findMany + take:2 + length-check is the runtime
  // defense-in-depth — fail-closed if the callback gate were ever bypassed
  // or if a future migration introduced two rows w/ the same supabaseUserId.
  const rows = await prisma.user.findMany({
    where: { supabaseUserId: data.user.id, isActive: true, deletedAt: null },
    select: { id: true, tenantId: true },
    take: 2,
  });
  if (rows.length !== 1) {
    if (rows.length > 1) {
      console.error(
        `[auth/session] dual-row collision for supabaseUserId=${data.user.id}: ` +
          `${rows.length} active User rows found. The OAuth callback gate should ` +
          `have prevented this — invariant violation, fail-closed.`,
      );
    }
    return null;
  }
  const row = rows[0];

  return {
    tenantId: row.tenantId,
    userId: row.id,
    supabaseUserId: data.user.id,
  };
}
