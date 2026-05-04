// Seed 06 — placeholder permission scaffolding so the RLS-critical
// RolePermission join target is non-empty post-seed. Full per-role × resource
// × action × scope matrix lands in p1-scaffold-engine-skeleton when the entity
// registry exists (per spec §18.4). MVP: 1 (resource, action=read, scope=ALL)
// per role + 1 RolePermission link per role.
//
// Idempotent via findFirst-then-update on the partial unique index
// (tenantId, resource, action, scope) WHERE deletedAt IS NULL.
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { SYSTEM_ROLES } from "./05-system-roles";

export async function seedPermissions(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.findFirst({
      where: { tenantId, code: r.code, deletedAt: null },
    });
    if (!role) {
      throw new Error(`Role ${r.code} missing — run seed 05-system-roles before 06-permissions.`);
    }

    const resource = r.code;
    const action = "read";

    let permission = await prisma.permission.findFirst({
      where: { tenantId, resource, action, scope: "ALL", deletedAt: null },
    });
    if (permission) {
      await prisma.permission.update({
        where: { id: permission.id },
        data: { resource, action, scope: "ALL" },
      });
    } else {
      permission = await prisma.permission.create({
        data: { tenantId, resource, action, scope: "ALL" },
      });
    }
    console.log(`  ✓ Permission ${resource}:${action}:ALL`);

    // Idempotent link via composite PK on RolePermission.
    const link = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId_tenantId: {
          roleId: role.id,
          permissionId: permission.id,
          tenantId,
        },
      },
    });
    if (!link) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id, tenantId },
      });
      console.log(`  ✓ RolePermission ${r.code} → ${resource}:${action}:ALL`);
    }
  }
}
