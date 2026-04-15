import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { getParentWithChildren, resolveSelectedChild } from "@/lib/parent-helpers";
import { GraduationCap } from "lucide-react";

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  BB: { label: "Belum Berkembang", color: "text-destructive" },
  MB: { label: "Mulai Berkembang", color: "text-[var(--status-late)]" },
  BSH: { label: "Berkembang Sesuai Harapan", color: "text-[var(--status-present)]" },
  BSB: { label: "Berkembang Sangat Baik", color: "text-primary" },
};

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

  return (
    <div>
      <ChildSelectorTabs
        items={childTabsData}
        selectedChildId={selected.studentId}
      />

      <h1 className="text-lg font-bold mb-4">Laporan Perkembangan</h1>

      {assessments.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Belum ada rapor"
          description="Rapor akan tersedia setelah guru menilai dan admin menerbitkan."
        />
      ) : (
        <div className="space-y-4">
          {assessments.map((a) => {
            const scoreMap = new Map(a.scores.map((s) => [s.indicatorId, s]));
            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold">{a.template.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {a.period} · {a.template.program.name}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                {a.template.categories.map((cat) => (
                  <div key={cat.id} className="mb-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {cat.name}
                    </h3>
                    <div className="space-y-2">
                      {cat.indicators.map((ind) => {
                        const score = scoreMap.get(ind.id);
                        const scoreInfo = score?.score
                          ? SCORE_LABELS[score.score]
                          : null;
                        return (
                          <div
                            key={ind.id}
                            className="flex items-start justify-between py-1 border-b border-border/50 last:border-0"
                          >
                            <p className="text-xs flex-1 pr-3">
                              {ind.description}
                            </p>
                            <div className="text-right shrink-0">
                              {scoreInfo ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${scoreInfo.color}`}
                                >
                                  {score!.score}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  —
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
