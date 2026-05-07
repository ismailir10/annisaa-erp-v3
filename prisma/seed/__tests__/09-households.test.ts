// @vitest-environment node
//
// Unit tests for seedHouseholds. Idempotency: first-run inserts 8 rows;
// re-run is a no-op. Race-window: P2002 from concurrent create is swallowed
// (so a parallel reseed doesn't crash the orchestrator).
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T4)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedHouseholds, HOUSEHOLDS } from "../09-households";

type Row = { id: string; tenantId: string; code: string; deletedAt: null };

function makePrismaMock() {
  const rows: Row[] = [];
  let nextId = 1;
  const findFirst = vi.fn(async (args: { where: { tenantId: string; code: string } }) => {
    return (
      rows.find(
        (r) => r.tenantId === args.where.tenantId && r.code === args.where.code,
      ) ?? null
    );
  });
  const create = vi.fn(async (args: { data: { tenantId: string; code: string } }) => {
    const row: Row = {
      id: `h${nextId++}`,
      tenantId: args.data.tenantId,
      code: args.data.code,
      deletedAt: null,
    };
    rows.push(row);
    return row;
  });
  return {
    rows,
    prisma: { household: { findFirst, create } },
    findFirst,
    create,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seedHouseholds", () => {
  it("first-run inserts all 8 rows", async () => {
    const m = makePrismaMock();
    await seedHouseholds(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(8);
    expect(m.rows.map((r) => r.code)).toEqual(HOUSEHOLDS.map((h) => h.code));
    expect(m.create).toHaveBeenCalledTimes(8);
  });

  it("re-run yields same 8 rows (no duplicates, no errors)", async () => {
    const m = makePrismaMock();
    await seedHouseholds(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(8);
    m.create.mockClear();
    await seedHouseholds(m.prisma as never, "t_demo");
    expect(m.rows).toHaveLength(8);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("swallows P2002 on (tenantId, code) from concurrent create race", async () => {
    const m = makePrismaMock();
    let firstCall = true;
    m.prisma.household.create = vi.fn(async (args: { data: { tenantId: string; code: string } }) => {
      if (firstCall) {
        firstCall = false;
        const err = new Error("Unique constraint failed") as Error & {
          code?: string;
          meta?: { target?: string[] };
        };
        err.code = "P2002";
        err.meta = { target: ["tenantId", "code"] };
        throw err;
      }
      const row: Row = {
        id: `h${m.rows.length + 1}`,
        tenantId: args.data.tenantId,
        code: args.data.code,
        deletedAt: null,
      };
      m.rows.push(row);
      return row;
    });
    await expect(seedHouseholds(m.prisma as never, "t_demo")).resolves.toBeUndefined();
    expect(m.rows).toHaveLength(7);
  });

  it("re-throws P2002 on a different unique index (defensive narrow)", async () => {
    const m = makePrismaMock();
    m.prisma.household.create = vi.fn(async () => {
      const err = new Error("Unique constraint failed") as Error & {
        code?: string;
        meta?: { target?: string[] };
      };
      err.code = "P2002";
      err.meta = { target: ["someFutureGlobalId"] };
      throw err;
    });
    await expect(seedHouseholds(m.prisma as never, "t_demo")).rejects.toThrow(
      /Unique constraint failed/,
    );
  });
});
