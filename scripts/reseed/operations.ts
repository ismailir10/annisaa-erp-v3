import type { PrismaClient } from "../../lib/generated/prisma/client";
import { holidays } from "../../prisma/data/holidays";
import { createRng } from "./rng";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, StudentPlan, EmployeePlan } from "./people";
import { sectionKey } from "./org";

/** Iterate Mon–Fri dates between start..end (inclusive), excluding holidays. */
export function enumerateSchoolDays(opts: {
  start: string;
  end: string;
  holidayDates?: Set<string>;
}): string[] {
  const out: string[] = [];
  const holidaySet = opts.holidayDates ?? new Set();
  const cur = new Date(`${opts.start}T00:00:00Z`);
  const endDate = new Date(`${opts.end}T00:00:00Z`);
  while (cur <= endDate) {
    const dow = cur.getUTCDay();
    const dateStr = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) {
      out.push(dateStr);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Filter dates by density rule: dates within `fullDensityWindowDays` of `today`
 * are kept in full; older dates are kept only on Mon/Wed/Fri.
 */
export function applyDensityRule(
  dates: string[],
  today: string,
  fullDensityWindowDays: number,
): string[] {
  const todayDate = new Date(`${today}T00:00:00Z`);
  const cutoff = new Date(todayDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - fullDensityWindowDays);

  return dates.filter((d) => {
    const date = new Date(`${d}T00:00:00Z`);
    if (date >= cutoff) return true;
    const dow = date.getUTCDay();
    return dow === 1 || dow === 3 || dow === 5; // Mon/Wed/Fri
  });
}

const HOLIDAY_DATES = new Set(holidays.map((h) => h.date));

// ─── Status pickers ─────────────────────────────────────────────

function pickStudentAttendanceStatus(
  rng: ReturnType<typeof createRng>,
): "PRESENT" | "SICK" | "PERMISSION" | "ABSENT" {
  const r = rng.next();
  if (r < 0.85) return "PRESENT";
  if (r < 0.90) return "SICK";
  if (r < 0.95) return "PERMISSION";
  return "ABSENT";
}

function pickEmployeeAttendanceStatus(
  rng: ReturnType<typeof createRng>,
): "PRESENT" | "LATE" | "ABSENT" | "LEAVE" {
  const r = rng.next();
  if (r < 0.80) return "PRESENT";
  if (r < 0.92) return "LATE";
  if (r < 0.97) return "ABSENT";
  return "LEAVE";
}

// ─── DB writer ──────────────────────────────────────────────────

export type SeedOperationsResult = {
  studentAttendanceCount: number;
  employeeAttendanceCount: number;
  journalEntryCount: number;
};

export async function seedOperations(
  prisma: PrismaClient,
  org: SeedOrgResult,
  people: SeedPeopleResult,
  studentPlan: StudentPlan[],
  employeePlan: EmployeePlan[],
  opts: { seed?: number; today?: string } = {},
): Promise<SeedOperationsResult> {
  const seed = opts.seed ?? 84;
  const today = opts.today ?? "2026-04-25";
  const rng = createRng(seed);

  // ── Student attendance for 2025/26 (current year).
  const y25Days = enumerateSchoolDays({
    start: "2025-07-14",
    end: today,
    holidayDates: HOLIDAY_DATES,
  });
  const y25Filtered = applyDensityRule(y25Days, today, 30);

  let studentAttendanceCount = 0;
  for (const s of studentPlan.filter((x) => x.status === "ACTIVE")) {
    const sectionId = org.classSectionIdByKey[
      sectionKey({
        academicYearName: "2025/2026",
        campusCode: s.campusCode,
        programCode: s.programCode,
        sectionName: "",
        capacity: 0,
      })
    ];
    if (!sectionId) {
      throw new Error(
        `seedOperations: missing 2025/26 section for student ${s.index}`,
      );
    }
    for (const date of y25Filtered) {
      await prisma.studentAttendance.create({
        data: {
          studentId: people.studentIdByIndex[s.index],
          classSectionId: sectionId,
          date,
          status: pickStudentAttendanceStatus(rng),
        },
      });
      studentAttendanceCount++;
    }
  }

  // ── Student attendance for 2024/25 graduated cohort (sampled).
  const y24Days = enumerateSchoolDays({
    start: "2024-07-15",
    end: "2025-06-20",
    holidayDates: HOLIDAY_DATES,
  });
  const y24Filtered = applyDensityRule(y24Days, "2025-06-20", 0); // sample only
  for (const s of studentPlan.filter((x) => x.status === "GRADUATED")) {
    const y24Campus =
      s.campusCode === "METLAND" ? s.campusCode : s.campusCode;
    const sectionId = org.classSectionIdByKey[
      sectionKey({
        academicYearName: "2024/2025",
        campusCode: y24Campus,
        programCode: "TKIT-B",
        sectionName: "",
        capacity: 0,
      })
    ];
    if (!sectionId) continue;
    for (const date of y24Filtered) {
      await prisma.studentAttendance.create({
        data: {
          studentId: people.studentIdByIndex[s.index],
          classSectionId: sectionId,
          date,
          status: pickStudentAttendanceStatus(rng),
        },
      });
      studentAttendanceCount++;
    }
  }

  // ── Employee AttendanceRecord 2024-07 → today (full density, school days).
  const empDays = enumerateSchoolDays({
    start: "2024-07-15",
    end: today,
    holidayDates: HOLIDAY_DATES,
  });

  let employeeAttendanceCount = 0;
  for (const e of employeePlan) {
    const hireDate = new Date(`${e.hireDate}T00:00:00Z`);
    for (const date of empDays) {
      if (new Date(`${date}T00:00:00Z`) < hireDate) continue;
      const status = pickEmployeeAttendanceStatus(rng);
      const minute = rng.int(0, status === "LATE" ? 44 : 13);
      const checkInTime =
        status === "ABSENT" || status === "LEAVE"
          ? null
          : new Date(
              `${date}T${status === "LATE" ? "07" : "07"}:${String(
                status === "LATE" ? minute : minute,
              ).padStart(2, "0")}:00+07:00`,
            );
      const checkOutTime =
        status === "ABSENT" || status === "LEAVE"
          ? null
          : new Date(`${date}T16:${String(rng.int(0, 30)).padStart(2, "0")}:00+07:00`);
      await prisma.attendanceRecord.create({
        data: {
          employeeId: people.employeeIdByKode[e.kode],
          date,
          status,
          checkInTime,
          checkOutTime,
        },
      });
      employeeAttendanceCount++;
    }
  }

  // ── Student journal entries — last 14 school days × ACTIVE students × 3 random indicators.
  const lastDays = y25Days.slice(-14);
  const indicatorIds = org.journalIndicatorIdsByScope.SCHOOL;
  if (indicatorIds.length === 0) {
    throw new Error("seedOperations: no SCHOOL-scope journal indicators seeded");
  }
  const recordedByUserId =
    people.userIdByPreservedEmail["ismail10rabbanii@gmail.com"] ??
    people.userIdByPreservedEmail["ismailir10@gmail.com"];
  if (!recordedByUserId) {
    throw new Error("seedOperations: no preserved teacher User to attribute journal entries");
  }

  let journalEntryCount = 0;
  for (const s of studentPlan.filter((x) => x.status === "ACTIVE")) {
    const sectionId = org.classSectionIdByKey[
      sectionKey({
        academicYearName: "2025/2026",
        campusCode: s.campusCode,
        programCode: s.programCode,
        sectionName: "",
        capacity: 0,
      })
    ];
    for (const date of lastDays) {
      // Pick 3 indicators (allow repeats — simpler than dedup).
      const picks = new Set<string>();
      while (picks.size < 3 && picks.size < indicatorIds.length) {
        picks.add(rng.pick(indicatorIds));
      }
      for (const indId of picks) {
        await prisma.studentJournalEntry.create({
          data: {
            tenantId: org.tenantId,
            studentId: people.studentIdByIndex[s.index],
            classSectionId: sectionId,
            indicatorId: indId,
            date,
            scope: "SCHOOL", // School-recorded indicators only for the seed.
            checked: rng.bool(0.7),
            recordedByUserId,
          },
        });
        journalEntryCount++;
      }
    }
  }

  return {
    studentAttendanceCount,
    employeeAttendanceCount,
    journalEntryCount,
  };
}
