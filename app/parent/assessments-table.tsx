"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eye } from "lucide-react";
import { useState } from "react";

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  BB: { label: "Belum Berkembang", color: "text-destructive" },
  MB: { label: "Mulai Berkembang", color: "text-status-late" },
  BSH: { label: "Berkembang Sesuai Harapan", color: "text-status-present" },
  BSB: { label: "Berkembang Sangat Baik", color: "text-primary" },
};

type AssessmentItem = {
  id: string;
  templateName: string;
  period: string;
  programName: string;
  status: string;
  categories: {
    id: string;
    name: string;
    indicators: {
      id: string;
      description: string;
    }[];
  }[];
  scores: {
    indicatorId: string;
    score: string | null;
  }[];
};

type AssessmentsTableProps = {
  data: AssessmentItem[];
};

export function AssessmentsTable({ data }: AssessmentsTableProps) {
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentItem | null>(null);

  if (data.length === 0) {
    return (
      <EmptyState
        title="Belum ada rapor"
        description="Rapor akan tersedia setelah guru menilai dan admin menerbitkan."
      />
    );
  }

  const scoreMap = selectedAssessment
    ? new Map(selectedAssessment.scores.map((s) => [s.indicatorId, s]))
    : null;

  return (
    <>
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-snug truncate flex-1">
                {item.templateName}
              </p>
              <StatusBadge status={item.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {item.period} · {item.programName}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={() => setSelectedAssessment(item)}
            >
              <Eye size={14} className="mr-2" />
              Lihat
            </Button>
          </div>
        ))}
      </div>

      <Sheet open={!!selectedAssessment} onOpenChange={() => setSelectedAssessment(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedAssessment && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedAssessment.templateName}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedAssessment.period} · {selectedAssessment.programName}
                </p>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {selectedAssessment.categories.map((cat) => (
                  <div key={cat.id}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {cat.name}
                    </h3>
                    <div className="space-y-3">
                      {cat.indicators.map((ind) => {
                        const score = scoreMap?.get(ind.id);
                        const scoreInfo = score?.score
                          ? SCORE_LABELS[score.score]
                          : null;
                        return (
                          <div
                            key={ind.id}
                            className="flex items-start justify-between py-2 border-b border-border/50 last:border-0"
                          >
                            <p className="text-xs flex-1 pr-3">{ind.description}</p>
                            <div className="text-right shrink-0">
                              {scoreInfo ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${scoreInfo.color}`}
                                >
                                  {score!.score}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
