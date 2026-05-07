// Seed 08 — Demo Users (admin, parent). Required for E2E + local-dev demo
// flows: `app/api/demo/login` resolves first User row matching the requested
// role.code IN_TENANT, then mints the demo session cookie. Without seeded
// User+UserRole rows, the login route 500s with `no_seed_user`.
//
// Idempotent via findFirst-then-update keyed on (tenantId, email). 8 system
// roles exist after seed 05; this seed creates one User per role used by the
// E2E suite (admin + parent for the canary; teacher roles map to the
// `teacher` query-param via 05-system-roles role.code lookup — added when
// the teacher portal canary lands). Email convention: `<role>@demo.local`.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-canary.md (T6)

import type { PrismaClient } from "@/lib/generated/prisma/client";

export const DEMO_USERS = [
  { email: "admin@demo.local", name: "Demo Admin", roleCode: "admin" },
  { email: "parent@demo.local", name: "Demo Parent", roleCode: "parent" },
] as const;

export async function seedDemoUsers(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const u of DEMO_USERS) {
    const role = await prisma.role.findFirst({
      where: { tenantId, code: u.roleCode, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(
        `seedDemoUsers: role ${u.roleCode} not found for tenant ${tenantId}. ` +
          "Run seed 05-system-roles first.",
      );
    }

    let user = await prisma.user.findFirst({
      where: { tenantId, email: u.email },
      select: { id: true },
    });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: u.name, isActive: true, deletedAt: null },
      });
      console.log(`  ✓ User ${u.email} (updated)`);
    } else {
      user = await prisma.user.create({
        data: { tenantId, email: u.email, name: u.name, isActive: true },
        select: { id: true },
      });
      console.log(`  ✓ User ${u.email} (created)`);
    }

    // UserRole — composite PK (userId, roleId, tenantId). Upsert by id triple.
    await prisma.userRole.upsert({
      where: {
        userId_roleId_tenantId: { userId: user.id, roleId: role.id, tenantId },
      },
      update: {},
      create: { userId: user.id, roleId: role.id, tenantId },
    });
    console.log(`  ✓ UserRole ${u.email} → ${u.roleCode}`);
  }
}
