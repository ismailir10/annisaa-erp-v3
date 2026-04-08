import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TeacherHomeClient } from "./home-client";

export default async function TeacherHome() {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") redirect("/");

  const today = new Date().toISOString().split("T")[0];

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
