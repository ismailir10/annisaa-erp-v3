import { describe, it, expect } from "vitest";
import { isExcluded, isWithdrawn, noGuardianOk, TD1_MANUAL_RECORD } from "../overrides";

describe("overrides", () => {
  describe("isExcluded", () => {
    it("excludes Fahreza Arkha Bima (A1) — future-year cohort", () => {
      expect(isExcluded({ kelas: "A1", namaLengkap: "Fahreza Arkha Bima" })).toBe(true);
    });

    it("excludes Sholeh Nabil Razzaaq (B1) — never enrolled", () => {
      expect(isExcluded({ kelas: "B1", namaLengkap: "Sholeh Nabil Razzaaq" })).toBe(true);
    });

    it("is case/whitespace-insensitive", () => {
      expect(isExcluded({ kelas: "A1", namaLengkap: "  fahreza   arkha bima " })).toBe(true);
    });

    it("does not exclude the same name in a different kelas", () => {
      expect(isExcluded({ kelas: "A2", namaLengkap: "Fahreza Arkha Bima" })).toBe(false);
    });

    it("does not exclude an unrelated student", () => {
      expect(isExcluded({ kelas: "A1", namaLengkap: "Abizard Nabil Muttaqi" })).toBe(false);
    });
  });

  describe("isWithdrawn", () => {
    it("marks Muhammad Ghaisan Keenandra Ramadhika (B1) withdrawn", () => {
      expect(isWithdrawn({ kelas: "B1", namaLengkap: "Muhammad Ghaisan Keenandra Ramadhika" })).toBe(true);
    });

    it("marks the TD1 manual record withdrawn", () => {
      expect(isWithdrawn(TD1_MANUAL_RECORD)).toBe(true);
    });

    it("does not mark an unrelated student withdrawn", () => {
      expect(isWithdrawn({ kelas: "B1", namaLengkap: "Abizard Nabil Muttaqi" })).toBe(false);
    });
  });

  describe("noGuardianOk", () => {
    it("only allows the TD1 manual record through with zero guardians", () => {
      expect(noGuardianOk(TD1_MANUAL_RECORD)).toBe(true);
      expect(noGuardianOk({ kelas: "B1", namaLengkap: "Muhammad Ghaisan Keenandra Ramadhika" })).toBe(false);
      expect(noGuardianOk({ kelas: "A1", namaLengkap: "Some Other Kid" })).toBe(false);
    });
  });

  describe("TD1_MANUAL_RECORD", () => {
    it("carries only name/nis/gender, no guardians or address", () => {
      expect(TD1_MANUAL_RECORD.kelas).toBe("TD1");
      expect(TD1_MANUAL_RECORD.nis).toBe("252632629");
      expect(TD1_MANUAL_RECORD.gender).toBe("L");
      expect(TD1_MANUAL_RECORD.ayah.nama).toBeNull();
      expect(TD1_MANUAL_RECORD.ibu.nama).toBeNull();
      expect(TD1_MANUAL_RECORD.alamat).toBeNull();
      expect(TD1_MANUAL_RECORD.birthDateRaw).toBeNull();
    });
  });
});
