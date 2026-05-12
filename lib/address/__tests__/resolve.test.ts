import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProvinces, getRegencies, getDistricts, fetchVillages } from "../resolve";

describe("getProvinces", () => {
  it("returns at least 34 provinces from the static import", async () => {
    const provinces = await getProvinces();
    expect(provinces.length).toBeGreaterThanOrEqual(34);
    expect(provinces.find((p) => p.id === "32")?.name).toMatch(/jawa barat/i);
  });
});

describe("getRegencies", () => {
  it("filters by provinceCode", async () => {
    const jabar = await getRegencies("32");
    expect(jabar.length).toBeGreaterThan(20);
    expect(jabar.every((r) => r.province_id === "32")).toBe(true);
  });
  it("returns empty array for unknown provinceCode", async () => {
    expect(await getRegencies("9999")).toEqual([]);
  });
});

describe("getDistricts", () => {
  it("filters by regencyCode (Kabupaten Bekasi 3216)", async () => {
    const bekasi = await getDistricts("3216");
    expect(bekasi.length).toBeGreaterThan(0);
    expect(bekasi.every((d) => d.regency_id === "3216")).toBe(true);
  });
  it("returns empty array for unknown regencyCode", async () => {
    expect(await getDistricts("99999")).toEqual([]);
  });
});

describe("fetchVillages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed villages on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ([{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]),
    } as unknown as Response)));

    const result = await fetchVillages("3216081");
    expect(result).toEqual([{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]);
    expect(fetch).toHaveBeenCalledWith("/address/villages/3216081.json", expect.anything());
  });

  it("returns empty array on 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 } as unknown as Response)));
    expect(await fetchVillages("9999999")).toEqual([]);
  });

  it("returns empty array on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchVillages("9999999")).toEqual([]);
  });
});
