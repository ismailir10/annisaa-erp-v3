import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { getHomeroomClassSection } from "@/lib/curriculum/homeroom";
import { TeacherHomeClient } from "./home-client";

export default async function TeacherHome() {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") redirect("/");

  const today = getTodayInTimezone("Asia/Jakarta");

  const todayRecord = session.employeeId
    ? await prisma.attendanceRecord.findUnique({
        where: {
          employeeId_date: {
            employeeId: session.employeeId,
            date: today,
          },
        },
      })
    : null;

  // Today's ClassSessions for this teacher — same query the GET
  // /api/teacher/sessions endpoint uses (teacherId === employeeId naturally
  // includes substitute-day assignments). Server-fetched so the dashboard
  // card paints with the first render, no client round-trip.
  let todaySessions: {
    id: string;
    slot: string;
    className: string;
    rosterCount: number;
  }[] = [];
  if (session.tenantId && session.employeeId) {
    const sessions = await prisma.classSession.findMany({
      where: {
        date: today,
        teacherId: session.employeeId,
        classSection: { tenantId: session.tenantId },
      },
      select: {
        id: true,
        slot: true,
        classSection: {
          select: {
            name: true,
            _count: {
              select: { enrollments: { where: { status: "ACTIVE" } } },
            },
          },
        },
      },
      orderBy: { slot: "asc" },
    });
    todaySessions = sessions.map((s) => ({
      id: s.id,
      slot: s.slot,
      className: s.classSection.name,
      rosterCount: s.classSection._count.enrollments,
    }));
  }

  // Walas detection — feeds the Penilaian Pekanan quick card. Skip the
  // active-AY lookup when no employeeId so demo accounts without staff
  // links don't trip the homeroom branch.
  let homeroomClassSectionName: string | null = null;
  if (session.tenantId && session.employeeId) {
    const activeYear = await prisma.academicYear.findFirst({
      where: { tenantId: session.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (activeYear) {
      const homeroom = await getHomeroomClassSection(
        session.tenantId,
        session.employeeId,
        activeYear.id,
      );
      homeroomClassSectionName = homeroom?.name ?? null;
    }
  }

  return (
    <TeacherHomeClient
      userName={session.name ?? "Guru"}
      todayRecord={
        todayRecord
          ? {
              status: todayRecord.status,
              checkInTime: todayRecord.checkInTime?.toISOString() ?? null,
              checkOutTime: todayRecord.checkOutTime?.toISOString() ?? null,
            }
          : null
      }
      homeroomClassSectionName={homeroomClassSectionName}
      todaySessions={todaySessions}
    />
  );
}
