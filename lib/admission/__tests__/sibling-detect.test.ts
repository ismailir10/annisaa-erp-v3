// @vitest-environment node
//
// Unit tests for detectSiblingHousehold. Covers: NIK exact match (single +
// multi), phone-last4 match (single + multi), no-match, NIK-only fallback,
// phone-only fallback, NIK-takes-precedence over phone, soft-deleted
// guardian/student excluded.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T6)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectSiblingHousehold } from "../sibling-detect";

type GuardianRow = {
  id: string;
  tenantId: string;
  nik: string | null;
  phone: string | null;
  deletedAt: Date | null;
  studentGuardians: Array<{
    deletedAt: Date | null;
    student: { householdId: string; deletedAt: Date | null } | null;
  }>;
};

function makePrismaMock(seed: GuardianRow[]) {
  // findMany emulator: applies the where filter we issue in production.
  const findMany = vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
    const w = args.where as {
      tenantId: string;
      deletedAt: null;
      nik?: { in: string[] };
      OR?: Array<{ phone: { endsWith: string } }>;
    };
    const filtered = seed.filter((g) => {
      if (g.tenantId !== w.tenantId) return false;
      if (g.deletedAt !== null) return false;
      if (w.nik) {
        if (!g.nik || !w.nik.in.includes(g.nik)) return false;
      }
      if (w.OR) {
        const phoneMatch = w.OR.some(
          (clause) => g.phone && g.phone.endsWith(clause.phone.endsWith),
        );
        if (!phoneMatch) return false;
      }
      return true;
    });
    return filtered
      .map((g) => ({
        studentGuardians: g.studentGuardians
          .filter((sg) => sg.deletedAt === null && sg.student && sg.student.deletedAt === null)
          .map((sg) => ({ student: { householdId: sg.student!.householdId } })),
      }))
      .slice(0, args.take ?? Number.POSITIVE_INFINITY);
  });
  return {
    findMany,
    prisma: { guardian: { findMany } },
  };
}

const TENANT = "t_demo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectSiblingHousehold", () => {
  it("returns NONE when no candidate fields are supplied", async () => {
    const m = makePrismaMock([]);
    const result = await detectSiblingHousehold(m.prisma as never, { tenantId: TENANT });
    expect(result).toEqual({ householdId: null, matchKind: "NONE" });
  });

  it("matches by NIK exact (single household)", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: "1234567890123456",
        phone: null,
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h1", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "1234567890123456",
    });
    expect(result).toEqual({ householdId: "h1", matchKind: "NIK" });
  });

  it("matches by phone last-4 (single household, mask-aware via endsWith)", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: null,
        phone: "081234567890",
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h2", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      motherPhone: "+62-812-3456-7890",
    });
    expect(result).toEqual({ householdId: "h2", matchKind: "PHONE_LAST4" });
  });

  it("matches by both NIK + phone but precedence is NIK", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: "1234567890123456",
        phone: "081200000000",
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h_nik", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "1234567890123456",
      fatherPhone: "081200000000",
    });
    expect(result.matchKind).toBe("NIK");
    expect(result.householdId).toBe("h_nik");
  });

  it("returns MULTI_MATCH when distinct households surface (NIK)", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: "1111111111111111",
        phone: null,
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h_a", deletedAt: null } },
        ],
      },
      {
        id: "g2",
        tenantId: TENANT,
        nik: "2222222222222222",
        phone: null,
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h_b", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "1111111111111111",
      motherNik: "2222222222222222",
    });
    expect(result).toEqual({ householdId: null, matchKind: "MULTI_MATCH" });
  });

  it("returns NONE when no Guardian rows match", async () => {
    const m = makePrismaMock([]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "9999999999999999",
      motherPhone: "081299999999",
    });
    expect(result).toEqual({ householdId: null, matchKind: "NONE" });
  });

  it("ignores invalid NIK (length != 16) and falls back to phone", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: null,
        phone: "081200001234",
        deletedAt: null,
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h_phone", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "12345", // invalid
      fatherPhone: "081200001234",
    });
    expect(result).toEqual({ householdId: "h_phone", matchKind: "PHONE_LAST4" });
  });

  it("excludes soft-deleted guardian rows from match consideration", async () => {
    const m = makePrismaMock([
      {
        id: "g_deleted",
        tenantId: TENANT,
        nik: "3333333333333333",
        phone: null,
        deletedAt: new Date(),
        studentGuardians: [
          { deletedAt: null, student: { householdId: "h_dead", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "3333333333333333",
    });
    expect(result.householdId).toBeNull();
    expect(result.matchKind).toBe("NONE");
  });

  it("excludes soft-deleted student-link rows so an orphaned guardian doesn't surface a household", async () => {
    const m = makePrismaMock([
      {
        id: "g1",
        tenantId: TENANT,
        nik: "4444444444444444",
        phone: null,
        deletedAt: null,
        studentGuardians: [
          { deletedAt: new Date(), student: { householdId: "h_dead", deletedAt: null } },
        ],
      },
    ]);
    const result = await detectSiblingHousehold(m.prisma as never, {
      tenantId: TENANT,
      fatherNik: "4444444444444444",
    });
    expect(result.householdId).toBeNull();
    expect(result.matchKind).toBe("NONE");
  });
});
