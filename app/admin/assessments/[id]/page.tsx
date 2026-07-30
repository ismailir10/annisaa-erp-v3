"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { toast } from "sonner";
import { Save, Send } from "lucide-react";

type Indicator = { id: string; description: string; sortOrder: number };
type Category = { id: string; name: string; sortOrder: number; indicators: Indicator[] };
type Score = { indicatorId: string; score: string | null; notes: string | null };

type Assessment = {
  id: string;
  status: string;
  period: string;
  student: { name: string; nickname: string | null };
  template: {
    name: string;
    program: { name: string };
    categories: Category[];
  };
  scores: Score[];
};

const SCORE_OPTIONS = [
  { value: "BB", label: "BB", desc: "Belum Berkembang" },
  { value: "MB", label: "MB", desc: "Mulai Berkembang" },
  { value: "BSH", label: "BSH", desc: "Berkembang Sesuai Harapan" },
  { value: "BSB", label: "BSB", desc: "Berkembang Sangat Baik" },
];

// BB = Belum Berkembang is developmentally NORMAL for young children in PAUD.
// Using "absent" red would conflate a benign tier with a negative event.
// Amber (late) communicates "needs support" without stigma; the rest scale up.
const SCORE_COLORS: Record<string, string> = {
  BB: "bg-status-late-subtle text-status-late-text border-transparent",
  MB: "bg-status-leave-subtle text-status-leave-text border-transparent",
  BSH: "bg-status-holiday-subtle text-status-holiday-text border-transparent",
  BSB: "bg-status-present-subtle text-status-present-text border-transparent",
};

const AUTOSAVE_INTERVAL_MS = 2_000;

export default function AssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  const assessmentId = params?.id;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [explicitSaving, setExplicitSaving] = useState(false);
  const [scoreMap, setScoreMap] = useState<Record<string, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const scoreMapRef = useRef<Record<string, string>>({});
  const confirmedScoreMapRef = useRef<Record<string, string>>({});
  const notesMapRef = useRef<Record<string, string>>({});
  const scoreRevisionRef = useRef<Record<string, number>>({});
  const pendingRevisionRef = useRef<Record<string, number>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastSaveStartedAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (!assessmentId) { setLoading(false); return; }
    fetch(`/api/assessments/student/${assessmentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Assessment) => {
        setAssessment(data);
        const sMap: Record<string, string> = {};
        const nMap: Record<string, string> = {};
        for (const s of data.scores) {
          if (s.score) sMap[s.indicatorId] = s.score;
          if (s.notes) nMap[s.indicatorId] = s.notes;
        }
        scoreMapRef.current = sMap;
        confirmedScoreMapRef.current = sMap;
        notesMapRef.current = nMap;
        setScoreMap(sMap);
        setNotesMap(nMap);
      })
      .catch(() => toast.error("Penilaian tidak ditemukan"))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }, []);

  function scheduleAutosave() {
    if (autosaveTimerRef.current || autosaveInFlightRef.current) return;
    const delay = Math.max(
      0,
      lastSaveStartedAtRef.current + AUTOSAVE_INTERVAL_MS - Date.now(),
    );
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void startSaveBatch();
    }, delay);
  }

  async function startSaveBatch(
    status?: "PUBLISHED",
    force = false,
  ): Promise<boolean> {
    if (!assessment) return false;
    if (autosaveInFlightRef.current) return autosaveInFlightRef.current;

    const saveTask = (async () => {
      const throttleDelay = Math.max(
        0,
        lastSaveStartedAtRef.current + AUTOSAVE_INTERVAL_MS - Date.now(),
      );
      if (throttleDelay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, throttleDelay));
      }

      // Capture immediately before the request so taps received during the
      // throttle window are coalesced into this latest full-state payload.
      const revisions = { ...pendingRevisionRef.current };
      pendingRevisionRef.current = {};
      if (!force && Object.keys(revisions).length === 0) return true;

      const scoreSnapshot = { ...scoreMapRef.current };
      lastSaveStartedAtRef.current = Date.now();

      try {
        const res = await fetch(`/api/assessments/student/${assessment.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scores: Object.entries(scoreSnapshot).map(([indicatorId, score]) => ({
              indicatorId,
              score,
              notes: notesMapRef.current[indicatorId] || null,
            })),
            status,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error || "Gagal menyimpan nilai");
        }

        confirmedScoreMapRef.current = scoreSnapshot;
        return true;
      } catch (error) {
        let rolledBack = false;
        const rolledBackScores = { ...scoreMapRef.current };

        for (const [indicatorId, revision] of Object.entries(revisions)) {
          // Revisions, not value equality, make this ABA-safe: if the user
          // tapped A → B → A while this request was in flight, the newer A
          // carries a different token and must survive the stale failure.
          if (scoreRevisionRef.current[indicatorId] !== revision) continue;
          const confirmedScore = confirmedScoreMapRef.current[indicatorId];
          if (confirmedScore) rolledBackScores[indicatorId] = confirmedScore;
          else delete rolledBackScores[indicatorId];
          rolledBack = true;
        }

        if (rolledBack) {
          scoreMapRef.current = rolledBackScores;
          setScoreMap(rolledBackScores);
          toast.error(
            `${error instanceof Error ? error.message : "Gagal menyimpan nilai"}. Nilai dikembalikan; pilih lagi untuk mencoba ulang.`,
          );
        } else if (Object.keys(revisions).length > 0) {
          toast.error(
            `${error instanceof Error ? error.message : "Gagal menyimpan nilai"}. Perubahan terbaru akan dicoba berikutnya.`,
          );
        } else {
          toast.error(
            `${error instanceof Error ? error.message : "Gagal menyimpan"}. Periksa koneksi lalu coba lagi.`,
          );
        }
        return false;
      }
    })();

    autosaveInFlightRef.current = saveTask;
    try {
      return await saveTask;
    } finally {
      autosaveInFlightRef.current = null;
      if (Object.keys(pendingRevisionRef.current).length > 0) scheduleAutosave();
    }
  }

  function handleScoreChange(indicatorId: string, nextScore: string) {
    if (!assessment) return;

    const revision = (scoreRevisionRef.current[indicatorId] ?? 0) + 1;
    scoreRevisionRef.current[indicatorId] = revision;
    pendingRevisionRef.current[indicatorId] = revision;

    const optimisticScores = { ...scoreMapRef.current, [indicatorId]: nextScore };
    scoreMapRef.current = optimisticScores;
    setScoreMap(optimisticScores);
    scheduleAutosave();
  }

  async function handleSave(publish: boolean) {
    if (!assessment) return;
    setExplicitSaving(true);

    try {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (autosaveInFlightRef.current) await autosaveInFlightRef.current;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const saved = await startSaveBatch(publish ? "PUBLISHED" : undefined, true);
      if (!saved) return;

      toast.success(publish ? "Penilaian dipublikasi" : "Nilai disimpan");
      if (publish) {
        setAssessment({ ...assessment, status: "PUBLISHED" });
      }
    } finally {
      setExplicitSaving(false);
    }
  }

  if (loading) return <DetailPageSkeleton />;

  if (!assessment) {
    return (
      <div className="space-y-section">
        <DetailPageHeader backHref="/admin/assessments" title="Penilaian Siswa" description="Pilih penilaian dari halaman daftar" />
        <Card className="p-card text-center text-muted-foreground">
          <p className="text-sm">Tidak ada penilaian yang dipilih. Kembali ke daftar penilaian.</p>
        </Card>
      </div>
    );
  }

  const totalIndicators = assessment.template.categories.reduce((s, c) => s + c.indicators.length, 0);
  const scoredCount = Object.keys(scoreMap).length;

  return (
    <div className="space-y-section">
      <DetailPageHeader
        backHref="/admin/assessments"
        title={`${assessment.student.name}${assessment.student.nickname ? ` (${assessment.student.nickname})` : ""}`}
        description={`${assessment.template.name} · ${assessment.template.program.name} · ${assessment.period}`}
        badge={<StatusBadge status={assessment.status} label={assessment.status === "PUBLISHED" ? "Dipublikasi" : "Draf"} />}
        actions={
          <>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={explicitSaving}>
              <Save size={14} className="mr-1.5" /> {explicitSaving ? "Menyimpan..." : "Simpan Draf"}
            </Button>
            {assessment.status !== "PUBLISHED" && (
              <Button onClick={() => handleSave(true)} disabled={explicitSaving}>
                <Send size={14} className="mr-1.5" /> Publikasi
              </Button>
            )}
          </>
        }
      />

      <div className="mb-2">
        <span className="text-xs text-muted-foreground">{scoredCount}/{totalIndicators} indikator dinilai</span>
      </div>

      {assessment.template.categories.map((cat) => (
        <Card key={cat.id} className="p-card">
          <h3 className="text-sm font-semibold mb-3">{cat.name}</h3>
          <div className="space-y-3">
            {cat.indicators.map((ind) => (
              <div key={ind.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-border last:border-0">
                <span className="text-sm flex-1">{ind.description}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <ToggleGroup
                    value={scoreMap[ind.id] ? [scoreMap[ind.id]] : []}
                    onValueChange={(value) => {
                      const score = value[0];
                      if (score) handleScoreChange(ind.id, score);
                    }}
                    aria-label={`Nilai untuk ${ind.description}`}
                    spacing={1}
                  >
                    {SCORE_OPTIONS.map((opt) => {
                      const selected = scoreMap[ind.id] === opt.value;
                      return (
                        <ToggleGroupItem
                          key={opt.value}
                          value={opt.value}
                          aria-label={`${opt.label}: ${opt.desc}`}
                          className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                            selected
                              ? SCORE_COLORS[opt.value]
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                  <Input
                    id={`assessment-note-${ind.id}`}
                    aria-label={`Catatan untuk ${ind.description}`}
                    className="w-32 text-xs h-8"
                    placeholder="Catatan"
                    value={notesMap[ind.id] || ""}
                    onChange={(e) => {
                      const nextNotes = { ...notesMapRef.current, [ind.id]: e.target.value };
                      notesMapRef.current = nextNotes;
                      setNotesMap(nextNotes);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
