// @vitest-environment node
//
// Unit tests for seedRealAdmin. Idempotency: first-run creates User +
// UserRole; re-run updates User in place + upsert UserRole no-op. Missing
// admin role aborts with a helpful error.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T2)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { REAL_ADMINS, seedRealAdmin } from "../11-real-admin";

type UserRow = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  isActive: boolean;
  deletedAt: Date | null;
};
type UserRoleRow = { userId: string; roleId: string; tenantId: string };

function makePrismaMock(opts: { adminRoleExists?: boolean } = {}) {
  const adminRoleExists = opts.adminRoleExists ?? true;
  const users: UserRow[] = [];
  const userRoles: UserRoleRow[] = [];
  let nextUserId = 1;

  const role = {
    findFirst: vi.fn(async () => (adminRoleExists ? { id: "role_admin" } : null)),
  };
  const user = {
    findFirst: vi.fn(async (args: { where: { tenantId: string; email: string } }) => {
      return (
        users.find(
          (u) => u.tenantId === args.where.tenantId && u.email === args.where.email,
        ) ?? null
      );
    }),
    create: vi.fn(async (args: { data: Omit<UserRow, "id" | "deletedAt"> }) => {
      const row: UserRow = {
        id: `u${nextUserId++}`,
        tenantId: args.data.tenantId,
        email: args.data.email,
        name: args.data.name,
        isActive: args.data.isActive,
        deletedAt: null,
      };
      users.push(row);
      return { id: row.id };
    }),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: { name: string; isActive: boolean; deletedAt: Date | null };
      }) => {
        const u = users.find((r) => r.id === args.where.id);
        if (!u) throw new Error("not_found");
        u.name = args.data.name;
        u.isActive = args.data.isActive;
        u.deletedAt = args.data.deletedAt;
        return u;
      },
    ),
  };
  const userRole = {
    upsert: vi.fn(
      async (args: {
        where: { userId_roleId_tenantId: UserRoleRow };
        create: UserRoleRow;
      }) => {
        const key = args.where.userId_roleId_tenantId;
        const existing = userRoles.find(
          (r) =>
            r.userId === key.userId && r.roleId === key.roleId && r.tenantId === key.tenantId,
        );
        if (existing) return existing;
        userRoles.push(args.create);
        return args.create;
      },
    ),
  };

  return {
    users,
    userRoles,
    role,
    user,
    userRole,
    prisma: { role, user, userRole },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedRealAdmin", () => {
  it("first-run creates User + UserRole", async () => {
    const m = makePrismaMock();
    await seedRealAdmin(m.prisma as never, "t_demo");
    expect(m.users).toHaveLength(REAL_ADMINS.length);
    expect(m.users[0].email).toBe("ismailir10@gmail.com");
    expect(m.users[0].name).toBe("Ismail");
    expect(m.users[0].isActive).toBe(true);
    expect(m.userRoles).toHaveLength(REAL_ADMINS.length);
    expect(m.userRoles[0].roleId).toBe("role_admin");
    expect(m.user.create).toHaveBeenCalledTimes(REAL_ADMINS.length);
    expect(m.userRole.upsert).toHaveBeenCalledTimes(REAL_ADMINS.length);
  });

  it("re-run is idempotent (User updated in place, UserRole upsert no-op)", async () => {
    const m = makePrismaMock();
    await seedRealAdmin(m.prisma as never, "t_demo");
    expect(m.users).toHaveLength(REAL_ADMINS.length);
    expect(m.userRoles).toHaveLength(REAL_ADMINS.length);

    m.user.create.mockClear();
    m.user.update.mockClear();
    m.userRole.upsert.mockClear();

    await seedRealAdmin(m.prisma as never, "t_demo");
    expect(m.users).toHaveLength(REAL_ADMINS.length);
    expect(m.userRoles).toHaveLength(REAL_ADMINS.length);
    expect(m.user.create).not.toHaveBeenCalled();
    expect(m.user.update).toHaveBeenCalledTimes(REAL_ADMINS.length);
    expect(m.userRole.upsert).toHaveBeenCalledTimes(REAL_ADMINS.length);
  });

  it("re-run undeletes a soft-deleted User (deletedAt cleared)", async () => {
    const m = makePrismaMock();
    await seedRealAdmin(m.prisma as never, "t_demo");
    m.users[0].deletedAt = new Date();
    m.users[0].isActive = false;

    await seedRealAdmin(m.prisma as never, "t_demo");
    expect(m.users[0].deletedAt).toBeNull();
    expect(m.users[0].isActive).toBe(true);
  });

  it("aborts with a helpful error when admin role is missing", async () => {
    const m = makePrismaMock({ adminRoleExists: false });
    await expect(seedRealAdmin(m.prisma as never, "t_demo")).rejects.toThrow(
      /role admin not found/,
    );
    expect(m.users).toHaveLength(0);
    expect(m.userRoles).toHaveLength(0);
  });
});
