// Live-DB integrity test for the AuditLog append-only trigger.
//
// Gated by `process.env.TEST_DATABASE_URL` — `describe.skipIf(...)` so CI's
// lint-typecheck-test job (no DATABASE_URL) skips cleanly. Developers run on
// demand against a local Docker Postgres they bring themselves:
//
//   docker run --rm -d -p 5433:5432 \
//     -e POSTGRES_PASSWORD=test postgres:15
//   TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres" \
//     npx prisma migrate deploy
//   TEST_DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres" \
//     npx vitest run lib/audit/__tests__/append-only-trigger.test.ts
//
// Verifies:
//   1. INSERT into AuditLog succeeds; row routes to correct partition.
//   2. UPDATE on a row throws — message matches `/audit_log_block_update_delete|append-only/i`.
//   3. DELETE on a row throws — same message contract.
//   4. Cross-partition routing — two distinct months land in distinct partitions.
//
// Cleanup: TRUNCATE on the parent (cascades to all partitions; bypasses the
// row-level trigger by design — only legitimate path is partition-drop).
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §4.5
// Cycle: docs/cycles/2026-05-05-p1-audit-write-middleware.md
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("AuditLog append-only trigger (live DB)", () => {
  let client: PrismaClient;
  let tenantId: string;

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: TEST_DB });
    client = new PrismaClient({ adapter });

    // Create a throwaway tenant so AuditLog FK satisfies — tenant FK uses
    // ON DELETE RESTRICT so we cleanup at the end.
    tenantId = `t_audit_test_${Date.now()}`;
    await client.tenant.create({
      data: {
        id: tenantId,
        name: "Audit Trigger Test Tenant",
        slug: tenantId,
        bootstrapStatus: "COMPLETE",
      },
    });
  });

  afterAll(async () => {
    if (!client) return;
    await client.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog" RESTART IDENTITY CASCADE`,
    );
    await client.tenant.delete({ where: { id: tenantId } });
    await client.$disconnect();
  });

  afterEach(async () => {
    await client.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog" RESTART IDENTITY CASCADE`,
    );
  });

  it("INSERT succeeds and routes to the correct monthly partition", async () => {
    const id = `al_${Date.now()}_a`;
    const createdAt = new Date("2026-05-15T10:00:00.000Z");

    await client.auditLog.create({
      data: {
        id,
        tenantId,
        actorUserId: null,
        action: "CREATE",
        resource: "Test",
        resourceId: "r_1",
        createdAt,
      },
    });

    // Confirm the row landed and that its physical partition matches the
    // 2026-05 monthly bucket. `tableoid::regclass::text` re-emits the table
    // name with the parser's quoting — mixed-case identifiers come back
    // wrapped in double quotes.
    const rows = await client.$queryRawUnsafe<Array<{ part: string }>>(
      `SELECT tableoid::regclass::text AS part FROM "AuditLog" WHERE id = $1`,
      id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].part).toBe('"AuditLog_y2026m05"');
  });

  it("UPDATE throws — append-only trigger fires (raw SQL path)", async () => {
    const id = `al_${Date.now()}_b`;
    await client.auditLog.create({
      data: {
        id,
        tenantId,
        actorUserId: null,
        action: "UPDATE",
        resource: "Test",
        resourceId: "r_1",
        createdAt: new Date("2026-05-15T10:00:00.000Z"),
      },
    });

    await expect(
      client.$executeRawUnsafe(
        `UPDATE "AuditLog" SET resource = 'Tampered' WHERE id = $1`,
        id,
      ),
    ).rejects.toThrow(/audit_log_block_update_delete|append-only/i);
  });

  it("DELETE throws — append-only trigger fires (raw SQL path)", async () => {
    const id = `al_${Date.now()}_c`;
    await client.auditLog.create({
      data: {
        id,
        tenantId,
        actorUserId: null,
        action: "DELETE",
        resource: "Test",
        resourceId: "r_1",
        createdAt: new Date("2026-05-15T10:00:00.000Z"),
      },
    });

    await expect(
      client.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, id),
    ).rejects.toThrow(/audit_log_block_update_delete|append-only/i);
  });

  it("cross-partition routing: two months land in two distinct partitions", async () => {
    const idMay = `al_${Date.now()}_may`;
    const idJun = `al_${Date.now()}_jun`;

    await client.auditLog.createMany({
      data: [
        {
          id: idMay,
          tenantId,
          actorUserId: null,
          action: "CREATE",
          resource: "Test",
          resourceId: "r_1",
          createdAt: new Date("2026-05-15T10:00:00.000Z"),
        },
        {
          id: idJun,
          tenantId,
          actorUserId: null,
          action: "CREATE",
          resource: "Test",
          resourceId: "r_1",
          createdAt: new Date("2026-06-15T10:00:00.000Z"),
        },
      ],
    });

    const rows = await client.$queryRawUnsafe<Array<{ id: string; part: string }>>(
      `SELECT id, tableoid::regclass::text AS part
         FROM "AuditLog"
         WHERE id IN ($1, $2)
         ORDER BY "createdAt" ASC`,
      idMay,
      idJun,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].part).toBe('"AuditLog_y2026m05"');
    expect(rows[1].part).toBe('"AuditLog_y2026m06"');
  });
});
