"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, ChevronRight, Download, Hourglass, Sparkles } from "lucide-react";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDate } from "@/lib/format";
import type { ParentReportCard } from "@/lib/parent-helpers";

// Visual reference: design-system.html portal shell — celebration gold card
// (published rapor), bottom/right Sheet drawer, p-card spacing, status badges.
// Mirrors the prior assessments-table shell but renders the authored
// ReportCardEntry (3-level skala + narrative sections), not legacy templates.

type Props = {
  data: ParentReportCard[];
  studentId: string;
  childName?: string;
};

export function ReportCardsList({ data, studentId, childName }: Props) {
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Pre-publish / no published rapor — same empty state as before.
  if (data.length === 0) {
    return (
      <EmptyState
        accent="warm"
        icon={Hourglass}
        title="Rapor belum terbit"
        description="Ustadzah masih menyusun rapor. InsyaAllah siap dibuka akhir triwulan — Anda akan mendapat notifikasi."
      />
    );
  }

  // data is ordered newest-first server-side.
  const latest = data[0]!;
  const history = data.slice(1);
  const selected = data.find((c) => c.termId === selectedTermId) ?? null;

  return (
    <>
      <div className="space-y-6">
        {/* Published celebration card */}
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

        <Button className="w-full" size="lg" onClick={() => setSelectedTermId(latest.termId)}>
          <BookOpen size={16} className="mr-2" />
          Buka rapor
        </Button>

        {history.length > 0 ? (
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Riwayat rapor
            </p>
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.termId}>
                  <button
                    type="button"
                    onClick={() => setSelectedTermId(item.termId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 active:border-primary/40"
                  >
                    <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <BookOpen size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.period}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.publishedAt
                          ? `Diterbitkan ${formatDate(item.publishedAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}`
                          : "Sudah terbit"}
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

      <Sheet open={!!selected} onOpenChange={() => setSelectedTermId(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "h-[95dvh] rounded-t-2xl overflow-y-auto p-card"
              : "w-full sm:!max-w-2xl overflow-y-auto p-card md:p-8"
          }
        >
          {selected ? (
            <ReportCardDetail card={selected} studentId={studentId} />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ReportCardDetail({
  card,
  studentId,
}: {
  card: ParentReportCard;
  studentId: string;
}) {
  // Hide structurally-empty sections (no level + no narrative) so the parent
  // sees only what the Ustadzah actually wrote.
  const sections = card.sections.filter((s) => s.level || s.narrative.trim());

  return (
    <>
      <SheetHeader className="p-0 pb-4 border-b">
        <SheetTitle className="pr-10">Rapor {card.period}</SheetTitle>
      </SheetHeader>

      <div className="mt-6 space-y-8">
        {sections.length > 0 ? (
          sections.map((sec) => (
            <div key={sec.label}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-h2 font-semibold text-foreground">{sec.label}</h3>
                {sec.level ? (
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-primary border-primary/20"
                  >
                    {sec.level}
                  </Badge>
                ) : null}
              </div>
              {sec.narrative.trim() ? (
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {sec.narrative}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Narasi rapor belum tersedia.
          </p>
        )}

        {/* Kehadiran */}
        <div>
          <h3 className="text-h2 font-semibold text-foreground mb-3">Kehadiran</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AttCell label="Sakit" value={card.attendance.sick} />
            <AttCell label="Izin" value={card.attendance.permitted} />
            <AttCell label="Alpa" value={card.attendance.unexcused} />
            <AttCell label="Hari sekolah" value={card.attendance.total} />
          </div>
        </div>

        {/* Pertumbuhan */}
        {card.height || card.weight ? (
          <div>
            <h3 className="text-h2 font-semibold text-foreground mb-3">Pertumbuhan</h3>
            <p className="text-sm text-foreground">
              {card.height ? `Tinggi: ${card.height} cm` : ""}
              {card.height && card.weight ? "   ·   " : ""}
              {card.weight ? `Berat: ${card.weight} kg` : ""}
            </p>
          </div>
        ) : null}

        {/* Hafalan */}
        {card.hafalan && card.hafalan.trim() ? (
          <div>
            <h3 className="text-h2 font-semibold text-foreground mb-3">Hafalan</h3>
            <p className="text-sm text-foreground whitespace-pre-wrap">{card.hafalan}</p>
          </div>
        ) : null}

        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            window.open(`/api/guardian/raport/${studentId}/${card.termId}/pdf`, "_blank")
          }
        >
          <Download size={16} className="mr-2" />
          Unduh PDF
        </Button>
      </div>
    </>
  );
}

function AttCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
