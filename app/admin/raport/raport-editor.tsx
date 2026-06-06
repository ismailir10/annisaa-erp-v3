"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import {
  BUCKETED_SECTIONS,
  CLOSING_SECTIONS,
  SECTION_LABELS,
  SECTION_HAS_SUGGESTION,
  LEVEL_LABELS,
  LEVEL_ORDER,
  LEVEL_SHORT,
  type BucketedSection,
  type ReportSectionKey,
  type RaportLevel,
} from "@/lib/raport/labels";

type ElementCounts = {
  CONSISTENT: number;
  EMERGING: number;
  NEEDS_REINFORCEMENT: number;
  total: number;
};
type Draft = {
  sections: Record<BucketedSection, { suggested: RaportLevel | null; counts: ElementCounts }>;
  attendance: {
    permittedAbsenceDays: number;
    sickDays: number;
    unexcusedAbsenceDays: number;
    totalSchoolDays: number;
  };
};
type Saved = {
  sectionLevels: Record<string, RaportLevel>;
  sectionNarratives: Record<string, string>;
  permittedAbsenceDays: number;
  sickDays: number;
  unexcusedAbsenceDays: number;
  totalSchoolDays: number;
  memorizationNotes: string | null;
  status: string;
  publishedAt: string | null;
} | null;
type Payload = {
  student: { id: string; name: string; nickname: string | null };
  term: { id: string; number: number; semesterNumber: number; academicYear: string };
  saved: Saved;
  measurement: { heightCm: string | null; weightKg: string | null } | null;
  draft: Draft;
};

export function RaportEditor({
  studentId,
  termId,
  onBack,
}: {
  studentId: string;
  termId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [narratives, setNarratives] = useState<Record<string, string>>({});
  const [att, setAtt] = useState({ permitted: "0", sick: "0", unexcused: "0", total: "0" });
  const [hafalan, setHafalan] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [status, setStatus] = useState("NONE");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/raport/${studentId}/${termId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Gagal memuat raport.");
        return;
      }
      const json = (await res.json()) as { data: Payload };
      const p = json.data;
      setData(p);

      const initLevels: Record<string, string> = {};
      for (const s of BUCKETED_SECTIONS) {
        if (!SECTION_HAS_SUGGESTION[s]) continue;
        initLevels[s] = p.saved?.sectionLevels?.[s] ?? p.draft.sections[s]?.suggested ?? "";
      }
      setLevels(initLevels);

      const initNarr: Record<string, string> = {};
      for (const s of [...BUCKETED_SECTIONS, ...CLOSING_SECTIONS]) {
        initNarr[s] = p.saved?.sectionNarratives?.[s] ?? "";
      }
      setNarratives(initNarr);

      const a = p.saved ?? p.draft.attendance;
      setAtt({
        permitted: String(a.permittedAbsenceDays ?? 0),
        sick: String(a.sickDays ?? 0),
        unexcused: String(a.unexcusedAbsenceDays ?? 0),
        total: String(a.totalSchoolDays ?? 0),
      });
      setHafalan(p.saved?.memorizationNotes ?? "");
      setHeight(p.measurement?.heightCm ?? "");
      setWeight(p.measurement?.weightKg ?? "");
      setStatus(p.saved?.status ?? "NONE");
    } catch {
      setError("Gagal memuat raport.");
    }
  }, [studentId, termId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const sectionLevels: Record<string, string> = {};
      for (const [k, v] of Object.entries(levels)) if (v) sectionLevels[k] = v;
      const sectionNarratives: Record<string, string> = {};
      for (const [k, v] of Object.entries(narratives)) if (v.trim()) sectionNarratives[k] = v.trim();

      const res = await fetch(`/api/admin/raport/${studentId}/${termId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionLevels,
          sectionNarratives,
          permittedAbsenceDays: Number(att.permitted) || 0,
          sickDays: Number(att.sick) || 0,
          unexcusedAbsenceDays: Number(att.unexcused) || 0,
          totalSchoolDays: Number(att.total) || 0,
          memorizationNotes: hafalan.trim() || null,
          heightCm: height ? Number(height) : null,
          weightKg: weight ? Number(weight) : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Gagal menyimpan raport.");
        return false;
      }
      if (status === "NONE") setStatus("DRAFT");
      toast.success("Raport disimpan.");
      return true;
    } finally {
      setSaving(false);
    }
  };

  const setPublish = async (publish: boolean) => {
    setPublishing(true);
    try {
      // Persist current edits first so publish acts on what the admin sees.
      if (publish && !(await save())) return;
      const res = await fetch(
        `/api/admin/raport/${studentId}/${termId}/${publish ? "publish" : "unpublish"}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Gagal mengubah status terbit.");
        return;
      }
      setStatus(publish ? "PUBLISHED" : "DRAFT");
      toast.success(publish ? "Raport diterbitkan." : "Penerbitan ditarik.");
    } finally {
      setPublishing(false);
    }
  };

  if (error) {
    return (
      <div>
        <BackBar onBack={onBack} />
        <Card className="p-card">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>
            Coba lagi
          </Button>
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <BackBar onBack={onBack} />
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} />
      <PageHeader
        title={`Raport — ${data.student.name}`}
        description={`Triwulan ${data.term.number} · Semester ${data.term.semesterNumber} · ${data.term.academicYear}`}
      />

      <div className="flex items-center gap-2 mb-6">
        <StatusBadge status={status} />
        {data.saved?.publishedAt && status === "PUBLISHED" ? (
          <span className="text-xs text-muted-foreground">Terbit</span>
        ) : null}
      </div>

      {/* Narrative sections */}
      <Card className="p-card mb-6 space-y-6">
        <h2 className="text-h2 font-semibold">Narasi Perkembangan</h2>
        {BUCKETED_SECTIONS.map((s) => (
          <SectionField
            key={s}
            section={s}
            hasLevel={SECTION_HAS_SUGGESTION[s]}
            level={levels[s] ?? ""}
            onLevel={(v) => setLevels((p) => ({ ...p, [s]: v }))}
            narrative={narratives[s] ?? ""}
            onNarrative={(v) => setNarratives((p) => ({ ...p, [s]: v }))}
            suggestion={data.draft.sections[s]}
          />
        ))}
        {CLOSING_SECTIONS.map((s) => (
          <SectionField
            key={s}
            section={s}
            hasLevel={false}
            level=""
            onLevel={() => {}}
            narrative={narratives[s] ?? ""}
            onNarrative={(v) => setNarratives((p) => ({ ...p, [s]: v }))}
            suggestion={null}
          />
        ))}
      </Card>

      {/* Attendance + measurements + hafalan */}
      <Card className="p-card mb-6">
        <h2 className="text-h2 font-semibold mb-1">Kehadiran & Catatan</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Kehadiran terisi otomatis dari data presensi pada rentang triwulan — sunting bila perlu.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumField label="Sakit" value={att.sick} onChange={(v) => setAtt((p) => ({ ...p, sick: v }))} />
          <NumField label="Izin" value={att.permitted} onChange={(v) => setAtt((p) => ({ ...p, permitted: v }))} />
          <NumField label="Alpa" value={att.unexcused} onChange={(v) => setAtt((p) => ({ ...p, unexcused: v }))} />
          <NumField label="Hari sekolah" value={att.total} onChange={(v) => setAtt((p) => ({ ...p, total: v }))} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-4">
          <NumField label="Tinggi (cm)" value={height} onChange={setHeight} step="0.1" />
          <NumField label="Berat (kg)" value={weight} onChange={setWeight} step="0.1" />
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="hafalan">Hafalan (surah / hadis / doa)</FieldLabel>
          <Textarea id="hafalan" rows={3} value={hafalan} onChange={(e) => setHafalan(e.target.value)} />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || publishing}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
        {status === "PUBLISHED" ? (
          <Button variant="outline" onClick={() => setPublish(false)} disabled={publishing}>
            Tarik penerbitan
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setPublish(true)} disabled={publishing}>
            {publishing ? "Memproses…" : "Simpan & Terbitkan"}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => window.open(`/api/admin/raport/${studentId}/${termId}/pdf`, "_blank")}
          disabled={status === "NONE"}
        >
          <Download className="size-4" /> Unduh PDF
        </Button>
      </div>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={onBack}>
      <ArrowLeft className="size-4" /> Kembali ke daftar
    </Button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return (
      <Badge variant="outline" className="bg-status-present/10 text-status-present border-status-present/20">
        Terbit
      </Badge>
    );
  }
  if (status === "DRAFT") {
    return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Draft</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Belum disimpan</Badge>;
}

function SectionField({
  section,
  hasLevel,
  level,
  onLevel,
  narrative,
  onNarrative,
  suggestion,
}: {
  section: ReportSectionKey;
  hasLevel: boolean;
  level: string;
  onLevel: (v: string) => void;
  narrative: string;
  onNarrative: (v: string) => void;
  suggestion: { suggested: RaportLevel | null; counts: ElementCounts } | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={`narr-${section}`}>{SECTION_LABELS[section]}</FieldLabel>
        {hasLevel ? (
          <div className="flex items-center gap-2">
            {suggestion && suggestion.counts.total > 0 ? (
              <span className="text-xs text-muted-foreground">
                Saran:{" "}
                {suggestion.suggested ? LEVEL_LABELS[suggestion.suggested] : "—"} (
                {LEVEL_ORDER.map((l) => `${suggestion.counts[l]}${LEVEL_SHORT[l]}`).join(" · ")})
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Belum ada penilaian</span>
            )}
            <NativeSelect
              size="sm"
              aria-label={`Capaian ${SECTION_LABELS[section]}`}
              value={level}
              onChange={(e) => onLevel(e.target.value)}
            >
              <NativeSelectOption value="">— Capaian —</NativeSelectOption>
              {LEVEL_ORDER.map((l) => (
                <NativeSelectOption key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      <Textarea
        id={`narr-${section}`}
        rows={3}
        value={narrative}
        onChange={(e) => onNarrative(e.target.value)}
        placeholder={`Tulis narasi ${SECTION_LABELS[section].toLowerCase()}…`}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
