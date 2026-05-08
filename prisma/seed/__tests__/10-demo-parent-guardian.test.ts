// @vitest-environment node
//
// Unit tests for seedDemoParentGuardian. Idempotency: first-run creates two
// rows (owned + unowned fixture); re-run updates the owned row's fullName
// and skips the fixture; missing parent User throws cleanly.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-write-widening.md (T2)

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  seedDemoParentGuardian,
  PARENT_OWNED_GUARDIAN_NAME,
  UNOWNED_FIXTURE_GUARDIAN_NAME,
} from "../10-demo-parent-guardian";

type GuardianRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  fullName: string;
  deletedAt: Date | null;
};

type FindFirstArgs = {
  where: {
    tenantId: string;
    userId?: string | null;
    fullName?: string;
    deletedAt?: null;
  };
};

type CreateArgs = {
  data: { tenantId: string; userId: string | null; fullName: string };
};

type UpdateArgs = {
  where: { id: string };
  data: { fullName?: string; deletedAt?: null };
};

function makePrismaMock(opts?: { parentUserId?: string | null }) {
  // Use property-presence check rather than `??` so explicit null overrides
  // the default — `??` would coalesce null back to "u_parent".
  const parentUserId =
    opts && "parentUserId" in opts ? opts.parentUserId : "u_parent";
  const rows: GuardianRow[] = [];
  let nextId = 1;

  const userFindFirst = vi.fn(async () => {
    return parentUserId === null ? null : { id: parentUserId };
  });

  const guardianFindFirst = vi.fn(async (args: FindFirstArgs) => {
    return (
      rows.find((r) => {
        if (r.tenantId !== args.where.tenantId) return false;
        if (r.deletedAt !== null) return false;
        if (args.where.userId !== undefined && r.userId !== args.where.userId)
          return false;
        if (args.where.fullName !== undefined && r.fullName !== args.where.fullName)
          return false;
        return true;
      }) ?? null
    );
  });

  const guardianCreate = vi.fn(async (args: CreateArgs) => {
    const row: GuardianRow = {
      id: `g${nextId++}`,
      tenantId: args.data.tenantId,
      userId: args.data.userId,
      fullName: args.data.fullName,
      deletedAt: null,
    };
    rows.push(row);
    return row;
  });

  const guardianUpdate = vi.fn(async (args: UpdateArgs) => {
    const r = rows.find((x) => x.id === args.where.id);
    if (!r) throw new Error("Mock update: row missing");
    if (args.data.fullName !== undefined) r.fullName = args.data.fullName;
    if (args.data.deletedAt === null) r.deletedAt = null;
    return r;
  });

  return {
    rows,
    parentUserId,
    prisma: {
      user: { findFirst: userFindFirst },
      guardian: {
        findFirst: guardianFindFirst,
        create: guardianCreate,
        update: guardianUpdate,
      },
    },
    userFindFirst,
    guardianFindFirst,
    guardianCreate,
    guardianUpdate,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedDemoParentGuardian", () => {
  it("first-run creates 2 rows (owned + unowned fixture)", async () => {
    const m = makePrismaMock();
    await seedDemoParentGuardian(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(2);
    expect(m.guardianCreate).toHaveBeenCalledTimes(2);
    expect(m.guardianUpdate).not.toHaveBeenCalled();

    const owned = m.rows.find((r) => r.userId === "u_parent");
    expect(owned).toBeDefined();
    expect(owned!.fullName).toBe(PARENT_OWNED_GUARDIAN_NAME);

    const fixture = m.rows.find((r) => r.userId === null);
    expect(fixture).toBeDefined();
    expect(fixture!.fullName).toBe(UNOWNED_FIXTURE_GUARDIAN_NAME);
  });

  it("re-run on populated state: 0 creates + 1 update on owned + 0 on fixture", async () => {
    const m = makePrismaMock();
    await seedDemoParentGuardian(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(2);

    m.guardianCreate.mockClear();
    m.guardianUpdate.mockClear();

    await seedDemoParentGuardian(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(2);
    expect(m.guardianCreate).not.toHaveBeenCalled();
    expect(m.guardianUpdate).toHaveBeenCalledTimes(1);

    const updateArg = m.guardianUpdate.mock.calls[0]![0]!;
    expect(updateArg.data.deletedAt).toBe(null);
    expect(updateArg.data.fullName).toBe(PARENT_OWNED_GUARDIAN_NAME);
  });

  it("missing parent User throws", async () => {
    const m = makePrismaMock({ parentUserId: null });
    await expect(seedDemoParentGuardian(m.prisma as never, "t_demo")).rejects.toThrow(
      /parent User missing/,
    );
    expect(m.guardianCreate).not.toHaveBeenCalled();
    expect(m.guardianUpdate).not.toHaveBeenCalled();
  });

  it("post-soft-delete: precheck filters deletedAt → owned create-path; fixture create-path", async () => {
    // Soft-delete an existing owned row in the mock store. The seed's
    // `findFirst` includes `deletedAt: null` → soft-deleted row is invisible →
    // create branch fires. Schema has no partial-unique on (tenantId, userId)
    // so create succeeds. Verifies the resurrect-vs-create branching choice.
    const m = makePrismaMock();
    await seedDemoParentGuardian(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(2);

    for (const r of m.rows) r.deletedAt = new Date();

    m.guardianCreate.mockClear();
    m.guardianUpdate.mockClear();

    await seedDemoParentGuardian(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(4);
    expect(m.guardianCreate).toHaveBeenCalledTimes(2);
    expect(m.guardianUpdate).not.toHaveBeenCalled();
  });
});
