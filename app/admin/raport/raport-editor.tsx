"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { templateFor } from "@/lib/raport/templates";
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
type TemplateGridPayload = {
  bucketed: Record<string, string>;
  closing: Record<string, string>;
  filledCount: number;
  totalSlots: number;
};
type Payload = {
  student: { id: string; name: string; nickname: string | null };
  term: { id: string; number: number; semesterNumber: number; academicYear: string };
  ageGroup: "A" | "B" | null;
  /** Bank narasi for this student's cohort; null when no active enrolment. */
  templates: TemplateGridPayload | null;
  saved: Saved;
  measurement: { heightCm: string | null; weightKg: string | null } | null;
  draft: Draft;
};

/** Every field the admin can edit — snapshotted on load and after save so
 * dirty-state comparison covers narratives, capaian levels, attendance,
 * hafalan and measurements alike. */
type EditableSnapshot = {
  levels: Record<string, string>;
  narratives: Record<string, string>;
  att: { permitted: string; sick: string; unexcused: string; total: string };
  hafalan: string;
  height: string;
  weight: string;
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
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // Snapshot of the last-loaded (or last-saved) values. `null` until the
  // first load resolves, so the editor is never dirty before there's
  // anything to compare against.
  const [baseline, setBaseline] = useState<EditableSnapshot | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Structural comparison against the snapshot — every field is a string or
  // a flat record of strings, so JSON equality is exact and order-stable
  // (the records are always built by iterating the same fixed section/field
  // lists, in load() and here alike).
  const isDirty = useMemo(() => {
    if (!baseline) return false;
    const current: EditableSnapshot = { levels, narratives, att, hafalan, height, weight };
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [baseline, levels, narratives, att, hafalan, height, weight]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom strings but `returnValue` is still the
      // canonical signal that a confirm dialog should fire.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setConfirmLeave(true);
      return;
    }
    onBack();
  }, [isDirty, onBack]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/raport/${studentId}/${termId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Gagal memuat rapor.");
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

      // Narratives: saved text wins; otherwise fall back to the cohort's
      // bank narasi for the level we just initialised. Only ever fills an EMPTY
      // field, so re-opening a saved raport never rewrites authored text.
      const initNarr: Record<string, string> = {};
      for (const s of [...BUCKETED_SECTIONS, ...CLOSING_SECTIONS]) {
        const savedText = p.saved?.sectionNarratives?.[s] ?? "";
        initNarr[s] =
          savedText ||
          (p.templates ? (templateFor(p.templates, s, initLevels[s]) ?? "") : "");
      }
      setNarratives(initNarr);

      const a = p.saved ?? p.draft.attendance;
      const initAtt = {
        permitted: String(a.permittedAbsenceDays ?? 0),
        sick: String(a.sickDays ?? 0),
        unexcused: String(a.unexcusedAbsenceDays ?? 0),
        total: String(a.totalSchoolDays ?? 0),
      };
      setAtt(initAtt);
      const initHafalan = p.saved?.memorizationNotes ?? "";
      const initHeight = p.measurement?.heightCm ?? "";
      const initWeight = p.measurement?.weightKg ?? "";
      setHafalan(initHafalan);
      setHeight(initHeight);
      setWeight(initWeight);
      setStatus(p.saved?.status ?? "NONE");
      setBaseline({
        levels: initLevels,
        narratives: initNarr,
        att: initAtt,
        hafalan: initHafalan,
        height: initHeight,
        weight: initWeight,
      });
    } catch {
      setError("Gagal memuat rapor.");
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
        toast.error(body.error ?? "Gagal menyimpan rapor.");
        return false;
      }
      if (status === "NONE") setStatus("DRAFT");
      // Re-baseline against what was just saved — a saved editor is clean
      // even though the field states themselves haven't changed shape.
      setBaseline({ levels, narratives, att, hafalan, height, weight });
      toast.success("Rapor disimpan.");
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
      toast.success(publish ? "Rapor diterbitkan." : "Penerbitan ditarik.");
    } finally {
      setPublishing(false);
    }
  };

  if (error) {
    return (
      <div>
        <BackBar onBack={handleBack} />
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
        <BackBar onBack={handleBack} />
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={handleBack} />
      <PageHeader
        title={`Rapor — ${data.student.name}`}
        description={`Triwulan ${data.term.number} · Semester ${data.term.semesterNumber} · ${data.term.academicYear}`}
      />

      <div className="flex items-center gap-2 mb-6">
        <StatusBadge status={status} label={status === "NONE" ? "Belum disimpan" : undefined} />
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
            templateText={
              data.templates ? templateFor(data.templates, s, levels[s]) : null
            }
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
            templateText={data.templates ? templateFor(data.templates, s, null) : null}
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
          <NumField id="absence-sick" label="Sakit" value={att.sick} onChange={(v) => setAtt((p) => ({ ...p, sick: v }))} />
          <NumField id="absence-permitted" label="Izin" value={att.permitted} onChange={(v) => setAtt((p) => ({ ...p, permitted: v }))} />
          <NumField id="absence-unexcused" label="Alpa" value={att.unexcused} onChange={(v) => setAtt((p) => ({ ...p, unexcused: v }))} />
          <NumField id="absence-total" label="Hari sekolah" value={att.total} onChange={(v) => setAtt((p) => ({ ...p, total: v }))} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mt-4">
          {/* StudentMeasurement.height/weight are nullable and publish
              succeeds with both blank — the asterisk was claiming otherwise. */}
          <NumField id="measurement-height" label="Tinggi (cm)" value={height} onChange={setHeight} step="0.1" optional />
          <NumField id="measurement-weight" label="Berat (kg)" value={weight} onChange={setWeight} step="0.1" optional />
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
          <Button variant="destructive" onClick={() => setConfirmUnpublish(true)} disabled={publishing}>
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

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent className="p-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle>
            <AlertDialogDescription>
              Narasi, capaian, kehadiran, hafalan, atau data lain yang belum disimpan akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmLeave(false);
                onBack();
              }}
            >
              Ya, Keluar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <AlertDialogContent className="p-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Tarik penerbitan rapor?</AlertDialogTitle>
            <AlertDialogDescription>
              Rapor akan kembali menjadi draft dan tidak terlihat sebagai rapor terbit sampai diterbitkan ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmUnpublish(false);
                void setPublish(false);
              }}
            >
              Ya, Tarik
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function SectionField({
  section,
  hasLevel,
  level,
  onLevel,
  narrative,
  onNarrative,
  suggestion,
  templateText,
}: {
  section: ReportSectionKey;
  hasLevel: boolean;
  level: string;
  onLevel: (v: string) => void;
  narrative: string;
  onNarrative: (v: string) => void;
  suggestion: { suggested: RaportLevel | null; counts: ElementCounts } | null;
  /** Cohort bank narasi for the currently selected level, if any. */
  templateText: string | null;
}) {
  // Offer the action only when it would change something — no point showing
  // "Pakai narasi" when the field already holds exactly that text.
  const canApplyTemplate =
    templateText !== null && templateText.trim() !== narrative.trim();
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
      {canApplyTemplate ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onNarrative(templateText)}
        >
          {narrative.trim() ? "Ganti dengan narasi" : "Pakai narasi"}
        </Button>
      ) : null}
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  step,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  /** Drops the asterisk and the required/aria-required attributes. */
  optional?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} required={!optional}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min="0"
        step={step}
        required={!optional}
        aria-required={optional ? undefined : "true"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
