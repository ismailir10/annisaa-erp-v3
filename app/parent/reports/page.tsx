import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { getParentWithChildren, resolveSelectedChild } from "@/lib/parent-helpers";
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

  const assessments = await prisma.studentAssessment.findMany({
    where: { studentId: selected.studentId, status: "PUBLISHED", template: { tenantId: session.tenantId! } },
    include: {
      template: {
        include: {
          program: { select: { name: true } },
          categories: {
            orderBy: { sortOrder: "asc" },
            include: { indicators: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      scores: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  const assessmentsData = assessments.map((a) => ({
    id: a.id,
    templateName: a.template.name,
    period: a.period,
    programName: a.template.program.name,
    status: a.status,
    categories: a.template.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      indicators: cat.indicators.map((ind) => ({
        id: ind.id,
        description: ind.description,
      })),
    })),
    scores: a.scores.map((s) => ({
      indicatorId: s.indicatorId,
      score: s.score,
    })),
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
