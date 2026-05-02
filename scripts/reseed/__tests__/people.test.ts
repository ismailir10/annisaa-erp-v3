import { describe, it, expect } from "vitest";
import { createRng } from "../rng";
import {
  planStudents,
  planParents,
  planEmployees,
  uniqueName,
  SEED_COUNTS,
} from "../people";
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

describe("uniqueName helper", () => {
  it("returns unique name on first try when no collision", () => {
    const seen = new Set<string>();
    const r = uniqueName(seen, () => "Alice Smith");
    expect(r.name).toBe("Alice Smith");
    expect(r.collisions).toBe(0);
    expect(r.usedSuffix).toBe(false);
  });

  it("retries on collision and eventually returns the unique candidate", () => {
    const seen = new Set<string>(["Alice"]);
    let n = 0;
    const r = uniqueName(seen, () => (n++ < 1 ? "Alice" : "Bob"));
    expect(r.name).toBe("Bob");
    expect(r.collisions).toBe(1);
  });

  it("falls back to numeric suffix when generator can't produce a unique name", () => {
    const seen = new Set<string>(["Alice"]);
    const r = uniqueName(seen, () => "Alice", 2);
    expect(r.usedSuffix).toBe(true);
    expect(r.name).toBe("Alice 2");
    expect(seen.has("Alice 2")).toBe(true);
  });
});

describe("planStudents — full-field + dedup contract", () => {
  const plan = planStudents({
    rng: createRng(42),
    activeCount: SEED_COUNTS.activeStudents,
    graduatedCount: SEED_COUNTS.graduatedStudents,
    today,
  });

  it("every student has every required new field populated", () => {
    for (const s of plan) {
      expect(s.nis).toMatch(/^\d{4}\.\d{4}$/);
      expect(s.nisn).toMatch(/^\d{10}$/);
      expect(s.nik).toMatch(/^\d{16}$/);
      expect(s.kkNumber).toMatch(/^\d{16}$/);
      expect(s.birthPlace.length).toBeGreaterThan(0);
      expect(["ORANG_TUA", "WALI", "LAINNYA"]).toContain(s.livingWith);
      expect(s.address.length).toBeGreaterThan(0);
      // metadata is JSON-encoded
      const meta = JSON.parse(s.metadata);
      expect(meta.hobby).toBeDefined();
      expect(meta.bloodType).toBeDefined();
      expect(meta.allergies).toBeDefined();
    }
  });

  it("Student.name has no duplicates across the entire 200-row plan", () => {
    const names = plan.map((s) => s.name);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("preserved children remain at indexes 0,1 with their fixed names + DCARE-Aster gate intact", () => {
    expect(plan[0].name).toBe("Bilal Hakim");
    expect(plan[1].name).toBe("Ahmad Faris Abdullah");
    const metlandDcare = plan.filter(
      (s) => s.campusCode === "METLAND" && s.programCode === "DCARE",
    );
    expect(metlandDcare).toHaveLength(0);
  });
});

describe("planParents — full-field + dedup contract", () => {
  const rng = createRng(42);
  const students = planStudents({
    rng,
    activeCount: SEED_COUNTS.activeStudents,
    graduatedCount: SEED_COUNTS.graduatedStudents,
    today,
  });
  const parents = planParents({ rng, students });

  it("every parent has the new full-field set populated", () => {
    for (const p of parents) {
      expect(p.whatsapp.length).toBeGreaterThan(0);
      expect(p.address.length).toBeGreaterThan(0);
      expect(p.nik).toMatch(/^\d{16}$/);
      expect(p.employer.length).toBeGreaterThan(0);
      expect(p.employerCity.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(p.childrenTotal);
    }
  });

  it("displayName has no duplicates across the parent plan", () => {
    const names = parents.map((p) => p.displayName);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("preserved guardians (Ibu Nurul, Ibu Rina) are first + reserved", () => {
    expect(parents[0].displayName).toBe("Ibu Nurul");
    expect(parents[1].displayName).toBe("Ibu Rina");
  });
});

describe("planEmployees — full-field + dedup contract", () => {
  const plan = planEmployees({ rng: createRng(1) });

  it("every employee has formalName/noHp/bankAccountNo/bankName/bpjsEnrolled", () => {
    for (const e of plan) {
      expect(e.formalName.length).toBeGreaterThan(0);
      expect(e.noHp).toMatch(/^\+62\d+/);
      expect(e.bankAccountNo).toMatch(/^\d{10}$/);
      expect(e.bankName.length).toBeGreaterThan(0);
      expect(typeof e.bpjsEnrolled).toBe("boolean");
    }
  });

  it("nama is unique across all 28 employees", () => {
    const names = plan.map((e) => e.nama);
    const uniq = new Set(names);
    expect(uniq.size).toBe(names.length);
  });

  it("preserved teachers IR01/WR03 keep their fixed names + emails", () => {
    const ir = plan.find((e) => e.kode === "IR01");
    const wr = plan.find((e) => e.kode === "WR03");
    expect(ir?.nama).toBe("Ismail Rabbani");
    expect(wr?.nama).toBe("Wira Raja");
    expect(ir?.email).toBe("ismail10rabbanii@gmail.com");
    expect(wr?.email).toBe("wirarajaism@gmail.com");
  });
});
