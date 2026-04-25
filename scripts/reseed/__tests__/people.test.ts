import { describe, it, expect } from "vitest";
import { createRng } from "../rng";
import { planStudents, planParents, planEmployees, SEED_COUNTS } from "../people";
import { buildClassSectionPlan, sectionKey } from "../org";

const today = new Date("2026-04-25T00:00:00Z");

describe("planStudents", () => {
  const rng = createRng(42);
  const plan = planStudents({
    rng,
    activeCount: SEED_COUNTS.activeStudents,
    graduatedCount: SEED_COUNTS.graduatedStudents,
    today,
  });

  it("produces 180 active + 20 graduated = 200 total", () => {
    expect(plan).toHaveLength(200);
    expect(plan.filter((s) => s.status === "ACTIVE")).toHaveLength(180);
    expect(plan.filter((s) => s.status === "GRADUATED")).toHaveLength(20);
  });

  it("fixes preserved children at indexes 0 and 1 with correct names", () => {
    expect(plan[0].name).toBe("Bilal Hakim");
    expect(plan[0].preservedGuardianEmail).toBe("rightjet.hq@gmail.com");
    expect(plan[1].name).toBe("Ahmad Faris Abdullah");
    expect(plan[1].preservedGuardianEmail).toBe("commandprompt.adhan@gmail.com");
  });

  it("never assigns DCARE to Metland (allow-list honored)", () => {
    const metlandDcare = plan.filter(
      (s) => s.campusCode === "METLAND" && s.programCode === "DCARE",
    );
    expect(metlandDcare).toHaveLength(0);
  });

  it("graduated cohort is all TKIT-B", () => {
    const grads = plan.filter((s) => s.status === "GRADUATED");
    expect(grads.every((s) => s.programCode === "TKIT-B")).toBe(true);
  });

  it("every student resolves to a valid 2024/25 class-section key", () => {
    const sectionKeys = new Set(
      buildClassSectionPlan().map((p) => sectionKey(p)),
    );
    for (const s of plan) {
      // Replicate the writer's rollback logic.
      const order: Array<typeof s.programCode> = ["DCARE", "KB", "TKIT-A", "TKIT-B"];
      const y24Program: typeof s.programCode =
        s.status === "GRADUATED"
          ? "TKIT-B"
          : (order[Math.max(0, order.indexOf(s.programCode) - 1)] ?? "DCARE");
      const y24Campus =
        s.campusCode === "METLAND" && y24Program === "DCARE"
          ? "TAMAN_ASTER"
          : s.campusCode;
      const key = sectionKey({
        academicYearName: "2024/2025",
        campusCode: y24Campus,
        programCode: y24Program,
        sectionName: "",
        capacity: 0,
      });
      expect(sectionKeys.has(key)).toBe(true);
    }
  });

  it("every active student resolves to a valid 2025/26 class-section key", () => {
    const sectionKeys = new Set(
      buildClassSectionPlan().map((p) => sectionKey(p)),
    );
    for (const s of plan.filter((x) => x.status === "ACTIVE")) {
      const key = sectionKey({
        academicYearName: "2025/2026",
        campusCode: s.campusCode,
        programCode: s.programCode,
        sectionName: "",
        capacity: 0,
      });
      expect(sectionKeys.has(key)).toBe(true);
    }
  });

  it("is reproducible under the same seed", () => {
    const plan2 = planStudents({
      rng: createRng(42),
      activeCount: SEED_COUNTS.activeStudents,
      graduatedCount: SEED_COUNTS.graduatedStudents,
      today,
    });
    expect(plan2.map((s) => s.name)).toEqual(plan.map((s) => s.name));
  });
});

describe("planParents", () => {
  const rng = createRng(42);
  const students = planStudents({
    rng,
    activeCount: 10,
    graduatedCount: 2,
    today,
  });
  const parents = planParents({ rng, students });

  it("creates one parent per student plus the two preserved guardians (total N)", () => {
    // 2 preserved + (students.length - 2) synthetic = students.length
    expect(parents).toHaveLength(students.length);
  });

  it("preserves rightjet.hq and commandprompt.adhan guardian metadata", () => {
    const nurul = parents.find((p) => p.email === "rightjet.hq@gmail.com");
    const rina = parents.find((p) => p.email === "commandprompt.adhan@gmail.com");
    expect(nurul?.displayName).toBe("Ibu Nurul");
    expect(nurul?.childIndexes).toEqual([0]);
    expect(rina?.displayName).toBe("Ibu Rina");
    expect(rina?.childIndexes).toEqual([1]);
  });
});

describe("planEmployees", () => {
  const rng = createRng(1);
  const plan = planEmployees({ rng });

  it("produces exactly 25 teachers + 3 support staff", () => {
    expect(plan).toHaveLength(28);
    expect(plan.filter((e) => e.isTeacher)).toHaveLength(25);
    expect(plan.filter((e) => !e.isTeacher)).toHaveLength(3);
  });

  it("preserves IR01 and WR03 teacher kode + email", () => {
    const ir = plan.find((e) => e.kode === "IR01");
    const wr = plan.find((e) => e.kode === "WR03");
    expect(ir?.email).toBe("ismail10rabbanii@gmail.com");
    expect(wr?.email).toBe("wirarajaism@gmail.com");
    expect(ir?.isTeacher).toBe(true);
    expect(wr?.isTeacher).toBe(true);
  });

  it("support-staff jabatan covers Admin Tata Usaha, Kasir, OB", () => {
    const supportJabatans = plan.filter((e) => !e.isTeacher).map((e) => e.jabatan);
    expect(supportJabatans.sort()).toEqual(["Admin Tata Usaha", "Kasir", "OB"].sort());
  });

  it("kode is unique", () => {
    const kodes = new Set(plan.map((e) => e.kode));
    expect(kodes.size).toBe(plan.length);
  });
});
