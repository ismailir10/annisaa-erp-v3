/**
 * import-curriculum-calendar.ts — load a semester's Theme / SubTheme /
 * Week calendar from CSV.
 *
 * Usage:
 *   npx tsx scripts/import-curriculum-calendar.ts \
 *     --tenant <tenantId> --semester <semesterId> --file <path.csv> [--commit]
 *
 * Dry-run by default: parses, validates, prints the write plan, exits 0
 * without touching the database. `--commit` writes inside one transaction.
 *
 * CSV format (frozen — see the 2026-07-31 cycle doc's input manifest):
 *
 *   theme_order,theme_name,subtheme_order,subtheme_name,week_number,start_date,end_date
 *
 * One row per pekan. Dates are Jakarta calendar days (YYYY-MM-DD), Monday
 * start / Friday end. `week_number` is contiguous 1..N across the whole
 * semester, not per theme.
 *
 * Idempotent: Theme matched on (semesterId, name), SubTheme on
 * (themeId, name), Week on (subThemeId, number). Re-running against an
 * already-loaded semester creates nothing and reports every row as
 * existing.
 *
 * Why a script and not an admin CRUD screen: this runs twice a year, the
 * school authors the calendar as a table anyway, and validating the whole
 * bracket set up-front is what stops a walas hitting "Belum ada Pekan
 * aktif" on a Tuesday with no idea why.
 */

import { readFileSync } from "node:fs";
import { prisma } from "../lib/db";
import {
  parseCalendarCsv,
  buildCalendarPlan,
  parseYmd,
  type CalendarPlan,
} from "../lib/curriculum/calendar-csv";

interface Args {
  tenantId: string;
  semesterId: string;
  file: string;
  commit: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tenantId = get("--tenant");
  const semesterId = get("--semester");
  const file = get("--file");
  const commit = argv.includes("--commit");
  if (!tenantId || !semesterId || !file) {
    console.error(
      "usage: npx tsx scripts/import-curriculum-calendar.ts --tenant <id> --semester <id> --file <path.csv> [--commit]",
    );
    process.exit(2);
  }
  return { tenantId, semesterId, file, commit };
}

function printPlan(plan: CalendarPlan): void {
  console.log(`\nRencana: ${plan.themes.length} tema, ${plan.weekCount} pekan`);
  for (const theme of plan.themes) {
    console.log(`  [${theme.order}] ${theme.name}`);
    for (const sub of theme.subThemes) {
      const weeks = sub.weeks
        .map((w) => `P${w.number} ${w.startDate}→${w.endDate}`)
        .join(", ");
      console.log(`      [${sub.order}] ${sub.name}: ${weeks}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const semester = await prisma.semester.findFirst({
    where: { id: args.semesterId, tenantId: args.tenantId },
    select: {
      id: true,
      number: true,
      status: true,
      startDate: true,
      endDate: true,
      academicYear: { select: { name: true } },
    },
  });
  if (!semester) {
    console.error(
      `✗ Semester ${args.semesterId} tidak ditemukan untuk tenant ${args.tenantId}.`,
    );
    process.exit(1);
  }
  if (semester.status !== "ACTIVE") {
    console.error(
      `✗ Semester ${args.semesterId} berstatus ${semester.status}, bukan ACTIVE.`,
    );
    process.exit(1);
  }
  console.log(
    `Semester: ${semester.academicYear.name} Semester ${semester.number} ` +
      `(${semester.startDate.toISOString().slice(0, 10)} → ${semester.endDate.toISOString().slice(0, 10)})`,
  );

  const text = readFileSync(args.file, "utf8");
  const { rows, issues: parseIssues } = parseCalendarCsv(text);
  const { plan, issues: planIssues } = buildCalendarPlan(rows, {
    semesterStart: semester.startDate.toISOString().slice(0, 10),
    semesterEnd: semester.endDate.toISOString().slice(0, 10),
  });
  const issues = [...parseIssues, ...planIssues];

  if (issues.length > 0) {
    console.error(`\n✗ ${issues.length} masalah ditemukan — tidak ada yang ditulis:`);
    for (const issue of issues) {
      console.error(
        `  ${issue.line !== null ? `baris ${issue.line}: ` : ""}${issue.message}`,
      );
    }
    process.exit(1);
  }

  printPlan(plan);

  if (!args.commit) {
    console.log("\nDry-run — tidak ada yang ditulis. Tambahkan --commit untuk menyimpan.");
    return;
  }

  let created = { themes: 0, subThemes: 0, weeks: 0 };
  let existing = { themes: 0, subThemes: 0, weeks: 0 };

  await prisma.$transaction(async (tx) => {
    for (const theme of plan.themes) {
      let themeRow = await tx.theme.findFirst({
        where: {
          tenantId: args.tenantId,
          semesterId: semester.id,
          name: theme.name,
        },
        select: { id: true },
      });
      if (themeRow) {
        existing.themes++;
      } else {
        themeRow = await tx.theme.create({
          data: {
            tenantId: args.tenantId,
            semesterId: semester.id,
            name: theme.name,
            order: theme.order,
          },
          select: { id: true },
        });
        created.themes++;
      }

      for (const sub of theme.subThemes) {
        let subRow = await tx.subTheme.findFirst({
          where: {
            tenantId: args.tenantId,
            themeId: themeRow.id,
            name: sub.name,
          },
          select: { id: true },
        });
        if (subRow) {
          existing.subThemes++;
        } else {
          subRow = await tx.subTheme.create({
            data: {
              tenantId: args.tenantId,
              themeId: themeRow.id,
              name: sub.name,
              order: sub.order,
            },
            select: { id: true },
          });
          created.subThemes++;
        }

        for (const week of sub.weeks) {
          const weekRow = await tx.week.findFirst({
            where: {
              tenantId: args.tenantId,
              subThemeId: subRow.id,
              number: week.number,
            },
            select: { id: true },
          });
          if (weekRow) {
            existing.weeks++;
            continue;
          }
          await tx.week.create({
            data: {
              tenantId: args.tenantId,
              subThemeId: subRow.id,
              number: week.number,
              startDate: parseYmd(week.startDate),
              endDate: parseYmd(week.endDate),
            },
          });
          created.weeks++;
        }
      }
    }
  });

  console.log(
    `\n✓ Tersimpan. Dibuat: ${created.themes} tema, ${created.subThemes} sub-tema, ${created.weeks} pekan. ` +
      `Sudah ada: ${existing.themes} tema, ${existing.subThemes} sub-tema, ${existing.weeks} pekan.`,
  );
}

main()
  .catch((err) => {
    console.error("✗ Gagal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
