// @vitest-environment node
//
// Unit tests for seedPermissions Phase 2 — per-entity policy-derived rows.
// Covers Admission policy (5 actions × N roles → ~17 RolePermission links).
// Closes p2-admission-funnel-schema Spec Assumption 9.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T3)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { admissionPolicy } from "@/lib/entities/admission/policy";
import { SYSTEM_ROLES } from "../05-system-roles";
import { seedPermissions } from "../06-permissions";

type PermRow = { id: string; tenantId: string; resource: string; action: string; scope: string };
type RolePermRow = { roleId: string; permissionId: string; tenantId: string };

function makePrismaMock() {
  const perms: PermRow[] = [];
  const rolePerms: RolePermRow[] = [];
  let nextPermId = 1;

  const role = {
    findFirst: vi.fn(async (args: { where: { code: string } }) => ({
      id: `role_${args.where.code}`,
    })),
  };
  const permission = {
    findFirst: vi.fn(
      async (args: {
        where: { tenantId: string; resource: string; action: string; scope: string };
      }) => {
        const w = args.where;
        return (
          perms.find(
            (p) =>
              p.tenantId === w.tenantId &&
              p.resource === w.resource &&
              p.action === w.action &&
              p.scope === w.scope,
          ) ?? null
        );
      },
    ),
    create: vi.fn(async (args: { data: Omit<PermRow, "id"> }) => {
      const row: PermRow = { id: `p${nextPermId++}`, ...args.data };
      perms.push(row);
      return row;
    }),
    update: vi.fn(async () => null),
  };
  const rolePermission = {
    findUnique: vi.fn(
      async (args: { where: { roleId_permissionId_tenantId: RolePermRow } }) => {
        const k = args.where.roleId_permissionId_tenantId;
        return (
          rolePerms.find(
            (r) =>
              r.roleId === k.roleId &&
              r.permissionId === k.permissionId &&
              r.tenantId === k.tenantId,
          ) ?? null
        );
      },
    ),
    create: vi.fn(async (args: { data: RolePermRow }) => {
      rolePerms.push(args.data);
      return args.data;
    }),
  };

  return {
    perms,
    rolePerms,
    role,
    permission,
    rolePermission,
    prisma: { role, permission, rolePermission },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedPermissions — Admission policy phase", () => {
  it("creates Admission Permission rows for every distinct (action, scope) in policy", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");

    const admissionPerms = m.perms.filter((p) => p.resource === "Admission");
    const distinctTuples = new Set<string>();
    for (const [action, entries] of Object.entries(admissionPolicy.scopes)) {
      for (const entry of entries) {
        distinctTuples.add(`${action}:${entry.scope}`);
      }
    }
    const seededTuples = new Set(admissionPerms.map((p) => `${p.action}:${p.scope}`));
    expect(seededTuples).toEqual(distinctTuples);
  });

  it("creates a RolePermission row for every (role, action, scope) entry in admissionPolicy", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");

    let expectedCount = 0;
    for (const entries of Object.values(admissionPolicy.scopes)) {
      expectedCount += entries.length;
    }
    const admissionPermIds = new Set(
      m.perms.filter((p) => p.resource === "Admission").map((p) => p.id),
    );
    const admissionRolePerms = m.rolePerms.filter((rp) => admissionPermIds.has(rp.permissionId));
    expect(admissionRolePerms).toHaveLength(expectedCount);
  });

  it("re-run is idempotent (no duplicate Permission or RolePermission rows)", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");
    const permsAfterFirst = m.perms.length;
    const rolePermsAfterFirst = m.rolePerms.length;

    m.permission.create.mockClear();
    m.rolePermission.create.mockClear();

    await seedPermissions(m.prisma as never, "t_demo");
    expect(m.perms).toHaveLength(permsAfterFirst);
    expect(m.rolePerms).toHaveLength(rolePermsAfterFirst);
    expect(m.permission.create).not.toHaveBeenCalled();
    expect(m.rolePermission.create).not.toHaveBeenCalled();
  });

  it("preserves Phase 1 placeholder rows (one per system role)", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");
    for (const r of SYSTEM_ROLES) {
      const placeholder = m.perms.find(
        (p) => p.resource === r.code && p.action === "read" && p.scope === "ALL",
      );
      expect(placeholder).toBeDefined();
    }
  });

  it("admin role gains Admission read:ALL grant", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");
    const adminReadAll = m.perms.find(
      (p) => p.resource === "Admission" && p.action === "read" && p.scope === "ALL",
    );
    expect(adminReadAll).toBeDefined();
    const link = m.rolePerms.find(
      (rp) => rp.roleId === "role_admin" && rp.permissionId === adminReadAll!.id,
    );
    expect(link).toBeDefined();
  });

  it("parent role gains exactly the Admission grants declared in policy", async () => {
    const m = makePrismaMock();
    await seedPermissions(m.prisma as never, "t_demo");

    const expectedParentTuples = new Set<string>();
    for (const [action, entries] of Object.entries(admissionPolicy.scopes)) {
      for (const e of entries) {
        if (e.role === "parent") expectedParentTuples.add(`${action}:${e.scope}`);
      }
    }

    const parentAdmissionPerms = m.rolePerms
      .filter((rp) => rp.roleId === "role_parent")
      .map((rp) => m.perms.find((p) => p.id === rp.permissionId))
      .filter((p): p is PermRow => p?.resource === "Admission");
    const seededParentTuples = new Set(
      parentAdmissionPerms.map((p) => `${p.action}:${p.scope}`),
    );
    expect(seededParentTuples).toEqual(expectedParentTuples);
  });
});
