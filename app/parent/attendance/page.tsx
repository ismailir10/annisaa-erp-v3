import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AttendanceClient } from "./client";

export default async function ParentAttendancePage() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const guardian = await prisma.guardian.findFirst({ where: { email: session.email } });
  if (!guardian) redirect("/parent");

  // Last 30 days of attendance
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const records = await prisma.studentAttendance.findMany({
    where: { studentId: guardian.studentId, date: { gte: startDate } },
    orderBy: { date: "desc" },
  });

  const data = records.map(r => ({
    id: r.id,
    date: r.date,
    status: r.status,
    checkInTime: r.checkInTime?.toISOString() ?? null,
    checkOutTime: r.checkOutTime?.toISOString() ?? null,
    notes: r.notes,
  }));

  return <AttendanceClient data={data} />;
}
