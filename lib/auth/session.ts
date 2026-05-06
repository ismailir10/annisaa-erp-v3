// getSession — minimal server-only session resolver.
//
// Wraps lib/supabase/server.ts createClient().auth.getUser() and resolves the
// matching local User row by supabaseUserId. Returns the tenant + user pair
// the rest of the server uses (callers — e.g. /api/upload — own the 401 shape).
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §16.1
// Cycle: docs/cycles/2026-05-06-p1-upload-route-sharp.md (Spec §lib/auth/session.ts + Assumption §2)
//
// Scope guard: this is the minimal shim that gives /api/upload a 401 gate THIS
// cycle. p1-auth-google-oauth extends this file with the demo-cookie write/read
// path AND wires the full Google OAuth callback / JWT custom-claim hook / role
// resolution. The signature `() => Promise<{tenantId, userId, supabaseUserId} | null>`
// is the contract that survives that refactor — DO NOT change it without
// updating every caller. No demo-cookie path here (per Assumption §2 + spec-time
// review MAJOR §4): no User row has supabaseUserId populated until the OAuth
// callback ships, AND no code writes the demo cookie yet (proxy.ts only reads
// it). Until p1-auth-google-oauth, getSession() returns null outside mocked
// test contexts and the route 401s real callers — acceptable since no real
// upload UI exists in production yet.
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
// throw on missing env) and `createClient` from @/lib/supabase/server (Supabase
// env throws on missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY). Same boundary
// marker pattern as lib/audit/write.ts — accidental client-bundle inclusion
// fails fast at runtime; no `server-only` shim installed in this repo.

import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function getSession(): Promise<{
  tenantId: string;
  userId: string;
  supabaseUserId: string;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  // The schema's only index involving supabaseUserId is the non-unique
  // @@index([tenantId, supabaseUserId]) (prisma/schema.prisma:294). NO unique
  // constraint exists on supabaseUserId alone or in any composite. Until
  // p1-auth-google-oauth enforces one-Supabase-account ↔ one-tenant at the
  // OAuth callback (or a future migration adds @@unique([supabaseUserId])),
  // findMany + length-check is the only fail-closed defence against a
  // privilege-escalation primitive where two User rows in different tenants
  // share a supabaseUserId. Two rows → return null (caller 401s) rather than
  // arbitrarily picking one tenant context.
  const rows = await prisma.user.findMany({
    where: { supabaseUserId: data.user.id, isActive: true, deletedAt: null },
    select: { id: true, tenantId: true },
    take: 2,
  });
  if (rows.length !== 1) return null;
  const row = rows[0];

  return {
    tenantId: row.tenantId,
    userId: row.id,
    supabaseUserId: data.user.id,
  };
}
