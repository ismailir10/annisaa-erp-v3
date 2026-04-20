import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import {
  getParentWithChildren,
  getPublishedAssessmentsForStudent,
  resolveSelectedChild,
} from "@/lib/parent-helpers";
import { AssessmentsTable } from "@/app/parent/assessments-table";

export default async function ParentReportsPage({
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

  const assessmentsData = await getPublishedAssessmentsForStudent(selected.studentId);

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

      <h1 className="text-lg font-bold mb-4">Laporan Perkembangan</h1>

      <AssessmentsTable data={assessmentsData} />
    </div>
  );
}
