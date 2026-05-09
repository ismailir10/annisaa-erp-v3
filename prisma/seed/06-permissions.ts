// Seed 06 — permission scaffolding. Two-phase:
//
// 1) Placeholder per-role read permission (resource = role.code) so the
//    RLS-critical RolePermission join target is non-empty post-seed.
//    Full per-resource matrix lands incrementally as entity registries
//    ship (per spec §18.4).
//
// 2) Per-entity scope permissions derived from `lib/entities/<x>/policy.ts`.
//    Currently: Admission (added in p2-admission-funnel-ui-public T3 to
//    close p2-admission-funnel-schema Spec Assumption 9). Each policy
//    scopes entry → one Permission row + one RolePermission link.
//
// Idempotent via findFirst-then-update on the partial unique index
// (tenantId, resource, action, scope) WHERE deletedAt IS NULL.
import { Prisma, type PermissionScope, type PrismaClient } from "@/lib/generated/prisma/client";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import type { CrudAction, EntityPolicy, RoleCode, ScopeGrant } from "@/lib/entities/_types";
import { SYSTEM_ROLES } from "./05-system-roles";

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

const POLICY_ACTION_TO_PERMISSION_ACTION: Record<CrudAction, string> = {
  create: "create",
  read: "read",
  update: "update",
  delete: "delete",
  soft_delete: "soft_delete",
  restore: "restore",
};

async function ensurePermission(
  prisma: PrismaClient,
  tenantId: string,
  resource: string,
  action: string,
  scope: PermissionScope,
): Promise<{ id: string }> {
  const existing = await prisma.permission.findFirst({
    where: { tenantId, resource, action, scope, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing;
  try {
    return await prisma.permission.create({
      data: { tenantId, resource, action, scope },
      select: { id: true },
    });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
    // Concurrent seed raced ahead; re-read.
    const winner = await prisma.permission.findFirst({
      where: { tenantId, resource, action, scope, deletedAt: null },
      select: { id: true },
    });
    if (!winner) throw err;
    return winner;
  }
}

async function ensureRolePermission(
  prisma: PrismaClient,
  tenantId: string,
  roleId: string,
  permissionId: string,
): Promise<void> {
  const existing = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId_tenantId: { roleId, permissionId, tenantId } },
  });
  if (existing) return;
  try {
    await prisma.rolePermission.create({ data: { roleId, permissionId, tenantId } });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
  }
}

async function seedPolicyPermissions(
  prisma: PrismaClient,
  tenantId: string,
  policy: EntityPolicy,
  rolesByCode: Map<RoleCode, { id: string }>,
): Promise<void> {
  for (const [policyAction, entries] of Object.entries(policy.scopes) as [
    CrudAction,
    ReadonlyArray<ScopeGrant>,
  ][]) {
    const permAction = POLICY_ACTION_TO_PERMISSION_ACTION[policyAction];
    for (const entry of entries) {
      const role = rolesByCode.get(entry.role);
      if (!role) continue;
      // ScaffoldScope and PermissionScope share the same string literals.
      const scope = entry.scope as PermissionScope;
      const permission = await ensurePermission(
        prisma,
        tenantId,
        policy.resource,
        permAction,
        scope,
      );
      await ensureRolePermission(prisma, tenantId, role.id, permission.id);
      console.log(
        `  ✓ RolePermission ${entry.role} → ${policy.resource}:${permAction}:${scope}`,
      );
    }
  }
}

export async function seedPermissions(prisma: PrismaClient, tenantId: string): Promise<void> {
  const rolesByCode = new Map<RoleCode, { id: string }>();

  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.findFirst({
      where: { tenantId, code: r.code, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(`Role ${r.code} missing — run seed 05-system-roles before 06-permissions.`);
    }
    rolesByCode.set(r.code as RoleCode, role);

    const resource = r.code;
    const action = "read";
    const permission = await ensurePermission(prisma, tenantId, resource, action, "ALL");
    console.log(`  ✓ Permission ${resource}:${action}:ALL`);
    await ensureRolePermission(prisma, tenantId, role.id, permission.id);
  }

  // Phase 2: per-entity policy-derived permissions.
  await seedPolicyPermissions(prisma, tenantId, admissionPolicy, rolesByCode);
}
