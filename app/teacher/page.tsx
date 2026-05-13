import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
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
    />
  );
}
