import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn(),
}));

import { parseArgs, fixOverCapacityClasses } from "../fix-overcapacity-classes";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scripts/fix-overcapacity-classes — parseArgs", () => {
  it("defaults to dry-run, no tenant, no actor", () => {
    expect(parseArgs([])).toEqual({
      tenantId: null,
      apply: false,
      bump: false,
      actorId: null,
    });
  });

  it("parses --tenant + --apply + --bump + --actor", () => {
    expect(parseArgs(["--tenant", "t1", "--apply", "--bump", "--actor", "u9"])).toEqual({
      tenantId: "t1",
      apply: true,
      bump: true,
      actorId: "u9",
    });
  });

  it("--apply without --bump remains a no-mutate run (gate in the runner)", () => {
    expect(parseArgs(["--apply"])).toEqual({
      tenantId: null,
      apply: true,
      bump: false,
      actorId: null,
    });
  });
});

describe("scripts/fix-overcapacity-classes — fixOverCapacityClasses", () => {
  it("returns 0/0 when no sections are over capacity", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.classSection.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs1", name: "TKIT A", capacity: 20, tenantId: "t1", _count: { enrollments: 20 } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs2", name: "KB Aster", capacity: 15, tenantId: "t1", _count: { enrollments: 10 } } as any,
    ]);

    const result = await fixOverCapacityClasses({
      tenantId: "t1",
      apply: false,
      bump: false,
      actorId: null,
    });
    expect(result).toEqual({ scanned: 0, bumped: 0 });
  });

  it("dry-run: reports offenders but mutates nothing", async () => {
    const { prisma } = await import("@/lib/db");
    const { recordAudit } = await import("@/lib/audit");
    vi.mocked(prisma.classSection.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs1", name: "TKIT B", capacity: 20, tenantId: "t1", _count: { enrollments: 21 } } as any,
    ]);

    const result = await fixOverCapacityClasses({
      tenantId: "t1",
      apply: false,
      bump: false,
      actorId: null,
    });
    expect(result).toEqual({ scanned: 1, bumped: 0 });
    expect(prisma.classSection.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("apply+bump: updates capacity + writes audit row, resolves actor from SUPER_ADMIN", async () => {
    const { prisma } = await import("@/lib/db");
    const { recordAudit } = await import("@/lib/audit");
    vi.mocked(prisma.classSection.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs1", name: "TKIT B", capacity: 20, tenantId: "t1", _count: { enrollments: 21 } } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-admin" } as any);

    // Inline $transaction: invoke the callback with the same mocked client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));

    await fixOverCapacityClasses({
      tenantId: "t1",
      apply: true,
      bump: true,
      actorId: null,
    });

    expect(prisma.classSection.update).toHaveBeenCalledWith({
      where: { id: "cs1" },
      data: { capacity: 21 },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        actorId: "u-admin",
        entity: "ClassSection",
        entityId: "cs1",
        action: "class.capacity.bump",
        before: { capacity: 20, active: 21 },
        after: { capacity: 21 },
      }),
      expect.anything(),
    );
  });

  it("throws if --actor missing and no SUPER_ADMIN exists for tenant", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.classSection.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs1", name: "TKIT B", capacity: 20, tenantId: "t1", _count: { enrollments: 21 } } as any,
    ]);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(
      fixOverCapacityClasses({ tenantId: "t1", apply: true, bump: true, actorId: null }),
    ).rejects.toThrow(/No SUPER_ADMIN user found for tenant t1/);
  });

  it("honours --actor override without hitting User.findFirst", async () => {
    const { prisma } = await import("@/lib/db");
    const { recordAudit } = await import("@/lib/audit");
    vi.mocked(prisma.classSection.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cs1", name: "TKIT B", capacity: 20, tenantId: "t1", _count: { enrollments: 21 } } as any,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));

    await fixOverCapacityClasses({
      tenantId: "t1",
      apply: true,
      bump: true,
      actorId: "u-override",
    });

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "u-override" }),
      expect.anything(),
    );
  });
});
