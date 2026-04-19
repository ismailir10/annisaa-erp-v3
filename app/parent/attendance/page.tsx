import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getParentWithChildren,
  getStudentAttendanceRecent,
  resolveSelectedChild,
} from "@/lib/parent-helpers";
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

  const data = await getStudentAttendanceRecent(selected.studentId, 30);

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
