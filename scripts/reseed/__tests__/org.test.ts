import { describe, it, expect } from "vitest";
import {
  CAMPUSES,
  PROGRAMS,
  ACADEMIC_YEARS,
  FEE_COMPONENTS,
  FEE_SCHEDULE,
  JOURNAL_INDICATORS,
  buildClassSectionPlan,
  buildFeeStructurePlan,
  planJournalIndicators,
  sectionKey,
} from "../org";

describe("org constants", () => {
  it("has exactly two campuses matching the school website", () => {
    expect(CAMPUSES).toHaveLength(2);
    const names = CAMPUSES.map((c) => c.name);
    expect(names).toContain("An Nisaa' Sekolahku Taman Aster");
    expect(names).toContain("An Nisaa' Sekolahku Metland Cibitung");
  });

  it("gates D'Care to Taman Aster only (no Metland DCARE per website)", () => {
    const aster = CAMPUSES.find((c) => c.code === "TAMAN_ASTER")!;
    const metland = CAMPUSES.find((c) => c.code === "METLAND")!;
    expect(aster.programs).toContain("DCARE");
    expect(metland.programs).not.toContain("DCARE");
    expect(metland.programs).toContain("KB");
    expect(metland.programs).toContain("TKIT-A");
    expect(metland.programs).toContain("TKIT-B");
  });

  it("has four programs", () => {
    expect(PROGRAMS.map((p) => p.code).sort()).toEqual(
      ["DCARE", "KB", "TKIT-A", "TKIT-B"].sort(),
    );
  });

  it("defines three academic years with correct status mix", () => {
    expect(ACADEMIC_YEARS).toHaveLength(3);
    const statuses = Object.fromEntries(
      ACADEMIC_YEARS.map((y) => [y.name, y.status]),
    );
    expect(statuses["2024/2025"]).toBe("ARCHIVED");
    expect(statuses["2025/2026"]).toBe("ACTIVE");
    expect(statuses["2026/2027"]).toBe("PLANNING");
  });

  it("uses Indonesian July→June calendar", () => {
    const current = ACADEMIC_YEARS.find((y) => y.name === "2025/2026")!;
    expect(current.startDate).toBe("2025-07-14");
    expect(current.endDate).toBe("2026-06-19");
  });

  it("has three fee components covering SPP, Makan, Kegiatan", () => {
    const codes = FEE_COMPONENTS.map((c) => c.code);
    expect(codes).toEqual(["spp", "uang_makan", "uang_kegiatan"]);
  });

  it("fee schedule totals match the cycle-doc table", () => {
    const total = (code: keyof typeof FEE_SCHEDULE) =>
      FEE_SCHEDULE[code].spp +
      FEE_SCHEDULE[code].uang_makan +
      FEE_SCHEDULE[code].uang_kegiatan;
    expect(total("DCARE")).toBe(1_700_000);
    expect(total("KB")).toBe(800_000);
    expect(total("TKIT-A")).toBe(975_000);
    expect(total("TKIT-B")).toBe(1_025_000);
  });

  it("journal library has both SCHOOL and HOME scope indicators", () => {
    const scopes = new Set(JOURNAL_INDICATORS.map((i) => i.scope));
    expect(scopes.has("SCHOOL")).toBe(true);
    expect(scopes.has("HOME")).toBe(true);
    expect(JOURNAL_INDICATORS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("buildClassSectionPlan", () => {
  it("produces 7 sections per running year and 14 total", () => {
    const plan = buildClassSectionPlan();
    expect(plan).toHaveLength(14);
    const byYear = new Map<string, number>();
    for (const p of plan) {
      byYear.set(p.academicYearName, (byYear.get(p.academicYearName) ?? 0) + 1);
    }
    expect(byYear.get("2024/2025")).toBe(7); // ARCHIVED but historical
    expect(byYear.get("2025/2026")).toBe(7); // ACTIVE
    expect(byYear.get("2026/2027")).toBeUndefined(); // PLANNING skipped
  });

  it("never creates a DCARE section at Metland", () => {
    const plan = buildClassSectionPlan();
    const metlandDcare = plan.filter(
      (p) => p.campusCode === "METLAND" && p.programCode === "DCARE",
    );
    expect(metlandDcare).toHaveLength(0);
  });

  it("assigns lower capacity to DCARE sections", () => {
    const plan = buildClassSectionPlan();
    const dcare = plan.filter((p) => p.programCode === "DCARE");
    expect(dcare.every((p) => p.capacity === 15)).toBe(true);
    const other = plan.filter((p) => p.programCode !== "DCARE");
    expect(other.every((p) => p.capacity === 20)).toBe(true);
  });

  it("sectionKey is unique per plan entry", () => {
    const plan = buildClassSectionPlan();
    const keys = new Set(plan.map((p) => sectionKey(p)));
    expect(keys.size).toBe(plan.length);
  });

  it("yields 7 distinct (campus, program) pairs — one ClassTrack each", () => {
    // seedOrg creates one ClassTrack per (campus, program) and links every
    // section to it. 4 Aster programs + 3 Metland programs = 7 tracks for 14
    // sections (one track shared across both running years).
    const plan = buildClassSectionPlan();
    const pairs = new Set(plan.map((p) => `${p.campusCode}|${p.programCode}`));
    expect(pairs.size).toBe(7);
  });
});

describe("planJournalIndicators", () => {
  it("resets indicator order within each category", () => {
    const plan = planJournalIndicators();
    // First HOME indicator gets indicatorOrder 0, not its flat position.
    const firstHome = plan.find((p) => p.scope === "HOME");
    expect(firstHome?.indicatorOrder).toBe(0);
    // First SCHOOL indicator also 0.
    const firstSchool = plan.find((p) => p.scope === "SCHOOL");
    expect(firstSchool?.indicatorOrder).toBe(0);
  });

  it("increments indicatorOrder within the same category", () => {
    const plan = planJournalIndicators();
    const ibadahSchool = plan.filter(
      (p) => p.scope === "SCHOOL" && p.category === "Ibadah",
    );
    expect(ibadahSchool.map((p) => p.indicatorOrder)).toEqual([0, 1, 2]);
  });

  it("assigns categoryOrder by first-appearance", () => {
    const plan = planJournalIndicators();
    const firstEntry = plan[0];
    expect(firstEntry.categoryOrder).toBe(0);
    // Distinct categories map to distinct category orders.
    const distinctCategories = new Set(
      plan.map((p) => `${p.scope}|${p.category}`),
    );
    const distinctCategoryOrders = new Set(plan.map((p) => p.categoryOrder));
    expect(distinctCategoryOrders.size).toBe(distinctCategories.size);
  });
});

describe("buildFeeStructurePlan", () => {
  it("produces 24 rows (4 programs × 3 components × 2 running years)", () => {
    const plan = buildFeeStructurePlan();
    expect(plan).toHaveLength(24);
  });

  it("amounts come from FEE_SCHEDULE", () => {
    const plan = buildFeeStructurePlan();
    const dcareSpp = plan.find(
      (f) =>
        f.programCode === "DCARE" &&
        f.feeComponentCode === "spp" &&
        f.academicYearName === "2025/2026",
    );
    expect(dcareSpp?.amount).toBe(1_200_000);
  });

  it("skips PLANNING year (2026/2027)", () => {
    const plan = buildFeeStructurePlan();
    const planning = plan.filter((f) => f.academicYearName === "2026/2027");
    expect(planning).toHaveLength(0);
  });

  it("covers every program for both running years", () => {
    const plan = buildFeeStructurePlan();
    const programsForY1 = new Set(
      plan.filter((f) => f.academicYearName === "2024/2025").map((f) => f.programCode),
    );
    const programsForY2 = new Set(
      plan.filter((f) => f.academicYearName === "2025/2026").map((f) => f.programCode),
    );
    expect(programsForY1.size).toBe(4);
    expect(programsForY2.size).toBe(4);
  });
});
