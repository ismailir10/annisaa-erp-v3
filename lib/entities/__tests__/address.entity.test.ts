// Address registry tests. Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { address: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import addressEntity from "../address/entity";
import { addressPolicy } from "../address/policy";
import { addressSchema } from "../address/schema";

// ── Schema tests ──────────────────────────────────────────────

describe("Address schema", () => {
  const VALID_INPUT = {
    provinceId: "32",
    regencyId: "3204",
    districtId: "320401",
    villageId: "3204010001",
    streetLine: "Jl. Merdeka No. 1",
  };

  it("accepts canonical valid input with full chain", () => {
    const parsed = addressSchema.parse(VALID_INPUT);
    expect(parsed.provinceId).toBe("32");
    expect(parsed.regencyId).toBe("3204");
    expect(parsed.districtId).toBe("320401");
    expect(parsed.villageId).toBe("3204010001");
  });

  it("accepts input without optional villageId", () => {
    const { villageId: _v, ...rest } = VALID_INPUT;
    const parsed = addressSchema.parse(rest);
    expect(parsed.villageId).toBeUndefined();
  });

  it("accepts rt/rw/postalCode/notes when provided", () => {
    const parsed = addressSchema.parse({
      ...VALID_INPUT,
      rt: "001",
      rw: "002",
      postalCode: "40111",
      notes: "Dekat masjid",
    });
    expect(parsed.rt).toBe("001");
    expect(parsed.rw).toBe("002");
    expect(parsed.postalCode).toBe("40111");
    expect(parsed.notes).toBe("Dekat masjid");
  });

  it("rejects provinceId with wrong length (3 digits)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, provinceId: "320" }),
    ).toThrow();
  });

  it("rejects regencyId outside province (different prefix)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, regencyId: "3304" }),
    ).toThrow();
  });

  it("rejects districtId outside regency (different prefix)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, districtId: "330401" }),
    ).toThrow();
  });

  it("rejects villageId outside district (different prefix)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, villageId: "3304010001" }),
    ).toThrow();
  });

  it("rejects empty streetLine (min 1)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, streetLine: "" }),
    ).toThrow();
  });

  it("rejects streetLine over 500 chars", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, streetLine: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects invalid postalCode (non-digit)", () => {
    expect(() =>
      addressSchema.parse({ ...VALID_INPUT, postalCode: "4011A" }),
    ).toThrow();
  });

  it("searchFields exclude PII (no nik/phone fields on Address)", () => {
    // Address has no PII fields — assert searchFields are safe
    const fields = addressEntity.searchFields;
    expect(fields).not.toContain("nik");
    expect(fields).not.toContain("phone");
  });
});

// ── EntityDef shape tests ──────────────────────────────────────

describe("Address EntityDef shape", () => {
  it("exports default addressEntity", () => {
    expect(addressEntity).toBeDefined();
    expect(typeof addressEntity).toBe("object");
  });

  it("key === 'address'", () => {
    expect(addressEntity.key).toBe("address");
  });

  it("resource === 'Address'", () => {
    expect(addressEntity.resource).toBe("Address");
  });

  it("label and labelSingular are 'Alamat'", () => {
    expect(addressEntity.label).toBe("Alamat");
    expect(addressEntity.labelSingular).toBe("Alamat");
  });

  it("icon is 'MapPin'", () => {
    expect(addressEntity.icon).toBe("MapPin");
  });

  it("ships only 1 filter (under-floor deviation — accessed via Household detail)", () => {
    expect(addressEntity.filters).toHaveLength(1);
    expect(addressEntity.filters[0].key).toBe("search");
  });

  it("detailActions is [] (no standalone soft-delete/restore actions this cycle)", () => {
    expect(addressEntity.detailActions).toEqual([]);
  });

  it("has at least 1 detail tab with key 'ringkasan'", () => {
    const tab = addressEntity.detailTabs.find((t) => t.key === "ringkasan");
    expect(tab).toBeDefined();
    expect(tab?.label).toBe("Ringkasan");
  });

  it("listColumns contains streetLine", () => {
    const fields = addressEntity.listColumns.map((c) => c.field);
    expect(fields).toContain("streetLine");
  });

  it("listColumns does not contain nik or phone (no PII on Address)", () => {
    const fields = addressEntity.listColumns.map((c) => c.field);
    expect(fields).not.toContain("nik");
    expect(fields).not.toContain("phone");
  });

  it("formSections has one section with key 'lokasi'", () => {
    expect(addressEntity.formSections).toHaveLength(1);
    expect(addressEntity.formSections[0].key).toBe("lokasi");
  });
});

// ── dataFetcher tenant-filter tests ───────────────────────────

describe("Address dataFetcher", () => {
  it("filters by session.tenantId", async () => {
    const mockSession = { tenantId: "tenant-abc", userId: "user-123", supabaseUserId: "sb-123" };
    vi.mocked(getSession).mockResolvedValue(mockSession as ReturnType<typeof getSession> extends Promise<infer T> ? T : never);

    const mockRows = [{ id: "addr-1", tenantId: "tenant-abc", streetLine: "Jl. A", deletedAt: null }];
    vi.mocked(prisma.address.findMany).mockResolvedValue(mockRows as never);
    vi.mocked(prisma.address.count).mockResolvedValue(1);

    const result = await addressEntity.dataFetcher({
      page: 1,
      pageSize: 20,
      search: "",
      filters: {},
      sort: undefined,
    });

    expect(prisma.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-abc", deletedAt: null }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it("throws UNAUTHENTICATED when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      addressEntity.dataFetcher({ page: 1, pageSize: 20, search: "", filters: {}, sort: undefined }),
    ).rejects.toThrow("UNAUTHENTICATED");
  });
});
