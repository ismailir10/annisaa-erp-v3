"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { ArrowLeft, FileUp, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

type Semester = {
  id: string;
  number: 1 | 2;
  academicYearName: string;
  status: string;
};

type AgeGroup = "A" | "B";

type CurriculumElement =
  | "RELIGIOUS_MORAL"
  | "IDENTITY"
  | "STEAM"
  | "MOTOR_SKILLS"
  | "ART";

type PreviewIndicator = {
  order: number;
  content: string;
  themeNames: string[];
};
type PreviewObjective = {
  number: number;
  competencyText: string;
  content: string;
  indicators: PreviewIndicator[];
};
type Preview = {
  semesterId: string;
  ageGroup: AgeGroup;
  inferredAgeGroup: AgeGroup | null;
  filename: string;
  byElement: Partial<Record<CurriculumElement, PreviewObjective[]>>;
  counts: { objectives: number; indicators: number };
  conflicts: Array<{
    ageGroup: AgeGroup;
    element: CurriculumElement;
    number: number;
    existingContent: string;
  }>;
};

const ELEMENT_LABELS: Record<CurriculumElement, string> = {
  RELIGIOUS_MORAL: "Nilai Agama dan Budi Pekerti",
  IDENTITY: "Jati Diri",
  STEAM: "STEAM / Literasi",
  MOTOR_SKILLS: "Motorik",
  ART: "Seni",
};

const ELEMENT_ORDER: CurriculumElement[] = [
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "MOTOR_SKILLS",
  "ART",
];

function ageGroupFromFilename(name: string): AgeGroup | null {
  const upper = name.toUpperCase();
  if (/\bTK\s*A\b/.test(upper)) return "A";
  if (/\bTK\s*B\b/.test(upper)) return "B";
  return null;
}

export function ImportPromesClient({ semester }: { semester: Semester }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [stage, setStage] = useState<"upload" | "preview">("upload");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Ref-based race guard. The `disabled` prop on the commit button trails
  // a render tick behind `setCommitting(true)`, so a fast double-click
  // could otherwise queue two parallel commits before React disables the
  // affordance. The ref turns the second invocation into a no-op the
  // instant the first one starts.
  const committingRef = useRef(false);
  // Conflict-alert focus target. After the upload resolves with
  // `conflicts.length > 0` we move screen-reader focus here so the
  // destructive warning is announced instead of silently appearing at
  // the bottom of the preview.
  const conflictAlertRef = useRef<HTMLDivElement>(null);

  // Filename heuristic. Pre-selects the radio without locking it — admin
  // can override before submit.
  const filenameHint = file ? ageGroupFromFilename(file.name) : null;
  const effectiveAgeGroup = ageGroup ?? filenameHint;

  const conflicts = preview?.conflicts ?? [];
  const hasConflicts = conflicts.length > 0;
  const mismatchInferred = useMemo(() => {
    if (!preview || !preview.inferredAgeGroup) return false;
    return preview.inferredAgeGroup !== preview.ageGroup;
  }, [preview]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!file) {
      setFormError("Pilih berkas xlsx terlebih dahulu.");
      return;
    }
    if (!effectiveAgeGroup) {
      setFormError("Pilih Kelompok Usia (TK A atau TK B).");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("semesterId", semester.id);
      form.append("ageGroup", effectiveAgeGroup);
      const res = await fetch("/api/admin/curriculum/import-promes", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as Partial<Preview> & {
        error?: string;
        duplicates?: Array<{ element: CurriculumElement; number: number }>;
      };
      if (!res.ok && res.status !== 409) {
        const msg =
          body.error ??
          `Gagal mengunggah PROMES (status ${res.status}).`;
        setFormError(msg);
        setSubmitting(false);
        return;
      }
      // 200 OR 409 → both carry preview shape; we keep the admin on the
      // preview stage so they can see conflicts (if any).
      const previewBody = body as Preview;
      setPreview(previewBody);
      setStage("preview");
      // If conflicts surfaced, move keyboard + screen-reader focus to
      // the destructive alert so an SR user is not stranded at the top
      // of the page with silently appended danger content.
      if ((previewBody.conflicts?.length ?? 0) > 0) {
        // Defer to the next tick so the Alert has mounted.
        setTimeout(() => conflictAlertRef.current?.focus(), 0);
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gangguan jaringan saat unggah.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCommit() {
    if (committingRef.current || !file || !preview) return;
    committingRef.current = true;
    setFormError(null);
    setCommitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("semesterId", semester.id);
      form.append("ageGroup", preview.ageGroup);
      const res = await fetch(
        "/api/admin/curriculum/import-promes?commit=true",
        { method: "POST", body: form },
      );
      const body = (await res.json()) as {
        error?: string;
        counts?: { objectives: number; indicators: number };
      };
      if (!res.ok) {
        setFormError(body.error ?? `Gagal menyimpan (status ${res.status}).`);
        setCommitting(false);
        committingRef.current = false;
        return;
      }
      const objectives = body.counts?.objectives ?? 0;
      const indicators = body.counts?.indicators ?? 0;
      toast.success(
        `PROMES berhasil diimpor: ${objectives} tujuan pembelajaran, ${indicators} indikator.`,
      );
      router.push(`/admin/semesters/${semester.id}/themes`);
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gangguan jaringan saat simpan.",
      );
      setCommitting(false);
      committingRef.current = false;
    }
  }

  function handleReset() {
    setFile(null);
    setAgeGroup(null);
    setPreview(null);
    setStage("upload");
    setFormError(null);
  }

  return (
    <div className="space-y-section">
      <div>
        <Link
          href={`/admin/semesters/${semester.id}/themes`}
          className="inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Kembali ke{" "}
          {semester.academicYearName} · Semester {semester.number}
        </Link>
      </div>

      <PageHeader
        title="Impor PROMES"
        description={`Unggah berkas PROMES per Kelompok Usia untuk semester ${semester.academicYearName} · Semester ${semester.number}. Sistem akan menampilkan pratinjau sebelum menyimpan.`}
      />

      {stage === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Unggah berkas PROMES</CardTitle>
            <CardDescription>
              Format berkas <code>.xlsx</code>, maksimum 5 MB. Pratinjau
              tidak akan menyimpan apa pun ke basis data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-6">
              <Field>
                <FieldLabel htmlFor="promes-file">Berkas xlsx</FieldLabel>
                <Input
                  id="promes-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) =>
                    setFile(e.currentTarget.files?.[0] ?? null)
                  }
                  required
                />
                {file && filenameHint && !ageGroup && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Kelompok usia terdeteksi dari nama berkas:{" "}
                    <strong>TK {filenameHint}</strong>. Anda dapat mengubahnya
                    di bawah.
                  </p>
                )}
              </Field>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium leading-none">
                  Kelompok Usia
                </legend>
                <RadioGroup
                  value={effectiveAgeGroup ?? ""}
                  onValueChange={(v) => setAgeGroup(v as AgeGroup)}
                  aria-label="Kelompok Usia"
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="A" id="age-a" />
                    <Label htmlFor="age-a" className="cursor-pointer">
                      TK A (4–5 tahun)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="B" id="age-b" />
                    <Label htmlFor="age-b" className="cursor-pointer">
                      TK B (5–6 tahun)
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>

              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Tidak bisa melanjutkan</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={submitting}>
                <FileUp className="size-4" />
                {submitting ? "Mengunggah…" : "Pratinjau PROMES"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && preview && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle>Pratinjau {preview.filename}</CardTitle>
                  <CardDescription>
                    Kelompok Usia <strong>TK {preview.ageGroup}</strong> ·{" "}
                    {preview.counts.objectives} tujuan pembelajaran ·{" "}
                    {preview.counts.indicators} indikator.
                    {mismatchInferred && (
                      <>
                        {" "}
                        Sistem mendeteksi{" "}
                        <strong>TK {preview.inferredAgeGroup}</strong> dari isi
                        berkas — pastikan pilihan Anda benar.
                      </>
                    )}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={committing}
                >
                  <RefreshCcw className="size-4" /> Mulai ulang
                </Button>
              </div>
            </CardHeader>
          </Card>

          {hasConflicts && (
            <Alert
              ref={conflictAlertRef}
              tabIndex={-1}
              role="alert"
              variant="destructive"
            >
              <AlertTitle>
                {conflicts.length} konflik dengan tujuan pembelajaran yang
                sudah ada
              </AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  Berkas ini tidak bisa disimpan apa adanya. Selesaikan
                  konflik dengan menghapus baris bermasalah dari berkas atau
                  memilih semester lain, lalu unggah ulang.
                </p>
                <ul className="list-disc list-inside text-sm">
                  {conflicts.slice(0, 10).map((c) => (
                    <li key={`${c.element}-${c.number}`}>
                      TK {c.ageGroup} · {ELEMENT_LABELS[c.element]} · TP{" "}
                      {c.number}: <em>{c.existingContent}</em>
                    </li>
                  ))}
                  {conflicts.length > 10 && (
                    <li>… dan {conflicts.length - 10} konflik lainnya</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {ELEMENT_ORDER.map((element) => {
            const objectives = preview.byElement[element] ?? [];
            if (objectives.length === 0) return null;
            const visible = objectives.slice(0, 5);
            const remaining = objectives.length - visible.length;
            return (
              <Card key={element}>
                <CardHeader>
                  <CardTitle>{ELEMENT_LABELS[element]}</CardTitle>
                  <CardDescription>
                    {objectives.length} tujuan pembelajaran (TP) ·{" "}
                    {objectives.reduce(
                      (sum, o) => sum + o.indicators.length,
                      0,
                    )}{" "}
                    indikator
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visible.map((o) => (
                    <div
                      key={`${element}-${o.number}`}
                      className="border-l-2 border-muted pl-3"
                    >
                      <p className="text-sm font-medium">
                        TP {o.number}: {o.competencyText}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {o.content}
                      </p>
                      <ol className="mt-1 list-decimal list-inside text-xs space-y-0.5">
                        {o.indicators.map((i) => (
                          <li key={`${element}-${o.number}-${i.order}`}>
                            {i.content}
                            {i.themeNames.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                · tema: {i.themeNames.join(", ")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <p className="text-xs text-muted-foreground">
                      … dan {remaining} TP lainnya akan ikut disimpan.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>Gagal menyimpan</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleCommit}
              disabled={committing || hasConflicts}
            >
              {committing ? "Menyimpan…" : "Konfirmasi & simpan"}
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={committing}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
