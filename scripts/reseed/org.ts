import type { PrismaClient } from "../../lib/generated/prisma/client";
import { salaryComponents } from "../../prisma/data/salary-components";

// ─── Data constants ────────────────────────────────────────────

export const TENANT = {
  id: "t_annisaa",
  name: "An Nisaa' Sekolahku",
  slug: "annisaa-sekolahku",
} as const;

export type ProgramCode = "DCARE" | "KB" | "TKIT-A" | "TKIT-B";

export const PROGRAMS: Array<{
  code: ProgramCode;
  name: string;
  description: string;
  type: "YEAR_ROUND" | "SEMESTER" | "SESSION";
  ageMin: number;
  ageMax: number;
}> = [
  {
    code: "DCARE",
    name: "D'Care (Day Care)",
    description: "Penitipan anak usia 6 bulan – 3 tahun dengan pola harian.",
    type: "YEAR_ROUND",
    ageMin: 6,
    ageMax: 36,
  },
  {
    code: "KB",
    name: "Kelompok Bermain",
    description: "Program pra-TK untuk usia 3–4 tahun.",
    type: "SEMESTER",
    ageMin: 36,
    ageMax: 48,
  },
  {
    code: "TKIT-A",
    name: "TK Islam Terpadu Kelas A",
    description: "Kelas A untuk usia 4–5 tahun.",
    type: "SEMESTER",
    ageMin: 48,
    ageMax: 60,
  },
  {
    code: "TKIT-B",
    name: "TK Islam Terpadu Kelas B",
    description: "Kelas B untuk usia 5–6 tahun (persiapan SD).",
    type: "SEMESTER",
    ageMin: 60,
    ageMax: 72,
  },
];

export type CampusCode = "TAMAN_ASTER" | "METLAND";

export const CAMPUSES: Array<{
  code: CampusCode;
  name: string;
  address: string;
  /** Which program codes this campus hosts. */
  programs: readonly ProgramCode[];
}> = [
  {
    code: "TAMAN_ASTER",
    name: "An Nisaa' Sekolahku Taman Aster",
    address:
      "Perumahan Taman Aster Blok A1/16 & A1/46, Telaga Asih, Cikarang Barat, Bekasi",
    programs: ["DCARE", "KB", "TKIT-A", "TKIT-B"] as const,
  },
  {
    code: "METLAND",
    name: "An Nisaa' Sekolahku Metland Cibitung",
    address:
      "Perumahan Metland Cibitung Blok P2/2-3, Telaga Murni, Cikarang Barat, Bekasi",
    programs: ["KB", "TKIT-A", "TKIT-B"] as const,
  },
];

export type AcademicYearKey = "2024/2025" | "2025/2026" | "2026/2027";

export const ACADEMIC_YEARS: Array<{
  name: AcademicYearKey;
  startDate: string;
  endDate: string;
  status: "PLANNING" | "ACTIVE" | "ARCHIVED";
}> = [
  {
    name: "2024/2025",
    startDate: "2024-07-15",
    endDate: "2025-06-20",
    status: "ARCHIVED",
  },
  {
    name: "2025/2026",
    startDate: "2025-07-14",
    endDate: "2026-06-19",
    status: "ACTIVE",
  },
  {
    name: "2026/2027",
    startDate: "2026-07-13",
    endDate: "2027-06-18",
    status: "PLANNING",
  },
];

export const FEE_COMPONENTS: Array<{
  code: string;
  label: string;
  category: "TUITION" | "MATERIAL" | "ACTIVITY";
}> = [
  { code: "spp", label: "SPP Bulanan", category: "TUITION" },
  { code: "uang_makan", label: "Uang Makan", category: "MATERIAL" },
  { code: "uang_kegiatan", label: "Uang Kegiatan", category: "ACTIVITY" },
];

/** Amounts in IDR — matches Assumption #9 in the cycle doc. */
export const FEE_SCHEDULE: Record<ProgramCode, Record<string, number>> = {
  DCARE: { spp: 1_200_000, uang_makan: 400_000, uang_kegiatan: 100_000 },
  KB: { spp: 550_000, uang_makan: 200_000, uang_kegiatan: 50_000 },
  "TKIT-A": { spp: 650_000, uang_makan: 250_000, uang_kegiatan: 75_000 },
  "TKIT-B": { spp: 700_000, uang_makan: 250_000, uang_kegiatan: 75_000 },
};

export const JOURNAL_INDICATORS: Array<{
  scope: "SCHOOL" | "HOME";
  category: string;
  label: string;
}> = [
  { scope: "SCHOOL", category: "Ibadah", label: "Mengikuti doa pembuka" },
  { scope: "SCHOOL", category: "Ibadah", label: "Mengikuti doa penutup" },
  { scope: "SCHOOL", category: "Ibadah", label: "Hafalan surat pendek" },
  { scope: "SCHOOL", category: "Akademik", label: "Menyelesaikan tugas hari ini" },
  { scope: "SCHOOL", category: "Sosial", label: "Berbagi dengan teman" },
  { scope: "SCHOOL", category: "Motorik", label: "Aktivitas motorik selesai" },
  { scope: "HOME", category: "Ibadah", label: "Shalat berjamaah bersama keluarga" },
  { scope: "HOME", category: "Ibadah", label: "Membaca Iqro/Al-Quran" },
  { scope: "HOME", category: "Karakter", label: "Membantu orang tua" },
  { scope: "HOME", category: "Kesehatan", label: "Tidur tepat waktu" },
];

// ─── Pure planners (testable without a DB) ─────────────────────

export type ClassSectionPlan = {
  campusCode: CampusCode;
  programCode: ProgramCode;
  academicYearName: AcademicYearKey;
  sectionName: string;
  capacity: number;
  ageGroup: "A" | "B";
};

/**
 * Cartesian product of (active+archived year) × campus × program,
 * gated by the campus.programs allow-list. Returns the ClassSection
 * rows we intend to create, in insertion order.
 */
export function buildClassSectionPlan(
  campuses: typeof CAMPUSES = CAMPUSES,
  years: typeof ACADEMIC_YEARS = ACADEMIC_YEARS,
): ClassSectionPlan[] {
  const plan: ClassSectionPlan[] = [];
  // Only create sections for years that run (ARCHIVED historical + ACTIVE current).
  const seedYears = years.filter((y) => y.status !== "PLANNING");

  for (const year of seedYears) {
    for (const campus of campuses) {
      for (const programCode of campus.programs) {
        plan.push({
          campusCode: campus.code,
          programCode,
          academicYearName: year.name,
          sectionName: `${programCode} — ${campus.code === "TAMAN_ASTER" ? "Aster" : "Metland"}`,
          capacity: programCode === "DCARE" ? 15 : 20,
          // Reseed plans default ageGroup to A; admin re-classifies per
          // class via the Kelompok Usia select once the cycle is live.
          ageGroup: "A",
        });
      }
    }
  }

  return plan;
}

export type FeeStructurePlan = {
  programCode: ProgramCode;
  academicYearName: AcademicYearKey;
  feeComponentCode: string;
  amount: number;
};

/**
 * ProgramFeeStructure rows: every program × every fee component ×
 * every running year (ARCHIVED + ACTIVE, skip PLANNING).
 */
export function buildFeeStructurePlan(
  programs: typeof PROGRAMS = PROGRAMS,
  years: typeof ACADEMIC_YEARS = ACADEMIC_YEARS,
  components: typeof FEE_COMPONENTS = FEE_COMPONENTS,
  schedule: typeof FEE_SCHEDULE = FEE_SCHEDULE,
): FeeStructurePlan[] {
  const plan: FeeStructurePlan[] = [];
  const seedYears = years.filter((y) => y.status !== "PLANNING");

  for (const program of programs) {
    for (const year of seedYears) {
      for (const comp of components) {
        plan.push({
          programCode: program.code,
          academicYearName: year.name,
          feeComponentCode: comp.code,
          amount: schedule[program.code][comp.code],
        });
      }
    }
  }

  return plan;
}

export type JournalIndicatorPlan = {
  scope: "SCHOOL" | "HOME";
  category: string;
  label: string;
  /** Zero-based order of the category across distinct (scope|category) pairs. */
  categoryOrder: number;
  /** Zero-based order of the indicator within its category. */
  indicatorOrder: number;
};

/**
 * Assign per-category indicator order (not flat global order).
 * Categories are ordered by first-appearance in the input list.
 */
export function planJournalIndicators(
  indicators: typeof JOURNAL_INDICATORS = JOURNAL_INDICATORS,
): JournalIndicatorPlan[] {
  const categoryOrder = new Map<string, number>();
  const indicatorOrder = new Map<string, number>();
  const plan: JournalIndicatorPlan[] = [];

  for (const ind of indicators) {
    const catKey = `${ind.scope}|${ind.category}`;
    if (!categoryOrder.has(catKey)) {
      categoryOrder.set(catKey, categoryOrder.size);
    }
    const indOrder = indicatorOrder.get(catKey) ?? 0;
    plan.push({
      scope: ind.scope,
      category: ind.category,
      label: ind.label,
      categoryOrder: categoryOrder.get(catKey)!,
      indicatorOrder: indOrder,
    });
    indicatorOrder.set(catKey, indOrder + 1);
  }

  return plan;
}

// ─── DB writer ─────────────────────────────────────────────────

export type SeedOrgResult = {
  tenantId: string;
  campusIdByCode: Record<CampusCode, string>;
  programIdByCode: Record<ProgramCode, string>;
  academicYearIdByName: Record<AcademicYearKey, string>;
  feeComponentIdByCode: Record<string, string>;
  salaryDefIdByCode: Record<string, string>;
  classSectionIdByKey: Record<string, string>;
  journalTemplateId: string;
  journalIndicatorIdByLabel: Record<string, string>;
  /** Indicator IDs grouped by scope, for downstream JournalEntry seeding. */
  journalIndicatorIdsByScope: Record<"SCHOOL" | "HOME", string[]>;
};

function sectionKey(p: ClassSectionPlan): string {
  return `${p.academicYearName}|${p.campusCode}|${p.programCode}`;
}

export async function seedOrg(prisma: PrismaClient): Promise<SeedOrgResult> {
  // Tenant.
  const tenant = await prisma.tenant.create({
    data: { id: TENANT.id, name: TENANT.name, slug: TENANT.slug },
  });

  // Campuses.
  const campusIdByCode = {} as Record<CampusCode, string>;
  for (const c of CAMPUSES) {
    const row = await prisma.campus.create({
      data: {
        tenantId: tenant.id,
        name: c.name,
        address: c.address,
      },
    });
    campusIdByCode[c.code] = row.id;
  }

  // Programs.
  const programIdByCode = {} as Record<ProgramCode, string>;
  for (const p of PROGRAMS) {
    const row = await prisma.program.create({
      data: {
        tenantId: tenant.id,
        code: p.code,
        name: p.name,
        description: p.description,
        type: p.type,
        ageMin: p.ageMin,
        ageMax: p.ageMax,
      },
    });
    programIdByCode[p.code] = row.id;
  }

  // Academic years.
  const academicYearIdByName = {} as Record<AcademicYearKey, string>;
  for (const y of ACADEMIC_YEARS) {
    const row = await prisma.academicYear.create({
      data: {
        tenantId: tenant.id,
        name: y.name,
        startDate: y.startDate,
        endDate: y.endDate,
        status: y.status,
      },
    });
    academicYearIdByName[y.name] = row.id;
  }

  // Fee component defs.
  const feeComponentIdByCode: Record<string, string> = {};
  for (const [idx, c] of FEE_COMPONENTS.entries()) {
    const row = await prisma.feeComponentDef.create({
      data: {
        tenantId: tenant.id,
        code: c.code,
        label: c.label,
        category: c.category,
        isRecurring: true,
        sortOrder: idx,
      },
    });
    feeComponentIdByCode[c.code] = row.id;
  }

  // Program fee structures.
  for (const f of buildFeeStructurePlan()) {
    await prisma.programFeeStructure.create({
      data: {
        tenantId: tenant.id,
        programId: programIdByCode[f.programCode],
        academicYearId: academicYearIdByName[f.academicYearName],
        feeComponentId: feeComponentIdByCode[f.feeComponentCode],
        amount: f.amount,
      },
    });
  }

  // Salary component defs (reuse existing data file).
  const salaryDefIdByCode: Record<string, string> = {};
  for (const s of salaryComponents) {
    const row = await prisma.salaryComponentDef.create({
      data: {
        tenantId: tenant.id,
        code: s.code,
        label: s.label,
        category: s.category,
        calcType: s.calcType,
        isProRated: s.isProRated,
        sortOrder: s.sortOrder,
      },
    });
    salaryDefIdByCode[s.code] = row.id;
  }

  // Class sections.
  const classSectionIdByKey: Record<string, string> = {};
  for (const plan of buildClassSectionPlan()) {
    const row = await prisma.classSection.create({
      data: {
        tenantId: tenant.id,
        programId: programIdByCode[plan.programCode],
        academicYearId: academicYearIdByName[plan.academicYearName],
        campusId: campusIdByCode[plan.campusCode],
        name: plan.sectionName,
        ageGroup: plan.ageGroup,
        capacity: plan.capacity,
      },
    });
    classSectionIdByKey[sectionKey(plan)] = row.id;
  }

  // Journal template + categories + indicators (tied to the ACTIVE year).
  const activeYearId = academicYearIdByName["2025/2026"];
  const template = await prisma.studentJournalTemplate.create({
    data: { tenantId: tenant.id, academicYearId: activeYearId },
  });

  const journalIndicatorIdByLabel: Record<string, string> = {};
  const journalIndicatorIdsByScope: Record<"SCHOOL" | "HOME", string[]> = {
    SCHOOL: [],
    HOME: [],
  };
  const categoryCache = new Map<string, string>();
  const categoryOrderCounter = new Map<string, number>();
  for (const ind of JOURNAL_INDICATORS) {
    const catKey = `${ind.scope}|${ind.category}`;
    let categoryId = categoryCache.get(catKey);
    if (!categoryId) {
      const cat = await prisma.studentJournalCategory.create({
        data: {
          templateId: template.id,
          scope: ind.scope,
          name: ind.category,
          order: categoryCache.size,
        },
      });
      categoryId = cat.id;
      categoryCache.set(catKey, categoryId);
    }
    const catOrder = categoryOrderCounter.get(catKey) ?? 0;
    const indRow = await prisma.studentJournalIndicator.create({
      data: {
        categoryId,
        label: ind.label,
        order: catOrder,
      },
    });
    categoryOrderCounter.set(catKey, catOrder + 1);
    journalIndicatorIdByLabel[ind.label] = indRow.id;
    journalIndicatorIdsByScope[ind.scope].push(indRow.id);
  }

  return {
    tenantId: tenant.id,
    campusIdByCode,
    programIdByCode,
    academicYearIdByName,
    feeComponentIdByCode,
    salaryDefIdByCode,
    classSectionIdByKey,
    journalTemplateId: template.id,
    journalIndicatorIdByLabel,
    journalIndicatorIdsByScope,
  };
}

export { sectionKey };
