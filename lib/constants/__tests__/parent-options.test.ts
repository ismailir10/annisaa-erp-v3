import { describe, it, expect } from "vitest";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  RELATIONSHIP_OPTIONS,
  LIVING_WITH_OPTIONS,
  REL_LABELS,
  LIVING_WITH_LABELS,
} from "../parent-options";

/**
 * These tests pin the SUPERSET observed across the four touch points that
 * read/write Parent / StudentGuardian / Admission demographic fields:
 *
 *   - app/admin/admissions/page.tsx
 *   - app/admin/guardians/page.tsx
 *   - app/admin/guardians/[id]/page.tsx
 *   - app/admin/students/[id]/page.tsx
 *
 * Narrowing any of these arrays would render the Select blank for existing
 * DB rows that hold the legacy value — the test exists so a future PR cannot
 * silently drop a value without a backfill migration.
 */

function values(arr: ReadonlyArray<{ value: string }>): string[] {
  return arr.map((o) => o.value);
}

describe("EDUCATION_OPTIONS", () => {
  const v = values(EDUCATION_OPTIONS);
  it.each(["SMA", "D1-D3", "S1", "S2", "S3", "Profesi"])(
    "contains legacy value %s",
    (legacy) => {
      expect(v).toContain(legacy);
    },
  );
});

describe("OCCUPATION_OPTIONS", () => {
  const v = values(OCCUPATION_OPTIONS);
  it.each([
    // guardians-list set
    "PNS",
    "TNI/Polri",
    "Guru/Dosen",
    "Dokter",
    "Petani",
    "Nelayan",
    "Buruh",
    // admissions / student-detail set
    "ASN",
    "Guru",
    "BUMN",
    "Freelance",
    // shared across all surfaces
    "Karyawan Swasta",
    "Wiraswasta",
    "Ibu Rumah Tangga",
    "Lainnya",
  ])("contains legacy value %s", (legacy) => {
    expect(v).toContain(legacy);
  });
});

describe("INCOME_OPTIONS", () => {
  const v = values(INCOME_OPTIONS);
  it.each([
    // "Rp" label family (admissions + student-detail)
    "< Rp 1 Juta",
    "Rp 1-2 Juta",
    "Rp 3-5 Juta",
    "Rp 5-10 Juta",
    "Rp 7-10 Juta",
    "> Rp 10 Juta",
    // "jt" short-form family (guardians-list)
    "<2jt",
    "2-5jt",
    "5-10jt",
    "10-20jt",
    ">20jt",
  ])("contains legacy value %s", (legacy) => {
    expect(v).toContain(legacy);
  });

  it("preserves BOTH label families — narrowing breaks legacy rows", () => {
    const hasRpFamily = v.some((x) => x.startsWith("Rp") || x.startsWith("< Rp") || x.startsWith("> Rp"));
    const hasJtFamily = v.some((x) => x.endsWith("jt"));
    expect(hasRpFamily).toBe(true);
    expect(hasJtFamily).toBe(true);
  });
});

describe("RELATIONSHIP_OPTIONS", () => {
  const v = values(RELATIONSHIP_OPTIONS);
  it.each(["AYAH", "IBU", "WALI", "OTHER", "PARENT"])(
    "contains legacy value %s",
    (legacy) => {
      expect(v).toContain(legacy);
    },
  );

  it("REL_LABELS lookup mirrors the option list", () => {
    for (const o of RELATIONSHIP_OPTIONS) {
      expect(REL_LABELS[o.value]).toBe(o.label);
    }
  });
});

describe("LIVING_WITH_OPTIONS", () => {
  const v = values(LIVING_WITH_OPTIONS);
  it.each(["ORANG_TUA", "WALI", "LAINNYA"])(
    "contains legacy value %s",
    (legacy) => {
      expect(v).toContain(legacy);
    },
  );

  it("LIVING_WITH_LABELS lookup mirrors the option list", () => {
    for (const o of LIVING_WITH_OPTIONS) {
      expect(LIVING_WITH_LABELS[o.value]).toBe(o.label);
    }
  });
});

describe("no duplicate values within a category", () => {
  it.each([
    ["EDUCATION_OPTIONS", EDUCATION_OPTIONS],
    ["OCCUPATION_OPTIONS", OCCUPATION_OPTIONS],
    ["INCOME_OPTIONS", INCOME_OPTIONS],
    ["RELATIONSHIP_OPTIONS", RELATIONSHIP_OPTIONS],
    ["LIVING_WITH_OPTIONS", LIVING_WITH_OPTIONS],
  ])("%s has unique values", (_name, arr) => {
    const v = values(arr);
    expect(new Set(v).size).toBe(v.length);
  });
});
