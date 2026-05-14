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
    />
  );
}
