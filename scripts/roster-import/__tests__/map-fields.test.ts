import { describe, it, expect } from "vitest";
import {
  parseIndonesianBirthDate,
  buildAddress,
  mapLivingWith,
  buildParentRecord,
} from "../map-fields";
import type { AyahIbuFields } from "../parse-xlsx";

describe("parseIndonesianBirthDate", () => {
  it("parses an Indonesian date string (day Month year)", () => {
    expect(parseIndonesianBirthDate("27 Agustus 2020")).toBe("2020-08-27");
  });

  it("parses a single-digit day", () => {
    expect(parseIndonesianBirthDate("5 Januari 2021")).toBe("2021-01-05");
  });

  it("parses a real Date object from an Excel date cell", () => {
    const raw = new Date("2021-03-31T00:00:00.000Z");
    expect(parseIndonesianBirthDate(raw)).toBe("2021-03-31");
  });

  it("passes through an already-ISO string unchanged", () => {
    expect(parseIndonesianBirthDate("2022-03-26")).toBe("2022-03-26");
  });

  it("throws on an unrecognised string format", () => {
    expect(() => parseIndonesianBirthDate("not a date")).toThrow();
  });

  it("throws on an unknown month name", () => {
    expect(() => parseIndonesianBirthDate("1 Zzzuary 2020")).toThrow();
  });

  it("throws on an invalid Date object", () => {
    expect(() => parseIndonesianBirthDate(new Date("invalid"))).toThrow();
  });
});

describe("buildAddress", () => {
  it("joins all three non-empty parts with comma-space", () => {
    expect(
      buildAddress("Jl. Telaga Asih no 108 blok i no 6", "Telaga Asih", "Cikarang Barat"),
    ).toBe("Jl. Telaga Asih no 108 blok i no 6, Telaga Asih, Cikarang Barat");
  });

  it("skips null/undefined/blank parts", () => {
    expect(buildAddress("Jl. Mawar 1", null, undefined)).toBe("Jl. Mawar 1");
    expect(buildAddress("", "Telaga Asih", "Cikarang Barat")).toBe(
      "Telaga Asih, Cikarang Barat",
    );
  });

  it("skips '-' placeholder parts", () => {
    expect(buildAddress("Jl. Mawar 1", "-", "Cikarang Barat")).toBe(
      "Jl. Mawar 1, Cikarang Barat",
    );
  });

  it("returns empty string when everything is blank", () => {
    expect(buildAddress(null, undefined, "-")).toBe("");
  });
});

describe("mapLivingWith", () => {
  it("maps 'Orang Tua' to ORANG_TUA", () => {
    expect(mapLivingWith("Orang Tua")).toBe("ORANG_TUA");
  });

  it("is case-insensitive", () => {
    expect(mapLivingWith("orang tua")).toBe("ORANG_TUA");
  });

  it("maps 'Wali' to WALI", () => {
    expect(mapLivingWith("Wali")).toBe("WALI");
  });

  it("maps any other non-empty value to LAINNYA", () => {
    expect(mapLivingWith("Kakek/Nenek")).toBe("LAINNYA");
  });

  it("returns empty string for missing/blank/placeholder input", () => {
    expect(mapLivingWith(null)).toBe("");
    expect(mapLivingWith(undefined)).toBe("");
    expect(mapLivingWith("")).toBe("");
    expect(mapLivingWith("-")).toBe("");
  });
});

describe("buildParentRecord", () => {
  const fullFields: AyahIbuFields = {
    nama: "Supardi",
    nik: "3275042108790027",
    pendidikan: "SMA",
    pekerjaan: "Karyawan Swasta",
    namaKantor: "PT. TainahExpres Indonesia",
    alamatKantor: "Kawasan KBN",
    kota: "Bekasi",
    penghasilan: "Rp. 5.000.000 s/d Rp. 10.000.000",
  };

  it("maps every field 1:1 onto the Parent shape", () => {
    expect(buildParentRecord(fullFields)).toEqual({
      name: "Supardi",
      nik: "3275042108790027",
      education: "SMA",
      occupation: "Karyawan Swasta",
      employer: "PT. TainahExpres Indonesia",
      employerAddress: "Kawasan KBN",
      employerCity: "Bekasi",
      incomeRange: "Rp. 5.000.000 s/d Rp. 10.000.000",
    });
  });

  it("normalises '-' placeholders and nulls to null (not name, which stays a trimmed string)", () => {
    const sparse: AyahIbuFields = {
      nama: "  Dwi Santoso  ",
      nik: null,
      pendidikan: "-",
      pekerjaan: null,
      namaKantor: "-",
      alamatKantor: "-",
      kota: "Bekasi",
      penghasilan: "-",
    };
    expect(buildParentRecord(sparse)).toEqual({
      name: "Dwi Santoso",
      nik: null,
      education: null,
      occupation: null,
      employer: null,
      employerAddress: null,
      employerCity: "Bekasi",
      incomeRange: null,
    });
  });

  it("returns an empty name when nama is null", () => {
    const noName: AyahIbuFields = {
      nama: null,
      nik: null,
      pendidikan: null,
      pekerjaan: null,
      namaKantor: null,
      alamatKantor: null,
      kota: null,
      penghasilan: null,
    };
    expect(buildParentRecord(noName).name).toBe("");
  });
});
