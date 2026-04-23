"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SummaryHero } from "@/components/portal/summary-hero";
import { CardListItem } from "@/components/portal/card-list-item";
import { BookOpen, GraduationCap, Sparkles } from "lucide-react";
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
  /** Child's first/nickname — used for warm celebration voice. */
  childName?: string;
};

export function AssessmentsTable({ data, childName }: AssessmentsTableProps) {
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
        toast.error("Rapor belum bisa dimuat. Coba lagi sebentar ya.");
        setLoadingId(null);
        setSelectedId(null);
      });
  }

  if (!selectedId && prevSelectedId !== null) {
    setPrevSelectedId(null);
    setDetail(null);
    setLoadingId(null);
  }

  // T4d — no rapor at all: warm empty state, skip hero (per T4a rule).
  if (data.length === 0) {
    return (
      <EmptyState
        accent="warm"
        icon={BookOpen}
        title="Rapor belum terbit"
        description="InsyaAllah akan tersedia setelah Ustadzah finalisasi nilai. Periksa kembali di akhir semester."
      />
    );
  }

  const scoreMap = detail
    ? new Map(detail.scores.map((s) => [s.indicatorId, s]))
    : null;

  // T4a — latest-rapor celebration hero. All rows served by
  // getPublishedAssessmentsForStudent are PUBLISHED (query already filters),
  // so the hero tone is celebration-gold whenever any rapor exists.
  const latest = data[0];
  const whoseRapor = childName ? ` ${childName}` : "";

  return (
    <>
      <div className="space-y-4">
        <SummaryHero
          tone="celebration"
          icon={Sparkles}
          primary={`Rapor ${latest.period}${whoseRapor} sudah terbit`}
          secondary={`Alhamdulillah — ${latest.programName}. Ketuk untuk baca penilaian lengkap Ustadzah.`}
          action={
            <Button size="sm" onClick={() => setSelectedId(latest.id)}>
              Lihat Rapor
            </Button>
          }
          elevated={true}
        />

        <div className="space-y-2">
          {data.map((item) => (
            <CardListItem
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              leading={
                <span className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <GraduationCap className="size-5" aria-hidden />
                </span>
              }
              primary={item.templateName}
              secondary={`${item.period} · ${item.programName}`}
              trailing={<StatusBadge status={item.status} variant="intent" />}
            />
          ))}
        </div>
      </div>

      <Sheet open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "h-[95dvh] rounded-t-2xl overflow-y-auto p-card"
              : "w-full sm:!max-w-2xl overflow-y-auto p-card md:p-8"
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

              {/* T4c — celebration hero inside detail sheet */}
              <div className="mt-4">
                <SummaryHero
                  tone="celebration"
                  icon={Sparkles}
                  primary={`Rapor ${detail.period} · Alhamdulillah`}
                  secondary={`${detail.programName} — ringkasan penilaian Ustadzah tertera di bawah.`}
                  elevated={false}
                />
              </div>

              <div className="mt-6 space-y-8">
                {detail.categories.map((cat) => (
                  <div key={cat.id}>
                    <h3 className="text-h2 font-semibold text-foreground mb-3">
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
                                  className={`text-xs tabular-nums ${scoreInfo.color}`}
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

                {/* Teacher notes block — warm-tinted left-accent per T4c */}
                {detail.scores.some((s) => s.notes && s.notes.trim().length > 0) ? (
                  <div>
                    <h3 className="text-h2 font-semibold text-foreground mb-3">
                      Catatan Ustadzah
                    </h3>
                    <div className="space-y-3">
                      {detail.scores
                        .filter((s) => s.notes && s.notes.trim().length > 0)
                        .map((s) => (
                          <div
                            key={s.indicatorId}
                            className="border-l-4 border-l-primary bg-primary/5 p-card rounded-md"
                          >
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {s.notes}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
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
