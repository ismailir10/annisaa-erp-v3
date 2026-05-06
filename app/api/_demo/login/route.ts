// @public — demo-mode login endpoint. Writes the session cookie directly.
//
// Production guard: returns 404 unless DEMO_MODE === 'true'. 404 (not 403)
// chosen because Vercel's function-listing surface looks identical for
// "route doesn't exist" — an attacker can't fingerprint the demo gate.
//
// Spec: docs/cycles/2026-05-06-p1-auth-google-oauth.md (T8)
//
// Used by:
//   - Future E2E specs (Playwright global-setup) — POST /api/_demo/login?role=admin
//     before each test stub to seed a demo session cookie.
//   - Local dev workflow — `npm run dev` + manual curl to skip Google OAuth.
//
// Maps ?role=admin|teacher|parent to actual seed role codes:
//   admin   → "admin"
//   teacher → "homeroom_teacher" or "sentra_teacher" (first matching User)
//   parent  → "parent"
//
// The seed catalog (prisma/seed/05-system-roles.ts) creates the role rows;
// User rows are created by future seeds or manual admin invitation.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEMO_SUPABASE_PREFIX, setDemoSessionCookie } from "@/lib/auth/demo-cookie";
import { getClientIp } from "@/lib/http/ip";
import { checkRateLimit } from "@/lib/rate-limit";

const RoleParamSchema = z.enum(["admin", "teacher", "parent"]);

const ROLE_CODE_MAP: Record<z.infer<typeof RoleParamSchema>, string[]> = {
  admin: ["admin"],
  teacher: ["homeroom_teacher", "sentra_teacher"],
  parent: ["parent"],
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const parsed = RoleParamSchema.safeParse(url.searchParams.get("role"));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_role", message: "?role= must be admin, teacher, or parent" },
      { status: 400 },
    );
  }
  const roleCodes = ROLE_CODE_MAP[parsed.data];

  // Per-IP rate-limit gate — runs AFTER role validation (cheap reject path
  // stays cheap) and BEFORE any DB lookup so a flood cannot drive Prisma load.
  // Scope `demo_login`; default 60/min via `RATE_LIMIT_REQUESTS_PER_MINUTE`.
  // Reject contract is 429 + JSON body (NOT a redirect — this is an /api/*
  // endpoint per p1-auth Ship Notes, callers expect JSON error envelopes).
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: ip, scope: "demo_login" });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rateLimit.retryAfterMs },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) },
      },
    );
  }

  // Resolve the demo tenant — single-tenant MVP picks the first tenant. When
  // multi-tenant lands, this becomes ?tenant= query param (the demo route
  // expands its contract). The Tenant model has no soft-delete column.
  const tenant = await prisma.tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) {
    return NextResponse.json(
      { error: "no_tenant", message: "No tenant found. Run `npx prisma db seed` first." },
      { status: 500 },
    );
  }

  // Find first active User with at least one matching role IN THIS TENANT.
  // Order by id for deterministic E2E test selection (same fixture row across
  // runs).
  const userRoleRow = await prisma.userRole.findFirst({
    where: {
      tenantId: tenant.id,
      role: { code: { in: roleCodes }, deletedAt: null },
      user: { isActive: true, deletedAt: null },
    },
    select: {
      tenantId: true,
      user: { select: { id: true, supabaseUserId: true } },
    },
    orderBy: { user: { id: "asc" } },
  });

  if (!userRoleRow || !userRoleRow.user) {
    return NextResponse.json(
      {
        error: "no_seed_user",
        message: `No User found with role(s): ${roleCodes.join(", ")}. Seed users for this role first.`,
      },
      { status: 500 },
    );
  }

  await setDemoSessionCookie({
    tenantId: userRoleRow.tenantId,
    userId: userRoleRow.user.id,
    // Synthetic Supabase ID for demo path — real OAuth callback would set the
    // actual Supabase user.id; demo path doesn't go through Supabase auth.
    // Prefix `DEMO_SUPABASE_PREFIX` is recognised by the OAuth callback's
    // identity-collision guard so a real future login overwrites cleanly.
    supabaseUserId:
      userRoleRow.user.supabaseUserId ?? `${DEMO_SUPABASE_PREFIX}${userRoleRow.user.id}`,
  });

  return NextResponse.json({
    ok: true,
    role: parsed.data,
    userId: userRoleRow.user.id,
    tenantId: userRoleRow.tenantId,
  });
}
