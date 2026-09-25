import { describe, it, expect, vi } from "vitest";
import {
  findParentCandidates,
  normaliseName,
  normaliseNik,
  MAX_PARENT_CANDIDATES,
  type ParentTable,
} from "./match";

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nik: string | null;
  _count: { guardians: number };
};

function row(partial: Partial<Row> & { id: string; name: string }): Row {
  return {
    email: null,
    phone: null,
    nik: null,
    _count: { guardians: 0 },
    ...partial,
  };
}

/**
 * findParentCandidates issues exactly one findMany — the tenant's ACTIVE
 * parents — and does every comparison in JS. The mock returns whatever the
 * test seeds, mirroring what Postgres would hand back for that WHERE.
 */
function mockPrisma(rows: Row[] = []) {
  const findMany = vi.fn(
    async (_args: { where: Record<string, unknown> }) => rows,
  );
  return {
    prisma: { parent: { findMany } } as unknown as ParentTable,
    findMany,
  };
}

describe("normaliseName", () => {
  it("case-folds and collapses internal whitespace", () => {
    expect(normaliseName("  Siti   Aminah ")).toBe("siti aminah");
    expect(normaliseName("SITI AMINAH")).toBe("siti aminah");
  });
});

describe("normaliseNik", () => {
  it("keeps digits only so formatting never blocks a match", () => {
    expect(normaliseNik("3204-1122-3344-5566")).toBe("3204112233445566");
  });
});

describe("findParentCandidates", () => {
  it("returns nothing when every input field is empty", async () => {
    const { prisma, findMany } = mockPrisma();
    const out = await findParentCandidates({ tenantId: "t1" }, prisma);
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("matches on email and reports childCount", async () => {
    const { prisma } = mockPrisma([
      row({
        id: "p1",
        name: "Siti Aminah",
        email: "siti@example.com",
        _count: { guardians: 2 },
      }),
    ]);
    const out = await findParentCandidates(
      { tenantId: "t1", email: "  SITI@example.com " },
      prisma,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "p1",
      matchReason: "email",
      childCount: 2,
    });
  });

  // The three formatting cases below are why matching runs in JS on both
  // sides: a SQL `equals` against a normalised needle misses every one.
  it("matches a stored name carrying stray double spaces", async () => {
    const { prisma } = mockPrisma([row({ id: "p1", name: "Siti  Aminah" })]);
    const out = await findParentCandidates(
      { tenantId: "t1", name: "SITI AMINAH" },
      prisma,
    );
    expect(out[0]).toMatchObject({ id: "p1", matchReason: "name" });
  });

  it("matches a stored NIK carrying separators", async () => {
    const { prisma } = mockPrisma([
      row({ id: "p1", name: "Budi", nik: "3204-1122-3344-5566" }),
    ]);
    const out = await findParentCandidates(
      { tenantId: "t1", nik: "3204112233445566" },
      prisma,
    );
    expect(out[0]).toMatchObject({ id: "p1", matchReason: "nik" });
  });

  it("matches a +62 phone against a stored 0-prefixed formatted one", async () => {
    const { prisma } = mockPrisma([
      row({ id: "p1", name: "Budi", phone: "0812-3456-7890" }),
    ]);
    const out = await findParentCandidates(
      { tenantId: "t1", phone: "+62 812 3456 7890" },
      prisma,
    );
    expect(out[0]).toMatchObject({ id: "p1", matchReason: "phone" });
  });

  it("keeps the strongest reason when one parent matches several fields", async () => {
    const { prisma } = mockPrisma([
      row({
        id: "p1",
        name: "Siti Aminah",
        email: "siti@example.com",
        phone: "081234567890",
      }),
    ]);
    const out = await findParentCandidates(
      {
        tenantId: "t1",
        name: "Siti Aminah",
        email: "siti@example.com",
        phone: "081234567890",
      },
      prisma,
    );
    expect(out).toHaveLength(1);
    expect(out[0].matchReason).toBe("email");
  });

  it("orders email before nik before phone before name", async () => {
    const { prisma } = mockPrisma([
      row({ id: "by-name", name: "Siti Aminah" }),
      row({ id: "by-nik", name: "Lain", nik: "3204112233445566" }),
      row({ id: "by-email", name: "Beda", email: "siti@example.com" }),
      row({ id: "by-phone", name: "Budi", phone: "081234567890" }),
    ]);
    const out = await findParentCandidates(
      {
        tenantId: "t1",
        name: "Siti Aminah",
        email: "siti@example.com",
        nik: "3204 1122 3344 5566",
        phone: "081234567890",
      },
      prisma,
    );
    expect(out.map((c) => c.id)).toEqual([
      "by-email",
      "by-nik",
      "by-phone",
      "by-name",
    ]);
  });

  it("caps the list at MAX_PARENT_CANDIDATES", async () => {
    const { prisma } = mockPrisma(
      Array.from({ length: 9 }, (_, i) =>
        row({ id: `p${i}`, name: "Siti Aminah" }),
      ),
    );
    const out = await findParentCandidates(
      { tenantId: "t1", name: "Siti Aminah" },
      prisma,
    );
    expect(out).toHaveLength(MAX_PARENT_CANDIDATES);
  });

  it("scopes the query to the tenant and to ACTIVE parents", async () => {
    const { prisma, findMany } = mockPrisma();
    await findParentCandidates(
      { tenantId: "t1", name: "Siti", phone: "081234567890" },
      prisma,
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "t1",
      status: "ACTIVE",
    });
  });

  it("leaves out a parent who matches on no supplied field", async () => {
    const { prisma } = mockPrisma([
      row({ id: "p1", name: "Someone Else", email: "other@x.com" }),
    ]);
    const out = await findParentCandidates(
      { tenantId: "t1", name: "Siti Aminah" },
      prisma,
    );
    expect(out).toEqual([]);
  });
});
