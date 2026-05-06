// Unit tests for the NIS allocator (lib/students/nis-allocator.ts).
//
// These tests use a hand-rolled Prisma mock that mirrors the
// PermissionPrismaLike pattern from lib/scaffold/__tests__/permission.test.ts:
// minimal interface surface, vi.fn() instrumentation, no real DB.
//
// DB-level serialization (the actual `pg_advisory_xact_lock` behavior)
// is asserted at the SQL layer by future integration tests; here we
// verify the allocator's lock-key shape, transaction wrapping, and
// sequence-bump arithmetic. Concurrent-acquire test exercises the
// allocator under Promise.all but the underlying mock is sequential —
// see comment on that case for details.

import { describe, expect, it, vi } from "vitest";
import { allocateNis, NisAllocatorError, _internal } from "../nis-allocator";

type SeqRow = { id: string; lastValue: number };

function makeMockPrisma(opts: {
  programCode?: string | null;
  yearName?: string | null;
  yearStartDate?: Date | null;
  initialSequence?: SeqRow | null; // null = no row exists yet (auto-create path)
  programNotFound?: boolean;
  yearNotFound?: boolean;
} = {}) {
  const lockCalls: string[] = [];
  // Mutable closure state. Both findUnique and update read/write through
  // the same `state` ref so concurrent allocators share the row.
  const state: { row: SeqRow | null } = {
    row: opts.initialSequence ? { ...opts.initialSequence } : null,
  };

  type Tx = {
    $queryRaw: ReturnType<typeof vi.fn>;
    studentIdentifierSequence: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    program: { findUnique: ReturnType<typeof vi.fn> };
    academicYear: { findUnique: ReturnType<typeof vi.fn> };
  };
  const tx: Tx = {
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      // Capture the templated lock-key value (first templated arg).
      lockCalls.push(String(values[0] ?? ""));
      return [];
    }),
    studentIdentifierSequence: {
      findUnique: vi.fn(async () => state.row),
      create: vi.fn(async (_args: { data: unknown }) => {
        state.row = { id: "seq_created", lastValue: 0 };
        return state.row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: { lastValue: number } }) => {
        if (state.row && state.row.id === args.where.id) {
          state.row.lastValue = args.data.lastValue;
        }
        return { id: args.where.id, lastValue: args.data.lastValue };
      }),
    },
    program: {
      findUnique: vi.fn(async () =>
        opts.programNotFound ? null : { code: opts.programCode ?? "PAUD-A" },
      ),
    },
    academicYear: {
      findUnique: vi.fn(async () =>
        opts.yearNotFound
          ? null
          : { name: opts.yearName ?? "2025/2026", startDate: opts.yearStartDate ?? null },
      ),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => fn(tx)),
  };

  return { prisma, tx, lockCalls, state };
}

describe("allocateNis — happy path", () => {
  it("first allocate creates sequence row and returns NIS '<code>-25-0001'", async () => {
    const { prisma, lockCalls, tx } = makeMockPrisma({
      programCode: "PAUD-A",
      yearName: "2025/2026",
      initialSequence: null,
    });
    const result = await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_paud_a",
      // The allocator's $transaction surface expects a richer mock than
      // our minimal interface; structural compatibility is enforced by
      // the call site. Cast keeps the test file from depending on
      // generated Prisma types.
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    expect(result.nis).toBe("PAUD-A-25-0001");
    expect(result.sequenceValue).toBe(1);
    expect(lockCalls[0]).toBe("tenant_1:nis:ay_25");
    expect(tx.studentIdentifierSequence.create).toHaveBeenCalledTimes(1);
  });
});

describe("allocateNis — monotonic + auto-create", () => {
  it("monotonic within tenant: existing sequence row returns next value", async () => {
    const { prisma } = makeMockPrisma({
      initialSequence: { id: "seq_1", lastValue: 7 },
    });
    const result = await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_paud_a",
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    expect(result.sequenceValue).toBe(8);
    expect(result.nis).toBe("PAUD-A-25-0008");
  });

  it("missing-sequence-row auto-creates row at lastValue=0 then bumps to 1", async () => {
    const { prisma, tx } = makeMockPrisma({ initialSequence: null });
    const result = await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_paud_a",
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    expect(tx.studentIdentifierSequence.create).toHaveBeenCalledTimes(1);
    expect(result.sequenceValue).toBe(1);
  });
});

describe("allocateNis — isolation", () => {
  it("cross-tenant isolation: lock key includes tenantId verbatim", async () => {
    const { prisma: pA, lockCalls: lockA } = makeMockPrisma({});
    const { prisma: pB, lockCalls: lockB } = makeMockPrisma({});
    await allocateNis({
      tenantId: "tenant_A",
      academicYearId: "ay_25",
      programId: "prog_paud_a",
      prisma: pA as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    await allocateNis({
      tenantId: "tenant_B",
      academicYearId: "ay_25",
      programId: "prog_paud_a",
      prisma: pB as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    expect(lockA[0]).toBe("tenant_A:nis:ay_25");
    expect(lockB[0]).toBe("tenant_B:nis:ay_25");
    expect(lockA[0]).not.toBe(lockB[0]);
  });

  it("cross-program isolation: same lock key but separate sequence rows", async () => {
    // Per assumption 6, the lock key is (tenant, year) — NOT program.
    // Different programs share the lock window but bump independent rows.
    // We assert the lock-key reuse + that findUnique receives the correct
    // composite unique with programId varying.
    const { prisma, tx } = makeMockPrisma({});
    await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_a",
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    const firstCallA = tx.studentIdentifierSequence.findUnique.mock.calls[0]?.[0] as
      | { where: { tenantId_academicYearId_programId: { programId: string } } }
      | undefined;
    expect(firstCallA?.where.tenantId_academicYearId_programId.programId).toBe("prog_a");

    const { prisma: prismaB, tx: txB } = makeMockPrisma({});
    await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_b",
      prisma: prismaB as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    const firstCallB = txB.studentIdentifierSequence.findUnique.mock.calls[0]?.[0] as
      | { where: { tenantId_academicYearId_programId: { programId: string } } }
      | undefined;
    expect(firstCallB?.where.tenantId_academicYearId_programId.programId).toBe("prog_b");
  });

  it("cross-year isolation: lock key includes academicYearId verbatim", async () => {
    const { prisma: p1, lockCalls: l1 } = makeMockPrisma({});
    const { prisma: p2, lockCalls: l2 } = makeMockPrisma({});
    await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_a",
      prisma: p1 as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    await allocateNis({
      tenantId: "tenant_1",
      academicYearId: "ay_26",
      programId: "prog_a",
      prisma: p2 as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    expect(l1[0]).toBe("tenant_1:nis:ay_25");
    expect(l2[0]).toBe("tenant_1:nis:ay_26");
  });
});

describe("allocateNis — error paths", () => {
  it("rejects empty tenantId with INVALID_INPUT", async () => {
    const { prisma } = makeMockPrisma({});
    await expect(
      allocateNis({
        tenantId: "",
        academicYearId: "ay_25",
        programId: "prog_a",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toMatchObject({
      name: "NisAllocatorError",
      code: "INVALID_INPUT",
    });
  });

  it("rejects empty academicYearId with INVALID_INPUT", async () => {
    const { prisma } = makeMockPrisma({});
    await expect(
      allocateNis({
        tenantId: "t1",
        academicYearId: "",
        programId: "prog_a",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects empty programId with INVALID_INPUT", async () => {
    const { prisma } = makeMockPrisma({});
    await expect(
      allocateNis({
        tenantId: "t1",
        academicYearId: "ay_25",
        programId: "",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toBeInstanceOf(NisAllocatorError);
  });

  it("PROGRAM_NOT_FOUND when program lookup returns null", async () => {
    const { prisma } = makeMockPrisma({ programNotFound: true });
    await expect(
      allocateNis({
        tenantId: "t1",
        academicYearId: "ay_25",
        programId: "missing",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toMatchObject({ code: "PROGRAM_NOT_FOUND" });
  });

  it("ACADEMIC_YEAR_NOT_FOUND when year lookup returns null", async () => {
    const { prisma } = makeMockPrisma({ yearNotFound: true });
    await expect(
      allocateNis({
        tenantId: "t1",
        academicYearId: "missing",
        programId: "prog_a",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toMatchObject({ code: "ACADEMIC_YEAR_NOT_FOUND" });
  });

  it("SEQUENCE_OVERFLOW when current value at MAX_SEQUENCE (9999)", async () => {
    const { prisma } = makeMockPrisma({
      initialSequence: { id: "seq_max", lastValue: _internal.MAX_SEQUENCE },
    });
    await expect(
      allocateNis({
        tenantId: "t1",
        academicYearId: "ay_25",
        programId: "prog_a",
        prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
      }),
    ).rejects.toMatchObject({ code: "SEQUENCE_OVERFLOW" });
  });
});

describe("allocateNis — concurrent acquire", () => {
  it("Promise.all of 3 concurrent allocates serializes via shared state", async () => {
    // Note: the mock $transaction is synchronous (`fn(tx)` runs to
    // completion before returning), so Promise.all serializes naturally
    // through the shared `state.row`. Real DB-level serialization is
    // verified by `pg_advisory_xact_lock` semantics in Postgres — out
    // of scope for unit tests; future integration suite covers it.
    const { prisma, lockCalls, state } = makeMockPrisma({
      initialSequence: { id: "seq_1", lastValue: 0 },
    });
    const args = {
      tenantId: "tenant_1",
      academicYearId: "ay_25",
      programId: "prog_a",
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    };
    const results = await Promise.all([
      allocateNis(args),
      allocateNis(args),
      allocateNis(args),
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(lockCalls).toHaveLength(3);
    // Each call observed the same lock key.
    expect(new Set(lockCalls)).toEqual(new Set(["tenant_1:nis:ay_25"]));
    // Sequence values are unique and form the contiguous set {1,2,3}.
    const values = results.map((r) => r.sequenceValue).sort();
    expect(values).toEqual([1, 2, 3]);
    expect(state.row?.lastValue).toBe(3);
  });
});

describe("allocateNis — year suffix derivation", () => {
  it("falls back to startDate year when AcademicYear.name lacks a 4-digit year", async () => {
    const { prisma } = makeMockPrisma({
      yearName: "TA Genap",
      yearStartDate: new Date(Date.UTC(2027, 6, 1)),
    });
    const result = await allocateNis({
      tenantId: "t1",
      academicYearId: "ay",
      programId: "prog_a",
      prisma: prisma as unknown as Parameters<typeof allocateNis>[0]["prisma"],
    });
    // 2027 → "27".
    expect(result.nis).toBe("PAUD-A-27-0001");
  });
});
