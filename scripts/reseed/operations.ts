import type { PrismaClient } from "../../lib/generated/prisma/client";
import { holidays } from "../../prisma/data/holidays";
import { createRng } from "./rng";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, StudentPlan, EmployeePlan } from "./people";
import { sectionKey } from "./org";
import { OWNER_EMAIL } from "./users";

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
  // Default to *now* so re-runs after the cycle landing date keep extending
  // the attendance window. Tests always pass an explicit `today`.
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const rng = createRng(seed);

  // ── Student attendance for 2025/26 (current year).
  const y25Days = enumerateSchoolDays({
    start: "2025-07-14",
    end: today,
    holidayDates: HOLIDAY_DATES,
  });
  const y25Filtered = applyDensityRule(y25Days, today, 30);

  // ── Build all student attendance rows, then bulk-insert.
  const stuAttRows: Array<{
    studentId: string;
    classSectionId: string;
    date: string;
    status: string;
  }> = [];
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
    const sid = people.studentIdByIndex[s.index];
    const seen = new Set<string>();
    for (const date of y25Filtered) {
      if (seen.has(date)) continue; // defense-in-depth against dup dates
      seen.add(date);
      stuAttRows.push({
        studentId: sid,
        classSectionId: sectionId,
        date,
        status: pickStudentAttendanceStatus(rng),
      });
    }
  }

  // ── Student attendance for 2024/25 graduated cohort (sampled).
  const y24Days = enumerateSchoolDays({
    start: "2024-07-15",
    end: "2025-06-20",
    holidayDates: HOLIDAY_DATES,
  });
  const y24Filtered = applyDensityRule(y24Days, "2025-06-20", 0);
  for (const s of studentPlan.filter((x) => x.status === "GRADUATED")) {
    const sectionId = org.classSectionIdByKey[
      sectionKey({
        academicYearName: "2024/2025",
        campusCode: s.campusCode,
        programCode: "TKIT-B",
        sectionName: "",
        capacity: 0,
      })
    ];
    if (!sectionId) continue;
    const sid = people.studentIdByIndex[s.index];
    const seen = new Set<string>();
    for (const date of y24Filtered) {
      if (seen.has(date)) continue;
      seen.add(date);
      stuAttRows.push({
        studentId: sid,
        classSectionId: sectionId,
        date,
        status: pickStudentAttendanceStatus(rng),
      });
    }
  }
  let studentAttendanceCount = 0;
  for (let i = 0; i < stuAttRows.length; i += 1000) {
    const batch = stuAttRows.slice(i, i + 1000);
    const r = await prisma.studentAttendance.createMany({
      data: batch,
      skipDuplicates: true,
    });
    studentAttendanceCount += r.count;
  }

  // ── Employee AttendanceRecord 2024-07 → today (full density, school days).
  const empDays = enumerateSchoolDays({
    start: "2024-07-15",
    end: today,
    holidayDates: HOLIDAY_DATES,
  });

  const empAttRows: Array<{
    employeeId: string;
    date: string;
    status: string;
    checkInTime: Date | null;
    checkOutTime: Date | null;
  }> = [];
  for (const e of employeePlan) {
    const employeeId = people.employeeIdByKode[e.kode];
    if (!employeeId) continue;
    const hireDate = new Date(`${e.hireDate}T00:00:00Z`);
    const seen = new Set<string>();
    for (const date of empDays) {
      if (new Date(`${date}T00:00:00Z`) < hireDate) continue;
      if (seen.has(date)) continue;
      seen.add(date);
      const status = pickEmployeeAttendanceStatus(rng);
      const minute = rng.int(0, status === "LATE" ? 44 : 13);
      const checkInTime =
        status === "ABSENT" || status === "LEAVE"
          ? null
          : new Date(`${date}T07:${String(minute).padStart(2, "0")}:00+07:00`);
      const checkOutTime =
        status === "ABSENT" || status === "LEAVE"
          ? null
          : new Date(`${date}T16:${String(rng.int(0, 30)).padStart(2, "0")}:00+07:00`);
      empAttRows.push({ employeeId, date, status, checkInTime, checkOutTime });
    }
  }
  let employeeAttendanceCount = 0;
  for (let i = 0; i < empAttRows.length; i += 1000) {
    const batch = empAttRows.slice(i, i + 1000);
    const r = await prisma.attendanceRecord.createMany({
      data: batch,
      skipDuplicates: true,
    });
    employeeAttendanceCount += r.count;
  }

  // ── Student journal entries — last 14 school days × ACTIVE students × 3 random indicators.
  const lastDays = y25Days.slice(-14);
  const indicatorIds = org.journalIndicatorIdsByScope.SCHOOL;
  if (indicatorIds.length === 0) {
    throw new Error("seedOperations: no SCHOOL-scope journal indicators seeded");
  }
  const recordedByUserId =
    people.userIdByPreservedEmail["ismail10rabbanii@gmail.com"] ??
    people.userIdByPreservedEmail[OWNER_EMAIL];
  if (!recordedByUserId) {
    throw new Error("seedOperations: no preserved teacher User to attribute journal entries");
  }

  const journalRows: Array<{
    tenantId: string;
    studentId: string;
    classSectionId: string;
    indicatorId: string;
    date: string;
    scope: string;
    checked: boolean;
    recordedByUserId: string;
  }> = [];
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
      const picks = new Set<string>();
      while (picks.size < 3 && picks.size < indicatorIds.length) {
        picks.add(rng.pick(indicatorIds));
      }
      for (const indId of picks) {
        journalRows.push({
          tenantId: org.tenantId,
          studentId: people.studentIdByIndex[s.index],
          classSectionId: sectionId,
          indicatorId: indId,
          date,
          scope: "SCHOOL",
          checked: rng.bool(0.7),
          recordedByUserId,
        });
      }
    }
  }
  let journalEntryCount = 0;
  for (let i = 0; i < journalRows.length; i += 1000) {
    const batch = journalRows.slice(i, i + 1000);
    const r = await prisma.studentJournalEntry.createMany({
      data: batch,
      skipDuplicates: true,
    });
    journalEntryCount += r.count;
  }

  return {
    studentAttendanceCount,
    employeeAttendanceCount,
    journalEntryCount,
  };
}
