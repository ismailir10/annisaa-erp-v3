import type { PrismaClient } from "../../lib/generated/prisma/client";
import { holidays } from "../../prisma/data/holidays";
import { createRng } from "./rng";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, EmployeePlan, StudentPlan } from "./people";

export type SeedExtrasResult = {
  orgConfig: 1;
  holidayCount: number;
  leaveRequestCount: number;
  admissionCount: number;
  parentNoteCount: number;
};

const ADMISSION_NAMES = [
  ["Aisyah Calon", "Bapak Hadi"],
  ["Faiz Pratama", "Ibu Sari"],
  ["Muhammad Daffa", "Ibu Rina"],
  ["Khadijah Naila", "Bapak Yanto"],
  ["Yusuf Rayyan", "Bapak Eko"],
  ["Salma Mutia", "Ibu Indah"],
  ["Ali Hamzah", "Bapak Joko"],
  ["Fatimah Zahra", "Ibu Lina"],
  ["Bilqis Humaira", "Ibu Wulan"],
  ["Hasan Tariq", "Bapak Bayu"],
  ["Maryam Safiya", "Ibu Desi"],
  ["Zaid Ubaid", "Bapak Slamet"],
  ["Anisa Putri", "Ibu Ratna"],
  ["Farah Yasmin", "Ibu Endang"],
  ["Rasyid Aqil", "Bapak Mulyadi"],
];

const ADMISSION_STATUSES = [
  "INQUIRY",
  "VISIT_SCHEDULED",
  "VISITED",
  "ADMITTED",
  "REGISTERED",
  "CANCELLED",
] as const;

export async function seedExtras(
  prisma: PrismaClient,
  org: SeedOrgResult,
  people: SeedPeopleResult,
  studentPlan: StudentPlan[],
  employeePlan: EmployeePlan[],
  opts: { seed?: number } = {},
): Promise<SeedExtrasResult> {
  const rng = createRng(opts.seed ?? 96);

  // ── OrgConfig.
  await prisma.orgConfig.upsert({
    where: { tenantId: org.tenantId },
    update: {},
    create: {
      tenantId: org.tenantId,
      workingDays: "MON,TUE,WED,THU,FRI",
      workStartTime: "07:00",
      workEndTime: "16:00",
      gracePeriodMinutes: 15,
      timezone: "Asia/Jakarta",
      payrollPeriodStartDay: 21,
      payrollPeriodEndDay: 20,
    },
  });

  // ── Holidays from prisma/data/holidays.ts.
  const holidayResult = await prisma.holiday.createMany({
    data: holidays.map((h) => ({
      tenantId: org.tenantId,
      date: h.date,
      name: h.name,
      type: h.type,
    })),
    skipDuplicates: true,
  });

  // ── LeaveRequest: 2-3 per teacher across 2024-07 → 2026-04.
  const teacherEmployees = employeePlan.filter((e) => e.isTeacher);
  const leaveRows: Array<{
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    status: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
  }> = [];
  const supervisorUserId =
    people.userIdByPreservedEmail["ismailir10@gmail.com"];

  for (const e of teacherEmployees) {
    const employeeId = people.employeeIdByKode[e.kode];
    if (!employeeId) continue;
    const count = rng.int(2, 3);
    for (let i = 0; i < count; i++) {
      const year = rng.int(2024, 2026);
      const month = rng.int(year === 2024 ? 8 : 1, year === 2026 ? 4 : 12);
      const day = rng.int(1, 25);
      const start = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const lengthDays = rng.int(1, 3);
      const endDateObj = new Date(`${start}T00:00:00Z`);
      endDateObj.setUTCDate(endDateObj.getUTCDate() + lengthDays - 1);
      const end = endDateObj.toISOString().slice(0, 10);
      const types = ["SICK", "PERMISSION", "ANNUAL"] as const;
      const reasons = [
        "Tidak enak badan",
        "Acara keluarga",
        "Periksa ke dokter",
        "Mengantar anak ke RS",
        "Urusan administrasi",
      ];
      const status = rng.bool(0.85) ? "APPROVED" : "PENDING";
      leaveRows.push({
        employeeId,
        leaveType: rng.pick(types),
        startDate: start,
        endDate: end,
        days: lengthDays,
        reason: rng.pick(reasons),
        status,
        reviewedBy: status === "APPROVED" ? supervisorUserId ?? null : null,
        reviewedAt:
          status === "APPROVED"
            ? new Date(`${start}T00:00:00Z`)
            : null,
      });
    }
  }
  const leaveResult = await prisma.leaveRequest.createMany({
    data: leaveRows,
    skipDuplicates: true,
  });

  // ── Admissions for 2026/27 mixed statuses.
  const admissionRows = ADMISSION_NAMES.map((pair, i) => {
    const status = ADMISSION_STATUSES[i % ADMISSION_STATUSES.length];
    const programs = ["DCARE", "KB", "TKIT-A", "TKIT-B"] as const;
    const programCode = rng.pick(programs);
    return {
      tenantId: org.tenantId,
      childName: pair[0],
      childAge: `${rng.int(3, 6)} tahun`,
      childGender: rng.bool(0.5) ? "L" : "P",
      parentName: pair[1],
      parentPhone: `+62812${String(rng.int(10000000, 99999999))}`,
      parentEmail: `prospect-${i}@example.test`,
      programId: org.programIdByCode[programCode],
      source: rng.pick(["WHATSAPP", "WALK_IN", "WEBSITE", "REFERRAL"] as const),
      status,
    };
  });
  const admissionResult = await prisma.admission.createMany({
    data: admissionRows,
    skipDuplicates: true,
  });

  // ── StudentJournalNote: 50 parent home-notes from last 30 days.
  const activeStudents = studentPlan.filter((s) => s.status === "ACTIVE");
  const guardianUserId =
    people.userIdByPreservedEmail["rightjet.hq@gmail.com"];
  const today = new Date();
  const noteRows: Array<{
    tenantId: string;
    studentId: string;
    date: string;
    authorUserId: string;
    authorRole: string;
    body: string;
  }> = [];
  const noteBodies = [
    "Anak makan malam dengan lahap, tidur jam 8.",
    "Sudah hafalan surat An-Naas.",
    "Bantu ibu siapkan meja makan.",
    "Cerita seru tentang kegiatan di sekolah hari ini.",
    "Sedikit batuk, sudah minum madu.",
    "Anak senang sekali dapat bintang dari Bu Guru.",
    "Sholat berjamaah Maghrib dan Isya.",
    "Latihan menulis huruf hijaiyah.",
  ];
  if (guardianUserId) {
    for (let i = 0; i < 50; i++) {
      const s = rng.pick(activeStudents);
      const daysAgo = rng.int(0, 29);
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      noteRows.push({
        tenantId: org.tenantId,
        studentId: people.studentIdByIndex[s.index],
        date: d.toISOString().slice(0, 10),
        authorUserId: guardianUserId,
        authorRole: "GUARDIAN",
        body: rng.pick(noteBodies),
      });
    }
  }
  const noteResult = await prisma.studentJournalNote.createMany({
    data: noteRows,
    skipDuplicates: true,
  });

  return {
    orgConfig: 1,
    holidayCount: holidayResult.count,
    leaveRequestCount: leaveResult.count,
    admissionCount: admissionResult.count,
    parentNoteCount: noteResult.count,
  };
}
