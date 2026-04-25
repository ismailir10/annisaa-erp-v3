import type { PrismaClient } from "../../lib/generated/prisma/client";
import type { AdminAuthLike } from "./users";

/**
 * Table names we must never include in TRUNCATE output, even if they
 * somehow appear in information_schema for the `public` schema.
 */
const NEVER_TRUNCATE = new Set([
  "_prisma_migrations",
  "schema_migrations",
]);

/**
 * A Prisma table name is a bare identifier (letters, digits, underscore).
 * Anything else is a sign of schema tampering — refuse to quote it.
 */
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type TablesQuery = {
  $queryRawUnsafe: <T = unknown>(sql: string) => Promise<T>;
  $executeRawUnsafe: (sql: string) => Promise<number>;
  $transaction: <T>(fn: (tx: TxQuery) => Promise<T>) => Promise<T>;
};

export type TxQuery = {
  $executeRawUnsafe: (sql: string) => Promise<number>;
};

/**
 * Fetch every application table in the `public` schema, excluding
 * `_prisma_migrations` and any view/materialized-view entries.
 */
export async function listApplicationTables(
  prisma: TablesQuery,
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows
    .map((r) => r.tablename)
    .filter((t) => !NEVER_TRUNCATE.has(t));
}

/**
 * Build a single TRUNCATE statement covering every supplied table.
 * Tables are double-quoted to preserve Prisma PascalCase identifiers.
 * Throws if any name fails the identifier whitelist.
 */
export function buildTruncateSql(tables: string[]): string {
  if (tables.length === 0) {
    throw new Error("buildTruncateSql: no tables provided");
  }
  for (const t of tables) {
    if (!SAFE_IDENT.test(t)) {
      throw new Error(`buildTruncateSql: unsafe table name '${t}'`);
    }
  }
  const list = tables.map((t) => `"${t}"`).join(", ");
  return `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`;
}

/**
 * Run TRUNCATE for every application table in a single transaction.
 * FK cascades handle the relation graph.
 */
export async function truncateApplicationTables(
  prisma: TablesQuery,
  tables: string[],
): Promise<void> {
  const sql = buildTruncateSql(tables);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(sql);
  });
}

/**
 * Page through every auth.users row and return them.
 */
async function listAllAuthUsers(
  admin: AdminAuthLike,
): Promise<Array<{ id: string; email: string | null }>> {
  const all: Array<{ id: string; email: string | null }> = [];
  const perPage = 200;
  let page = 1;
  const maxPages = 100; // 20k cap

  while (page <= maxPages) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const users = data.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
    page++;
  }

  return all;
}

export type DeleteAuthUsersResult = {
  deletedCount: number;
  preservedCount: number;
  deletedEmails: string[];
};

export type AdminDeleteLike = AdminAuthLike & {
  deleteUser: (
    uuid: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Delete every auth.users row whose id is NOT in `preserveUuids`.
 */
export async function deleteNonPreservedAuthUsers(
  admin: AdminDeleteLike,
  preserveUuids: Set<string>,
): Promise<DeleteAuthUsersResult> {
  const all = await listAllAuthUsers(admin);
  const deletedEmails: string[] = [];
  let deletedCount = 0;
  let preservedCount = 0;

  for (const u of all) {
    if (preserveUuids.has(u.id)) {
      preservedCount++;
      continue;
    }
    const { error } = await admin.deleteUser(u.id);
    if (error) {
      throw new Error(
        `deleteUser failed for ${u.id} (${u.email ?? "no email"}): ${error.message}`,
      );
    }
    deletedCount++;
    if (u.email) deletedEmails.push(u.email);
  }

  return { deletedCount, preservedCount, deletedEmails };
}

export type WipeResult = {
  tablesWiped: string[];
  authDeleted: number;
  authPreserved: number;
};

/**
 * Full destructive wipe: TRUNCATE every public table, then delete
 * every non-preserved auth.users row. Returns a summary for logging.
 */
export async function wipeApplicationData(
  prisma: TablesQuery,
  admin: AdminDeleteLike,
  preserveUuids: Set<string>,
): Promise<WipeResult> {
  if (preserveUuids.size === 0) {
    throw new Error(
      "wipeApplicationData: preserveUuids is empty — refusing to wipe all auth users.",
    );
  }

  const tables = await listApplicationTables(prisma);
  if (tables.length === 0) {
    throw new Error(
      "wipeApplicationData: no public tables found — is the Prisma schema applied?",
    );
  }
  await truncateApplicationTables(prisma, tables);
  const { deletedCount, preservedCount } = await deleteNonPreservedAuthUsers(
    admin,
    preserveUuids,
  );

  return {
    tablesWiped: tables,
    authDeleted: deletedCount,
    authPreserved: preservedCount,
  };
}

/**
 * Concrete adapter over a real PrismaClient.
 */
export function tablesQueryFromPrisma(prisma: PrismaClient): TablesQuery {
  return {
    $queryRawUnsafe: (sql) => prisma.$queryRawUnsafe(sql),
    $executeRawUnsafe: (sql) => prisma.$executeRawUnsafe(sql),
    $transaction: (fn) =>
      prisma.$transaction(async (tx) => {
        return fn({
          $executeRawUnsafe: (sql: string) => tx.$executeRawUnsafe(sql),
        });
      }),
  };
}
