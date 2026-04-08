import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DashboardClient } from "./dashboard-client";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "SCHOOL_ADMIN") redirect("/");

  const today = new Date().toISOString().split("T")[0];

  const [totalEmployees, todayAttendance] = await Promise.all([
    prisma.employee.count({
      where: { tenantId: session.tenantId!, status: "ACTIVE" },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: today },
      _count: true,
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of todayAttendance) {
    statusCounts[row.status] = row._count;
  }

  const present = (statusCounts["PRESENT"] ?? 0) + (statusCounts["LATE"] ?? 0) + (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = totalEmployees - present - (statusCounts["LEAVE"] ?? 0) - (statusCounts["HOLIDAY"] ?? 0);

  return (
    <>
      <PageHeader
        title={`Selamat datang, ${session.name?.split(" ")[0] ?? "Admin"}`}
        description={new Date().toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      />
      <DashboardClient
        totalEmployees={totalEmployees}
        present={present}
        late={late}
        absent={Math.max(0, absent)}
      />
    </>
  );
}
