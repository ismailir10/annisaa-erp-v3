import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  countAttendanceThisWeek,
  getParentWithChildren,
  // Used only for the 7-day summary strip — paginated list comes from /api/parent/children/[id]/attendance
  getStudentAttendanceRecent,
  resolveSelectedChild,
} from "@/lib/parent-helpers";
import { WeekSummaryStrip } from "./week-summary-strip";
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

  // 7-day summary strip is rendered server-side for fast initial paint.
  // The full attendance list is now paginated via the API in <AttendanceClient />.
  const recent = await getStudentAttendanceRecent(selected.studentId, 7);
  const weekCounts = countAttendanceThisWeek(recent);

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
        sticky
      />
      <WeekSummaryStrip counts={weekCounts} />
      <AttendanceClient studentId={selected.studentId} />
    </div>
  );
}
