"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/portal/page-header";

type Score = "BB" | "MB" | "BSH" | "BSB";
const SCORES: Score[] = ["BB", "MB", "BSH", "BSB"];

const SCORE_LABEL: Record<Score, string> = {
  BB: "Belum Berkembang",
  MB: "Mulai Berkembang",
  BSH: "Berkembang Sesuai Harapan",
  BSB: "Berkembang Sangat Baik",
};

type IndicatorDef = { id: string; description: string };
type CategoryDef = { id: string; name: string; indicators: IndicatorDef[] };
type TemplateDef = { id: string; name: string; type: string; categories: CategoryDef[] };
type ClassSectionDef = { id: string; name: string; program: { id: string; name: string } };

type StudentRow = {
  id: string;
  name: string;
  nickname: string | null;
  existing: {
    id: string;
    status: string;
    scores: { indicatorId: string; score: string | null; notes: string | null }[];
  } | null;
};

type IndicatorScoreState = { score: Score | null; notes: string };
type StudentState = {
  assessmentId: string | null;
  status: "DRAFT" | "PUBLISHED";
  scores: Record<string, IndicatorScoreState>;
  saveState: "idle" | "saving" | "saved" | "error";
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function SaveIndicator({ state }: { state: SaveStatus }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 size={11} className="animate-spin" /> Menyimpan...
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-present">
        <Check size={11} /> Tersimpan
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-xs text-destructive">Gagal simpan</span>;
  }
  return null;
}

export function AssessmentEntryClient({
  classSection,
  template,
  period,
  students,
}: {
  classSection: ClassSectionDef;
  template: TemplateDef;
  period: string;
  students: StudentRow[];
}) {
  const indicatorIds = useMemo(
    () => template.categories.flatMap((c) => c.indicators.map((i) => i.id)),
    [template]
  );

  const [state, setState] = useState<Record<string, StudentState>>(() => {
    const out: Record<string, StudentState> = {};
    for (const s of students) {
      const scores: Record<string, IndicatorScoreState> = {};
      for (const iid of indicatorIds) {
        const existingScore = s.existing?.scores.find((x) => x.indicatorId === iid);
        const raw = existingScore?.score ?? null;
        scores[iid] = {
          score: raw && (SCORES as string[]).includes(raw) ? (raw as Score) : null,
          notes: existingScore?.notes ?? "",
        };
      }
      out[s.id] = {
        assessmentId: s.existing?.id ?? null,
        status: (s.existing?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as "DRAFT" | "PUBLISHED",
        scores,
        saveState: "idle",
      };
    }
    return out;
  });

  const [publishing, setPublishing] = useState(false);

  // Track in-flight timers per-student so debounces don't stack across students
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  // Queue of create-in-flight per student to avoid race conditions
  const creatingRef = useRef<Record<string, Promise<string | null> | null>>({});

  // saveStudent runs from a setTimeout fired 1.2 s after the click that
  // scheduled it. With `state` in the useCallback deps, the timer captures a
  // pre-click closure (setState in setScore is queued, the render that
  // produces the new saveStudent hasn't run yet) and persists stale scores.
  // Mirror state into a ref synchronously each render so the deferred work
  // always reads the latest committed state regardless of when it fires.
  const stateRef = useRef(state);
  stateRef.current = state;

  const ensureAssessment = useCallback(
    async (studentId: string): Promise<string | null> => {
      const cur = stateRef.current[studentId];
      if (cur?.assessmentId) return cur.assessmentId;

      const existing = creatingRef.current[studentId];
      if (existing) return existing;

      const p = (async () => {
        const res = await fetch("/api/assessments/student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, templateId: template.id, period }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Gagal membuat penilaian");
          return null;
        }
        const data = await res.json();
        const id: string = data.id;
        setState((prev) => ({
          ...prev,
          [studentId]: { ...prev[studentId], assessmentId: id },
        }));
        return id;
      })();
      creatingRef.current[studentId] = p;
      const id = await p;
      creatingRef.current[studentId] = null;
      return id;
    },
    [template.id, period]
  );

  const saveStudent = useCallback(
    async (studentId: string, opts: { publish?: boolean } = {}): Promise<boolean> => {
      const cur = stateRef.current[studentId];
      if (!cur) return false;

      // Build scores payload — only indicators with a value
      const scorePayload = Object.entries(cur.scores)
        .filter(([, v]) => v.score != null)
        .map(([indicatorId, v]) => ({
          indicatorId,
          score: v.score as Score,
          notes: v.notes?.trim() ? v.notes.trim() : null,
        }));

      // Skip the round-trip only if there's nothing to save AND no row exists.
      // If an assessment row already exists, an empty payload means the
      // teacher cleared every indicator — server must persist the clear,
      // otherwise refresh resurrects the old scores.
      if (scorePayload.length === 0 && !opts.publish && !cur.assessmentId) {
        return true;
      }

      setState((prev) => ({
        ...prev,
        [studentId]: { ...prev[studentId], saveState: "saving" },
      }));

      const assessmentId = await ensureAssessment(studentId);
      if (!assessmentId) {
        setState((prev) => ({
          ...prev,
          [studentId]: { ...prev[studentId], saveState: "error" },
        }));
        return false;
      }

      const res = await fetch(`/api/assessments/student/${assessmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: scorePayload, publish: !!opts.publish }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal menyimpan nilai");
        setState((prev) => ({
          ...prev,
          [studentId]: { ...prev[studentId], saveState: "error" },
        }));
        return false;
      }

      setState((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          saveState: "saved",
          status: opts.publish ? "PUBLISHED" : prev[studentId].status,
        },
      }));
      return true;
    },
    [ensureAssessment]
  );

  const scheduleAutosave = useCallback(
    (studentId: string) => {
      if (timersRef.current[studentId]) {
        clearTimeout(timersRef.current[studentId]!);
      }
      timersRef.current[studentId] = setTimeout(() => {
        void saveStudent(studentId);
      }, 1200);
    },
    [saveStudent]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  function setScore(studentId: string, indicatorId: string, score: Score) {
    setState((prev) => {
      const cur = prev[studentId];
      const prevScore = cur.scores[indicatorId]?.score;
      const newScore: Score | null = prevScore === score ? null : score;
      return {
        ...prev,
        [studentId]: {
          ...cur,
          saveState: "idle",
          scores: {
            ...cur.scores,
            [indicatorId]: { ...cur.scores[indicatorId], score: newScore },
          },
        },
      };
    });
    scheduleAutosave(studentId);
  }

  function setNotes(studentId: string, indicatorId: string, notes: string) {
    setState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        saveState: "idle",
        scores: {
          ...prev[studentId].scores,
          [indicatorId]: { ...prev[studentId].scores[indicatorId], notes },
        },
      },
    }));
    scheduleAutosave(studentId);
  }

  async function publishAll() {
    setPublishing(true);
    let okCount = 0;
    let failCount = 0;
    for (const s of students) {
      // Flush any pending autosave for this student first
      if (timersRef.current[s.id]) {
        clearTimeout(timersRef.current[s.id]!);
        timersRef.current[s.id] = null;
      }
      const cur = state[s.id];
      const filled = Object.values(cur.scores).filter((v) => v.score != null).length;
      if (filled === 0) {
        failCount += 1;
        toast.error(`${s.name}: belum ada nilai yang diisi`);
        continue;
      }
      const ok = await saveStudent(s.id, { publish: true });
      if (ok) okCount += 1;
      else failCount += 1;
    }
    setPublishing(false);
    if (okCount > 0) toast.success(`${okCount} siswa dipublikasikan`);
    if (failCount > 0 && okCount === 0) toast.error("Tidak ada yang dipublikasikan");
  }

  const totalStudents = students.length;
  const publishedCount = Object.values(state).filter((s) => s.status === "PUBLISHED").length;

  return (
    <div className="pb-24">
      <Link
        href="/teacher/assessments"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3"
      >
        <ArrowLeft size={14} /> Kembali ke daftar penilaian
      </Link>

      <PageHeader
        title={template.name}
        subtitle={`${classSection.name} · ${classSection.program.name} · ${period}`}
      />
      <p className="text-xs font-medium text-primary -mt-4 mb-4">
        {publishedCount}/{totalStudents} siswa sudah dipublikasikan
      </p>

      <Accordion multiple className="space-y-2">
        {students.map((s) => {
          const st = state[s.id];
          const filled = Object.values(st.scores).filter((v) => v.score != null).length;
          const totalInds = indicatorIds.length;
          return (
            <AccordionItem key={s.id} value={s.id} className="border border-border rounded-lg bg-card">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex-1 flex items-center justify-between pr-2">
                  <div className="text-left">
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.nickname && (
                      <p className="text-xs text-muted-foreground">{s.nickname}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium ${
                        filled === totalInds
                          ? "text-status-present"
                          : filled > 0
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {filled}/{totalInds}
                    </span>
                    {st.status === "PUBLISHED" ? (
                      <StatusBadge status="PUBLISHED" label="Dipublikasikan" />
                    ) : (
                      <StatusBadge status="DRAFT" />
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="flex justify-end mb-2 min-h-[14px]">
                  <SaveIndicator state={st.saveState} />
                </div>
                <div className="space-y-4">
                  {template.categories.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs font-semibold text-foreground mb-2">{cat.name}</p>
                      <div className="space-y-3">
                        {cat.indicators.map((ind) => {
                          const sv = st.scores[ind.id];
                          return (
                            <div key={ind.id} className="border border-border/50 rounded-md p-2.5">
                              <p className="text-xs text-foreground mb-2">{ind.description}</p>
                              <div className="grid grid-cols-4 gap-1 mb-2">
                                {SCORES.map((sc) => {
                                  const selected = sv?.score === sc;
                                  return (
                                    <button
                                      key={sc}
                                      type="button"
                                      onClick={() => setScore(s.id, ind.id, sc)}
                                      aria-label={`${sc} — ${SCORE_LABEL[sc]}`}
                                      className={`py-1.5 rounded text-xs font-semibold border transition-colors ${
                                        selected
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background text-muted-foreground border-border hover:border-primary/40"
                                      }`}
                                    >
                                      {sc}
                                    </button>
                                  );
                                })}
                              </div>
                              <Textarea
                                value={sv?.notes ?? ""}
                                onChange={(e) => setNotes(s.id, ind.id, e.target.value)}
                                placeholder="Catatan (opsional)"
                                rows={2}
                                className="text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <div className="fixed bottom-16 left-0 right-0 mx-auto max-w-md px-page-x">
        <Button
          onClick={publishAll}
          disabled={publishing}
          className="w-full"
          size="lg"
        >
          {publishing ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" /> Mempublikasikan...
            </>
          ) : (
            <>
              <Send size={16} className="mr-2" /> Publikasikan rapor
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
