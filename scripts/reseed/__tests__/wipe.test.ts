import { describe, it, expect, vi } from "vitest";
import {
  buildTruncateSql,
  listApplicationTables,
  truncateApplicationTables,
  deleteNonPreservedAuthUsers,
  wipeApplicationData,
  type TablesQuery,
  type AdminDeleteLike,
} from "../wipe";

function makeTablesQuery(
  tableRows: Array<{ tablename: string }>,
  hooks: {
    onExec?: (sql: string) => void;
    execError?: Error;
  } = {},
): TablesQuery {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(tableRows),
    $executeRawUnsafe: vi.fn().mockImplementation(async (sql: string) => {
      hooks.onExec?.(sql);
      if (hooks.execError) throw hooks.execError;
      return 0;
    }),
    $transaction: async (fn) => {
      const tx = {
        $executeRawUnsafe: async (sql: string) => {
          hooks.onExec?.(sql);
          if (hooks.execError) throw hooks.execError;
          return 0;
        },
      };
      return fn(tx);
    },
  };
}

describe("buildTruncateSql", () => {
  it("wraps names in double quotes and ends with RESTART IDENTITY CASCADE", () => {
    const sql = buildTruncateSql(["User", "Tenant", "ClassSection"]);
    expect(sql).toBe(
      `TRUNCATE TABLE "User", "Tenant", "ClassSection" RESTART IDENTITY CASCADE`,
    );
  });

  it("rejects empty table list", () => {
    expect(() => buildTruncateSql([])).toThrow(/no tables/);
  });

  it("rejects names with SQL-injection characters", () => {
    expect(() =>
      buildTruncateSql(["User", `"; DROP TABLE foo;--`]),
    ).toThrow(/unsafe table name/);
    expect(() => buildTruncateSql(["bad-name"])).toThrow(/unsafe/);
    expect(() => buildTruncateSql(["bad name"])).toThrow(/unsafe/);
    expect(() => buildTruncateSql(["bad;name"])).toThrow(/unsafe/);
  });

  it("accepts underscore + digit identifiers", () => {
    const sql = buildTruncateSql(["_table_with_underscores", "t123"]);
    expect(sql).toContain(`"_table_with_underscores"`);
    expect(sql).toContain(`"t123"`);
  });
});

describe("listApplicationTables", () => {
  it("excludes _prisma_migrations", async () => {
    const prisma = makeTablesQuery([
      { tablename: "User" },
      { tablename: "_prisma_migrations" },
      { tablename: "Tenant" },
      { tablename: "schema_migrations" },
    ]);
    const tables = await listApplicationTables(prisma);
    expect(tables).toEqual(["User", "Tenant"]);
  });

  it("returns empty list when no public tables exist", async () => {
    const prisma = makeTablesQuery([]);
    expect(await listApplicationTables(prisma)).toEqual([]);
  });
});

describe("truncateApplicationTables", () => {
  it("runs TRUNCATE inside a transaction", async () => {
    const execCalls: string[] = [];
    const prisma = makeTablesQuery([], {
      onExec: (sql) => execCalls.push(sql),
    });
    await truncateApplicationTables(prisma, ["User", "Tenant"]);
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]).toContain(`TRUNCATE TABLE "User", "Tenant"`);
  });
});

function makeAdmin(
  authUsers: Array<{ id: string; email: string | null }>,
  deleteError?: string,
): {
  admin: AdminDeleteLike;
  deletedIds: string[];
} {
  const deletedIds: string[] = [];
  const perPage = 200;

  const admin: AdminDeleteLike = {
    listUsers: async ({ page }) => {
      const start = (page - 1) * perPage;
      const slice = authUsers.slice(start, start + perPage);
      return { data: { users: slice }, error: null };
    },
    createUser: async () => ({
      data: { user: null },
      error: { message: "not used in this test" },
    }),
    deleteUser: async (id) => {
      if (deleteError) {
        return { data: null, error: { message: deleteError } };
      }
      deletedIds.push(id);
      return { data: null, error: null };
    },
  };
  return { admin, deletedIds };
}

describe("deleteNonPreservedAuthUsers", () => {
  it("deletes everyone not in the preserve set", async () => {
    const users = [
      { id: "a", email: "a@example.test" },
      { id: "b", email: "b@example.test" },
      { id: "c", email: "c@example.test" },
    ];
    const { admin, deletedIds } = makeAdmin(users);
    const res = await deleteNonPreservedAuthUsers(admin, new Set(["b"]));
    expect(deletedIds.sort()).toEqual(["a", "c"]);
    expect(res.deletedCount).toBe(2);
    expect(res.preservedCount).toBe(1);
    expect(res.deletedEmails.sort()).toEqual(["a@example.test", "c@example.test"]);
  });

  it("preserves all users when every id is in the set", async () => {
    const users = [
      { id: "a", email: "a@example.test" },
      { id: "b", email: "b@example.test" },
    ];
    const { admin, deletedIds } = makeAdmin(users);
    const res = await deleteNonPreservedAuthUsers(
      admin,
      new Set(["a", "b"]),
    );
    expect(deletedIds).toEqual([]);
    expect(res.deletedCount).toBe(0);
    expect(res.preservedCount).toBe(2);
  });

  it("propagates deleteUser errors", async () => {
    const users = [{ id: "a", email: "a@example.test" }];
    const { admin } = makeAdmin(users, "permission denied");
    await expect(
      deleteNonPreservedAuthUsers(admin, new Set()),
    ).rejects.toThrow(/permission denied/);
  });

  it("counts deletes correctly even when some users have null email", async () => {
    const users = [
      { id: "a", email: null },
      { id: "b", email: "b@example.test" },
      { id: "c", email: null },
    ];
    const { admin, deletedIds } = makeAdmin(users);
    const res = await deleteNonPreservedAuthUsers(admin, new Set());
    expect(deletedIds.sort()).toEqual(["a", "b", "c"]);
    expect(res.deletedCount).toBe(3);
    expect(res.deletedEmails).toEqual(["b@example.test"]);
  });

  it("handles pagination across many auth users", async () => {
    const users = Array.from({ length: 401 }, (_, i) => ({
      id: `u-${i}`,
      email: `u-${i}@example.test`,
    }));
    const preserve = new Set(["u-0", "u-100", "u-400"]);
    const { admin, deletedIds } = makeAdmin(users);
    const res = await deleteNonPreservedAuthUsers(admin, preserve);
    expect(res.preservedCount).toBe(3);
    expect(res.deletedCount).toBe(398);
    expect(deletedIds).toHaveLength(398);
  });
});

describe("wipeApplicationData", () => {
  it("refuses when preserve set is empty", async () => {
    const prisma = makeTablesQuery([{ tablename: "User" }]);
    const { admin } = makeAdmin([]);
    await expect(
      wipeApplicationData(prisma, admin, new Set()),
    ).rejects.toThrow(/preserveUuids is empty/);
  });

  it("refuses when no public tables are discovered", async () => {
    const prisma = makeTablesQuery([]);
    const { admin } = makeAdmin([]);
    await expect(
      wipeApplicationData(prisma, admin, new Set(["keep"])),
    ).rejects.toThrow(/no public tables/);
  });

  it("runs truncate then auth cleanup and returns a summary", async () => {
    const execCalls: string[] = [];
    const prisma = makeTablesQuery(
      [
        { tablename: "User" },
        { tablename: "Tenant" },
        { tablename: "_prisma_migrations" },
      ],
      { onExec: (sql) => execCalls.push(sql) },
    );
    const authUsers = [
      { id: "keep", email: "k@example.test" },
      { id: "drop1", email: "d1@example.test" },
      { id: "drop2", email: "d2@example.test" },
    ];
    const { admin, deletedIds } = makeAdmin(authUsers);
    const res = await wipeApplicationData(prisma, admin, new Set(["keep"]));

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]).toContain(`"User", "Tenant"`);
    expect(execCalls[0]).not.toContain("_prisma_migrations");
    expect(deletedIds.sort()).toEqual(["drop1", "drop2"]);
    expect(res.tablesWiped).toEqual(["User", "Tenant"]);
    expect(res.authDeleted).toBe(2);
    expect(res.authPreserved).toBe(1);
  });
});
