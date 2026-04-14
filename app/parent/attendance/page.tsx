import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getParentWithChildren, resolveSelectedChild } from "@/lib/parent-helpers";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { AttendanceClient } from "./client";

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent || children.length === 0) redirect("/parent");

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  // Last 30 days of attendance
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const records = await prisma.studentAttendance.findMany({
    where: { studentId: selected.studentId, date: { gte: startDate } },
    orderBy: { date: "desc" },
  });

  const data = records.map((r) => ({
    id: r.id,
    date: r.date,
    status: r.status,
    checkInTime: r.checkInTime?.toISOString() ?? null,
    checkOutTime: r.checkOutTime?.toISOString() ?? null,
    notes: r.notes,
  }));

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  return (
    <div>
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
      />
      <AttendanceClient data={data} />
    </div>
  );
}
