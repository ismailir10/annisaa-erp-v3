import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { students } from "../../../../prisma/data/students";

/**
 * POST /api/admin/seed
 * Seeds academic + student data on staging. Idempotent — skips if already seeded.
 * SCHOOL_ADMIN only, rate-limited.
 */
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`admin-seed:${getClientIp(req)}`, 1, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if already seeded
  const existingYear = await prisma.academicYear.findFirst({
    where: { tenantId: session.tenantId, name: "2025/2026" },
  });
  if (existingYear) {
    return NextResponse.json({ message: "Already seeded", skipped: true });
  }

  const tenantId = session.tenantId;

  // Get campuses
  const campuses = await prisma.campus.findMany({ where: { tenantId } });
  const campusByName: Record<string, string> = {};
  for (const c of campuses) campusByName[c.name] = c.id;
  const defaultCampusId = campuses[0]?.id;
  if (!defaultCampusId) return NextResponse.json({ error: "No campuses found" }, { status: 400 });

  // 1. Academic Year
  const academicYear = await prisma.academicYear.create({
    data: { tenantId, name: "2025/2026", startDate: "2025-07-14", endDate: "2026-06-20", status: "ACTIVE" },
  });

  // 2. Programs
  const programDefs = [
    { code: "DCARE", name: "Day Care", type: "YEAR_ROUND", ageMin: 24, ageMax: 36 },
    { code: "KB", name: "Kelompok Bermain", type: "SEMESTER", ageMin: 36, ageMax: 60 },
    { code: "TKIT", name: "TK Islam Terpadu", type: "SEMESTER", ageMin: 48, ageMax: 84 },
    { code: "POPUP", name: "Pop Up Class", type: "SESSION", ageMin: 36, ageMax: 72 },
  ];
  const programMap: Record<string, string> = {};
  for (const p of programDefs) {
    const created = await prisma.program.create({
      data: { tenantId, code: p.code, name: p.name, type: p.type, ageMin: p.ageMin, ageMax: p.ageMax },
    });
    programMap[p.code] = created.id;
  }

  // 3. Class Sections
  const asterCampusId = campusByName["Taman Aster"] ?? defaultCampusId;
  const metlandCampusId = campusByName["Metland Cibitung"] ?? defaultCampusId;

  const classDefs = [
    { name: "TKIT A", programCode: "TKIT", campusId: asterCampusId, capacity: 20, key: "TKIT_A" },
    { name: "TKIT B", programCode: "TKIT", campusId: asterCampusId, capacity: 20, key: "TKIT_B" },
    { name: "KB Aster", programCode: "KB", campusId: asterCampusId, capacity: 15, key: "KB_ASTER" },
    { name: "KB Metland", programCode: "KB", campusId: metlandCampusId, capacity: 15, key: "KB_METLAND" },
    { name: "D'Care Aster", programCode: "DCARE", campusId: asterCampusId, capacity: 10, key: "DCARE" },
    { name: "POPUP Weekend", programCode: "POPUP", campusId: asterCampusId, capacity: 25, key: "POPUP" },
  ];
  const classMap: Record<string, string> = {};
  for (const cs of classDefs) {
    const created = await prisma.classSection.create({
      data: { tenantId, programId: programMap[cs.programCode], academicYearId: academicYear.id, name: cs.name, capacity: cs.capacity, campusId: cs.campusId },
    });
    classMap[cs.key] = created.id;
  }

  // 4. Students (import seed data inline — simplified version)
  let studentCount = 0;
  for (const s of students) {
    const student = await prisma.student.create({
      data: {
        tenantId,
        name: s.name, nickname: s.nickname, dateOfBirth: s.dateOfBirth,
        gender: s.gender, address: s.address, status: "ACTIVE",
        enrollments: {
          create: { classSectionId: classMap[s.classCode], enrollDate: "2025-07-14", status: "ACTIVE" },
        },
      },
    });
    for (const g of s.guardians as { name: string; relationship: string; phone: string; whatsapp: string; isPrimary: boolean }[]) {
      const parent = await prisma.parent.create({
        data: { tenantId, name: g.name, phone: g.phone, whatsapp: g.whatsapp },
      });
      await prisma.studentGuardian.create({
        data: { studentId: student.id, parentId: parent.id, relationship: g.relationship, isPrimary: g.isPrimary },
      });
    }
    studentCount++;
  }

  // 5. Teaching Assignments
  const teacherEmails: Record<string, string> = {
    TKIT_A: "redacted-email@example.test",
    TKIT_B: "redacted-email@example.test",
    KB_ASTER: "redacted-email@example.test",
    KB_METLAND: "redacted-email@example.test",
    DCARE: "redacted-email@example.test",
    POPUP: "redacted-email@example.test",
  };
  let assignmentCount = 0;
  for (const [classKey, email] of Object.entries(teacherEmails)) {
    const user = await prisma.user.findFirst({ where: { email, tenantId } });
    if (user?.employeeId && classMap[classKey]) {
      await prisma.teachingAssignment.create({
        data: { employeeId: user.employeeId, classSectionId: classMap[classKey], role: "HOMEROOM" },
      });
      assignmentCount++;
    }
  }

  // 6. Student Attendance (last 5 school days)
  const allStudents = await prisma.student.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { enrollments: { where: { status: "ACTIVE" }, select: { classSectionId: true } } },
  });
  let attCount = 0;
  const now = new Date();
  for (let dayOffset = 5; dayOffset >= 1; dayOffset--) {
    const d = new Date(now);
    d.setDate(d.getDate() - dayOffset);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = d.toISOString().split("T")[0];

    for (const st of allStudents) {
      if (!st.enrollments[0]) continue;
      const rand = Math.random();
      const status = rand < 0.75 ? "PRESENT" : rand < 0.85 ? "ABSENT" : rand < 0.95 ? "SICK" : "PERMISSION";
      await prisma.studentAttendance.create({
        data: { studentId: st.id, classSectionId: st.enrollments[0].classSectionId, date: dateStr, status },
      });
      attCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    seeded: { academicYear: 1, programs: programDefs.length, classes: classDefs.length, students: studentCount, assignments: assignmentCount, attendance: attCount },
  });
}
