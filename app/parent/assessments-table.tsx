"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

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
};

type AssessmentDetail = {
  id: string;
  templateName: string;
  period: string;
  programName: string;
  categories: {
    id: string;
    name: string;
    indicators: { id: string; description: string }[];
  }[];
  scores: { indicatorId: string; score: string | null; notes: string | null }[];
};

type AssessmentsTableProps = {
  data: AssessmentItem[];
};

export function AssessmentsTable({ data }: AssessmentsTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Fetch detail when sheet opens with a new id — same pattern as invoice-detail-sheet
  if (selectedId && selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setLoadingId(selectedId);
    setDetail(null);

    fetch(`/api/guardian/assessments/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: AssessmentDetail) => {
        setDetail(data);
        setLoadingId(null);
      })
      .catch(() => {
        toast.error("Gagal memuat detail rapor");
        setLoadingId(null);
        setSelectedId(null);
      });
  }

  if (!selectedId && prevSelectedId !== null) {
    setPrevSelectedId(null);
    setDetail(null);
    setLoadingId(null);
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Belum ada rapor"
        description="Rapor akan tersedia setelah guru menilai dan admin menerbitkan."
      />
    );
  }

  const scoreMap = detail
    ? new Map(detail.scores.map((s) => [s.indicatorId, s]))
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
              onClick={() => setSelectedId(item.id)}
            >
              <Eye size={14} className="mr-2" />
              Lihat
            </Button>
          </div>
        ))}
      </div>

      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "h-[95dvh] rounded-t-2xl overflow-y-auto p-5"
              : "w-full sm:!max-w-2xl overflow-y-auto p-6 md:p-8"
          }
        >
          {loadingId ? (
            <AssessmentDetailSkeleton />
          ) : detail ? (
            <>
              <SheetHeader className="p-0 pb-4 border-b">
                <SheetTitle className="pr-10">{detail.templateName}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {detail.period} · {detail.programName}
                </p>
              </SheetHeader>

              <div className="mt-6 space-y-8">
                {detail.categories.map((cat) => (
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
                                  className={`text-xs ${scoreInfo.color}`}
                                >
                                  {score!.score}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
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
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AssessmentDetailSkeleton() {
  // Mirrors the real layout: header (title + period/program) + 6 domain sections,
  // each with a category label and 2 indicator rows. Keeps layout shift minimal
  // when real data arrives (<10 px in practice against typical rapor content).
  return (
    <div className="mt-4">
      {/* Header block — mirrors SheetHeader (title + subtitle) */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* 6 domain sections (PERKEMBANGAN *) */}
      <div className="mt-6 space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-5 w-40 mb-3" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-start justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <Skeleton className="h-4 w-full mr-3 flex-1" />
                  <Skeleton className="h-6 w-10 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
