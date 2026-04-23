"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, ChevronRight, Hourglass, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDate } from "@/lib/format";

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
  publishedAt?: string | null;
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
  childName?: string;
};

export function AssessmentsTable({ data, childName }: AssessmentsTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssessmentDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

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

  // Pre-publish / no rapor — Frame 12
  if (data.length === 0) {
    return (
      <EmptyState
        accent="warm"
        icon={Hourglass}
        title="Rapor belum terbit"
        description="Ustadzah masih menyusun penilaian. InsyaAllah siap dibuka akhir semester — Anda akan mendapat notifikasi."
      />
    );
  }

  const scoreMap = detail
    ? new Map(detail.scores.map((s) => [s.indicatorId, s]))
    : null;

  // Latest = first row (data already ordered desc by publishedAt server-side)
  const latest = data[0]!;
  const history = data.slice(1);

  return (
    <>
      <div className="space-y-6">
        {/* Frame 11 — published celebration card */}
        <section
          className="rounded-xl border p-4"
          style={{
            background: "var(--celebration-gold-subtle)",
            borderColor: "var(--celebration-gold)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-lg"
              style={{
                background: "var(--celebration-gold-subtle)",
                color: "var(--celebration-gold-text)",
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--celebration-gold-text)" }}
              >
                Rapor {latest.period}
                {childName ? ` ${childName}` : ""} sudah terbit
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Alhamdulillah, silakan baca penilaian lengkap dari Ustadzah.
              </p>
            </div>
          </div>
        </section>

        <Button className="w-full" size="lg" onClick={() => setSelectedId(latest.id)}>
          <BookOpen size={16} className="mr-2" />
          Buka rapor
        </Button>

        {/* History — Frame 11 below celebration */}
        {history.length > 0 ? (
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Riwayat rapor
            </p>
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 active:border-primary/40"
                  >
                    <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {item.period}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.publishedAt
                          ? `Diterbitkan ${formatDate(item.publishedAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}`
                          : item.programName}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
  return (
    <div className="mt-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
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
