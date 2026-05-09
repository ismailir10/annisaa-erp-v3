// Seed 11 — Real Admin OAuth Bootstrap.
//
// Upserts a single User row + UserRole binding for the human admin so they
// can sign into staging via Google OAuth (provider configured in Supabase
// dashboard per p1-auth-google-oauth) and land at /admin with admin scope
// against the demo tenant. Without this seed, the OAuth callback at
// app/auth/callback/route.ts cannot resolve the user by email and aborts.
//
// Idempotent via findFirst-then-update keyed on (tenantId, email). UserRole
// upsert via composite PK (userId, roleId, tenantId).
//
// Email is the canonical Google account; supabaseUserId is left null and
// populated on first OAuth callback via the CAS-style updateMany backfill.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T2)

import type { PrismaClient } from "@/lib/generated/prisma/client";

export const REAL_ADMINS = [
  { email: "ismailir10@gmail.com", name: "Ismail", roleCode: "admin" },
] as const;

export async function seedRealAdmin(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const admin of REAL_ADMINS) {
    const role = await prisma.role.findFirst({
      where: { tenantId, code: admin.roleCode, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(
        `seedRealAdmin: role ${admin.roleCode} not found for tenant ${tenantId}. ` +
          "Run seed 05-system-roles first.",
      );
    }

    // findFirst (no deletedAt: null filter) mirrors seedDemoUsers — a
    // soft-deleted row with the same (tenantId, email) is re-activated
    // below by clearing deletedAt. User has no (tenantId, email) unique
    // constraint; a hardening pass across all seeds is separate scope.
    let user = await prisma.user.findFirst({
      where: { tenantId, email: admin.email },
      select: { id: true },
    });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: admin.name, isActive: true, deletedAt: null },
      });
      console.log(`  ✓ User ${admin.email} (updated)`);
    } else {
      user = await prisma.user.create({
        data: { tenantId, email: admin.email, name: admin.name, isActive: true },
        select: { id: true },
      });
      console.log(`  ✓ User ${admin.email} (created)`);
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId_tenantId: { userId: user.id, roleId: role.id, tenantId },
      },
      update: {},
      create: { userId: user.id, roleId: role.id, tenantId },
    });
    console.log(`  ✓ UserRole ${admin.email} → ${admin.roleCode}`);
  }
}
