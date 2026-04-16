"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Send } from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

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

const SCORE_COLORS: Record<string, string> = {
  BB: "bg-red-100 text-red-700 border-red-200",
  MB: "bg-orange-100 text-orange-700 border-orange-200",
  BSH: "bg-blue-100 text-blue-700 border-blue-200",
  BSB: "bg-green-100 text-green-700 border-green-200",
};

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function ScoresPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = searchParams.get("id");

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scoreMap, setScoreMap] = useState<Record<string, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!assessmentId) { setLoading(false); return; }
    fetch(`/api/assessments/student/${assessmentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Assessment) => {
        setAssessment(data);
        // Initialize score map from existing scores
        const sMap: Record<string, string> = {};
        const nMap: Record<string, string> = {};
        for (const s of data.scores) {
          if (s.score) sMap[s.indicatorId] = s.score;
          if (s.notes) nMap[s.indicatorId] = s.notes;
        }
        setScoreMap(sMap);
        setNotesMap(nMap);
      })
      .catch(() => toast.error("Penilaian tidak ditemukan"))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  async function handleSave(publish: boolean) {
    if (!assessment) return;
    setSaving(true);
    const scores = Object.entries(scoreMap).map(([indicatorId, score]) => ({
      indicatorId,
      score,
      notes: notesMap[indicatorId] || null,
    }));
    const res = await fetch(`/api/assessments/student/${assessment.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores, status: publish ? "PUBLISHED" : undefined }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menyimpan"); setSaving(false); return; }
    toast.success(publish ? "Penilaian dipublikasi" : "Nilai disimpan");
    setSaving(false);
    if (publish) {
      setAssessment({ ...assessment, status: "PUBLISHED" });
    }
  }

  if (loading) return <Skeleton className="h-96 rounded-xl" />;

  if (!assessment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Penilaian Siswa" description="Pilih penilaian dari halaman daftar" />
        <Card className="p-8 text-center text-muted-foreground">
          <p className="text-sm">Tidak ada penilaian yang dipilih. Kembali ke daftar penilaian.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/assessments")}>
            <ArrowLeft size={14} className="mr-1.5" /> Kembali
          </Button>
        </Card>
      </div>
    );
  }

  const totalIndicators = assessment.template.categories.reduce((s, c) => s + c.indicators.length, 0);
  const scoredCount = Object.keys(scoreMap).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${assessment.student.name}${assessment.student.nickname ? ` (${assessment.student.nickname})` : ""}`}
        description={`${assessment.template.name} · ${assessment.template.program.name} · ${assessment.period}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/assessments")}>
              <ArrowLeft size={14} className="mr-1.5" /> Kembali
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              <Save size={14} className="mr-1.5" /> {saving ? "Menyimpan..." : "Simpan Draf"}
            </Button>
            {assessment.status !== "PUBLISHED" && (
              <Button onClick={() => handleSave(true)} disabled={saving}>
                <Send size={14} className="mr-1.5" /> Publikasi
              </Button>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-2">
        <Badge variant={assessment.status === "PUBLISHED" ? "default" : "secondary"}>
          {assessment.status === "PUBLISHED" ? "Dipublikasi" : "Draf"}
        </Badge>
        <span className="text-xs text-muted-foreground">{scoredCount}/{totalIndicators} indikator dinilai</span>
      </div>

      {assessment.template.categories.map((cat) => (
        <Card key={cat.id} className="p-4">
          <h3 className="text-sm font-semibold mb-3">{cat.name}</h3>
          <div className="space-y-3">
            {cat.indicators.map((ind) => (
              <div key={ind.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-border last:border-0">
                <span className="text-sm flex-1">{ind.description}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1">
                    {SCORE_OPTIONS.map((opt) => {
                      const selected = scoreMap[ind.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          title={opt.desc}
                          onClick={() => setScoreMap({ ...scoreMap, [ind.id]: opt.value })}
                          className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
                            selected
                              ? SCORE_COLORS[opt.value]
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    className="w-32 text-xs h-8"
                    placeholder="Catatan"
                    value={notesMap[ind.id] || ""}
                    onChange={(e) => setNotesMap({ ...notesMap, [ind.id]: e.target.value })}
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
