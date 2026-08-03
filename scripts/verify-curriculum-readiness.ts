/**
 * verify-curriculum-readiness.ts — go/no-go gate for a curriculum content load.
 *
 * Usage:
 *   npx tsx scripts/verify-curriculum-readiness.ts --tenant <tenantId> [--academic-year <id>]
 *
 * Read-only. Exits 0 when every check passes, 1 when any fails, so it can
 * gate a runbook step or CI. Omit --academic-year to use the tenant's
 * ACTIVE year.
 *
 * The checks correspond to the ways the penilaian flow degrades silently
 * rather than erroring — see `lib/curriculum/readiness.ts` for why each
 * one exists.
 */

import { prisma } from "../lib/db";
import {
  checkThemes,
  checkWeekCoverage,
  checkHomerooms,
  checkLinkedIndicators,
  checkHolidays,
  allPassed,
  type CheckResult,
  type AgeGroupName,
  type CurriculumElementName,
  type LinkedIndicatorInput,
} from "../lib/curriculum/readiness";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): { tenantId: string; academicYearId?: string } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tenantId = get("--tenant");
  if (!tenantId) {
    console.error(
      "usage: npx tsx scripts/verify-curriculum-readiness.ts --tenant <id> [--academic-year <id>]",
    );
    process.exit(2);
  }
  return { tenantId, academicYearId: get("--academic-year") };
}

async function main(): Promise<void> {
  const { tenantId, academicYearId } = parseArgs(process.argv.slice(2));

  const academicYear = await prisma.academicYear.findFirst({
    where: academicYearId
      ? { id: academicYearId, tenantId }
      : { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!academicYear) {
    console.error(
      academicYearId
        ? `✗ Tahun ajaran ${academicYearId} tidak ditemukan untuk tenant ${tenantId}.`
        : `✗ Tenant ${tenantId} tidak punya tahun ajaran ACTIVE.`,
    );
    process.exit(1);
  }

  // AcademicYear stores YYYY-MM-DD as String (unlike Semester/Week, which
  // use UTC-midnight DateTime) — no conversion needed here.
  const yearStart = academicYear.startDate;
  const yearEnd = academicYear.endDate;
  console.log(`Tahun ajaran: ${academicYear.name} (${yearStart} → ${yearEnd})\n`);

  const semesterRows = await prisma.semester.findMany({
    where: { tenantId, academicYearId: academicYear.id, status: "ACTIVE" },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      _count: { select: { themes: true } },
    },
    orderBy: { number: "asc" },
  });
  const semesters = semesterRows.map((s) => ({
    id: s.id,
    number: s.number,
    startDate: ymd(s.startDate),
    endDate: ymd(s.endDate),
    themeCount: s._count.themes,
  }));

  const weekRows = await prisma.week.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      subTheme: {
        theme: { semesterId: { in: semesters.map((s) => s.id) } },
      },
    },
    select: {
      number: true,
      startDate: true,
      endDate: true,
      subTheme: { select: { theme: { select: { semesterId: true } } } },
    },
  });
  const weeks = weekRows.map((w) => ({
    number: w.number,
    startDate: ymd(w.startDate),
    endDate: ymd(w.endDate),
    semesterId: w.subTheme.theme.semesterId,
  }));

  const sectionRows = await prisma.classSection.findMany({
    where: { tenantId, academicYearId: academicYear.id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      _count: { select: { teachingAssignments: { where: { role: "HOMEROOM" } } } },
    },
    orderBy: { name: "asc" },
  });
  const sections = sectionRows.map((s) => ({
    id: s.id,
    name: s.name,
    homeroomCount: s._count.teachingAssignments,
  }));

  // Indicators that carry at least one theme link, grouped by the parent
  // objective's (ageGroup, element). This is exactly what the walas
  // weekly picker filters on.
  const linkedRows = await prisma.achievementIndicator.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      themeLinks: { some: {} },
      objective: {
        semesterId: { in: semesters.map((s) => s.id) },
        status: "ACTIVE",
      },
    },
    select: { objective: { select: { ageGroup: true, element: true } } },
  });
  const linkedIndicators: LinkedIndicatorInput[] = linkedRows.map((r) => ({
    ageGroup: r.objective.ageGroup as AgeGroupName,
    element: r.objective.element as CurriculumElementName,
    linkedCount: 1,
  }));

  const holidayRows = await prisma.holiday.findMany({
    where: { tenantId },
    select: { date: true },
  });

  const results: CheckResult[] = [
    checkThemes(semesters),
    ...semesters.map((s) => checkWeekCoverage(s, weeks)),
    checkHomerooms(sections),
    checkLinkedIndicators(linkedIndicators),
    checkHolidays(
      holidayRows.map((h) => h.date),
      yearStart,
      yearEnd,
    ),
  ];

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const mark = r.status === "PASS" ? "✓" : "✗";
    console.log(`${mark} ${r.name.padEnd(width)}  ${r.detail}`);
  }

  if (!allPassed(results)) {
    const failed = results.filter((r) => r.status === "FAIL").length;
    console.error(`\n✗ ${failed} dari ${results.length} pemeriksaan gagal.`);
    process.exit(1);
  }
  console.log(`\n✓ Semua ${results.length} pemeriksaan lulus — siap dipakai walas.`);
}

main()
  .catch((err) => {
    console.error("✗ Gagal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
