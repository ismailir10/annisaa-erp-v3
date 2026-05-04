// Seed 04 — Academic Year TA 2026/2027 + 4 AcademicTerms.
// Indonesian school calendar: SEM1 ~Jul-Dec, SEM2 ~Jan-Jun. Each semester split
// into two tengah-wulan (TW) marking periods. raportDueAt = 1 week before term end.
// Source: foundation spec §6.2 (seed list) + §18.1 (cycle scope).
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const ACADEMIC_YEAR = {
  name: "TA 2026/2027",
  startDate: new Date("2026-07-13"),
  endDate: new Date("2027-06-26"),
};

// Code @db.VarChar(20) — keep codes ≤ 20 chars.
export const ACADEMIC_TERMS = [
  {
    code: "TW1_SEM1",
    name: "Tengah Wulan 1 — Semester 1",
    startDate: new Date("2026-07-13"),
    endDate: new Date("2026-09-25"),
    raportDueAt: new Date("2026-09-18"),
  },
  {
    code: "TW2_SEM1",
    name: "Tengah Wulan 2 — Semester 1",
    startDate: new Date("2026-09-28"),
    endDate: new Date("2026-12-18"),
    raportDueAt: new Date("2026-12-11"),
  },
  {
    code: "TW1_SEM2",
    name: "Tengah Wulan 1 — Semester 2",
    startDate: new Date("2027-01-05"),
    endDate: new Date("2027-03-26"),
    raportDueAt: new Date("2027-03-19"),
  },
  {
    code: "TW2_SEM2",
    name: "Tengah Wulan 2 — Semester 2",
    startDate: new Date("2027-03-29"),
    endDate: new Date("2027-06-26"),
    raportDueAt: new Date("2027-06-19"),
  },
] as const;

export async function seedAcademicYear(prisma: PrismaClient, tenantId: string): Promise<void> {
  const year = await prisma.academicYear.upsert({
    where: { tenantId_name: { tenantId, name: ACADEMIC_YEAR.name } },
    update: {
      startDate: ACADEMIC_YEAR.startDate,
      endDate: ACADEMIC_YEAR.endDate,
      isCurrent: true,
    },
    create: {
      tenantId,
      name: ACADEMIC_YEAR.name,
      startDate: ACADEMIC_YEAR.startDate,
      endDate: ACADEMIC_YEAR.endDate,
      isCurrent: true,
    },
  });
  console.log(`  ✓ AcademicYear ${year.name}`);

  for (const t of ACADEMIC_TERMS) {
    await prisma.academicTerm.upsert({
      where: {
        tenantId_academicYearId_code: {
          tenantId,
          academicYearId: year.id,
          code: t.code,
        },
      },
      update: {
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        raportDueAt: t.raportDueAt,
      },
      create: {
        tenantId,
        academicYearId: year.id,
        code: t.code,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        raportDueAt: t.raportDueAt,
        isActive: t.code === "TW1_SEM1",
      },
    });
    console.log(`  ✓ AcademicTerm ${t.code}`);
  }
}
