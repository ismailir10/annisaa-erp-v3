"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertCircle, FileText, Copy } from "lucide-react";
import {
  BUCKETED_SECTIONS,
  CLOSING_SECTIONS,
  LEVEL_ORDER,
  LEVEL_LABELS,
  SECTION_LABELS,
  type RaportLevel,
} from "@/lib/raport/labels";
import { bucketKey, TOTAL_TEMPLATE_SLOTS } from "@/lib/raport/templates";

type Term = {
  id: string;
  number: number;
  semester: { number: number; academicYear: { name: string } };
};

type AgeGroup = "A" | "B";

function termLabel(t: Term) {
  return `Triwulan ${t.number} · Smt ${t.semester.number} ${t.semester.academicYear.name}`;
}

export default function RaportTemplatesPage() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [termId, setTermId] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("A");

  // Draft state for the whole grid; keys match the API's grid shape.
  const [bucketed, setBucketed] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cloneSourceTermId, setCloneSourceTermId] = useState("");
  const [cloneSourceAgeGroup, setCloneSourceAgeGroup] = useState<AgeGroup>("A");
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/terms");
        if (!res.ok) throw new Error("Gagal memuat daftar triwulan.");
        const body = (await res.json()) as { data?: Term[] };
        if (!alive) return;
        const rows = body.data ?? [];
        setTerms(rows);
        if (rows.length > 0) setTermId((cur) => cur || rows[0].id);
      } catch {
        if (alive) setTerms([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadGrid = useCallback(async () => {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/raport/templates?termId=${encodeURIComponent(termId)}&ageGroup=${ageGroup}`,
      );
      const body = (await res.json()) as {
        data?: { bucketed: Record<string, string>; closing: Record<string, string> };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Gagal memuat kisi-kisi.");
      setBucketed(body.data?.bucketed ?? {});
      setClosing(body.data?.closing ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat kisi-kisi.");
      setBucketed({});
      setClosing({});
    } finally {
      setLoading(false);
    }
  }, [termId, ageGroup]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  const filledCount = useMemo(
    () =>
      Object.values(bucketed).filter((v) => v.trim()).length +
      Object.values(closing).filter((v) => v.trim()).length,
    [bucketed, closing],
  );

  async function handleSave() {
    if (!termId) return;
    setSaving(true);
    try {
      const narratives = BUCKETED_SECTIONS.flatMap((section) =>
        LEVEL_ORDER.map((level) => ({
          section,
          level,
          content: bucketed[bucketKey(section, level)] ?? "",
        })),
      );
      const closings = CLOSING_SECTIONS.map((section) => ({
        section,
        content: closing[section] ?? "",
      }));
      const res = await fetch("/api/admin/raport/templates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termId, ageGroup, narratives, closings }),
      });
      const body = (await res.json()) as {
        data?: { written: number; cleared: number };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan kisi-kisi.");
      const written = body.data?.written ?? 0;
      const cleared = body.data?.cleared ?? 0;
      toast.success(
        cleared > 0
          ? `Kisi-kisi tersimpan: ${written} terisi, ${cleared} dikosongkan.`
          : `Kisi-kisi tersimpan: ${written} terisi.`,
      );
      await loadGrid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan kisi-kisi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClone() {
    if (!termId || !cloneSourceTermId) return;
    setCloning(true);
    try {
      const res = await fetch("/api/admin/raport/templates/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceTermId: cloneSourceTermId,
          sourceAgeGroup: cloneSourceAgeGroup,
          targetTermId: termId,
          targetAgeGroup: ageGroup,
        }),
      });
      const body = (await res.json()) as {
        data?: { copied: number; skipped: number };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Gagal menyalin kisi-kisi.");
      const copied = body.data?.copied ?? 0;
      const skipped = body.data?.skipped ?? 0;
      toast.success(
        skipped > 0
          ? `${copied} kisi-kisi disalin, ${skipped} dilewati karena sudah terisi.`
          : `${copied} kisi-kisi disalin.`,
      );
      await loadGrid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyalin kisi-kisi.");
    } finally {
      setCloning(false);
    }
  }

  const otherTerms = (terms ?? []).filter(
    (t) => !(t.id === termId && cloneSourceAgeGroup === ageGroup),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kisi-kisi Raport"
        description="Susun narasi sekali per triwulan dan kelompok usia. Saat menyusun raport siswa, narasi ini terpakai otomatis sesuai capaian yang dipilih."
        actions={
          <Link href="/admin/raport" className={cn(buttonVariants({ variant: "outline" }))}>
            Ke Raport Siswa
          </Link>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <Field className="min-w-56">
            <FieldLabel htmlFor="tmpl-term">Triwulan</FieldLabel>
            <NativeSelect
              id="tmpl-term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              {(terms ?? []).map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {termLabel(t)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="min-w-40">
            <FieldLabel htmlFor="tmpl-age">Kelompok usia</FieldLabel>
            <NativeSelect
              id="tmpl-age"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
            >
              <NativeSelectOption value="A">A (4–5 tahun)</NativeSelectOption>
              <NativeSelectOption value="B">B (5–6 tahun)</NativeSelectOption>
            </NativeSelect>
          </Field>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant={filledCount === TOTAL_TEMPLATE_SLOTS ? "default" : "secondary"}>
              {filledCount}/{TOTAL_TEMPLATE_SLOTS} terisi
            </Badge>
            <Button onClick={handleSave} disabled={saving || loading || !termId}>
              {saving ? "Menyimpan…" : "Simpan semua"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {terms !== null && terms.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Belum ada triwulan"
          description="Buat triwulan terlebih dahulu di halaman Raport sebelum menyusun kisi-kisi."
          actionLabel="Ke Raport Siswa"
          actionHref="/admin/raport"
        />
      )}

      {error && (
        <EmptyState
          icon={AlertCircle}
          title="Gagal memuat kisi-kisi"
          description={error}
          actionLabel="Coba lagi"
          onAction={() => void loadGrid()}
        />
      )}

      {loading && (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && !error && terms !== null && terms.length > 0 && (
        <>
          {BUCKETED_SECTIONS.map((section) => (
            <Card key={section}>
              <CardHeader>
                <CardTitle className="text-h2">{SECTION_LABELS[section]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {LEVEL_ORDER.map((level: RaportLevel) => {
                  const key = bucketKey(section, level);
                  const id = `tmpl-${section}-${level}`;
                  return (
                    <Field key={level}>
                      <FieldLabel htmlFor={id}>{LEVEL_LABELS[level]}</FieldLabel>
                      <Textarea
                        id={id}
                        rows={3}
                        value={bucketed[key] ?? ""}
                        placeholder={`Narasi untuk anak dengan capaian "${LEVEL_LABELS[level]}" pada ${SECTION_LABELS[section]}…`}
                        onChange={(e) =>
                          setBucketed((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </Field>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-h2">Penutup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CLOSING_SECTIONS.map((section) => {
                const id = `tmpl-${section}`;
                return (
                  <Field key={section}>
                    <FieldLabel htmlFor={id}>{SECTION_LABELS[section]}</FieldLabel>
                    <Textarea
                      id={id}
                      rows={3}
                      value={closing[section] ?? ""}
                      placeholder={`${SECTION_LABELS[section]} — berlaku untuk semua anak di kelompok ini…`}
                      onChange={(e) =>
                        setClosing((prev) => ({ ...prev, [section]: e.target.value }))
                      }
                    />
                  </Field>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-h2">Salin dari triwulan lain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Menyalin kisi-kisi dari triwulan lain ke triwulan ini. Slot yang
                sudah terisi di sini <strong>tidak</strong> akan tertimpa.
              </p>
              <div className="flex flex-wrap items-end gap-4">
                <Field className="min-w-56">
                  <FieldLabel htmlFor="clone-term">Triwulan sumber</FieldLabel>
                  <NativeSelect
                    id="clone-term"
                    value={cloneSourceTermId}
                    onChange={(e) => setCloneSourceTermId(e.target.value)}
                  >
                    <NativeSelectOption value="">Pilih triwulan…</NativeSelectOption>
                    {otherTerms.map((t) => (
                      <NativeSelectOption key={t.id} value={t.id}>
                        {termLabel(t)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field className="min-w-40">
                  <FieldLabel htmlFor="clone-age">Kelompok usia sumber</FieldLabel>
                  <NativeSelect
                    id="clone-age"
                    value={cloneSourceAgeGroup}
                    onChange={(e) => setCloneSourceAgeGroup(e.target.value as AgeGroup)}
                  >
                    <NativeSelectOption value="A">A (4–5 tahun)</NativeSelectOption>
                    <NativeSelectOption value="B">B (5–6 tahun)</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Button
                  variant="outline"
                  onClick={handleClone}
                  disabled={cloning || !cloneSourceTermId}
                >
                  <Copy className="size-4" />
                  {cloning ? "Menyalin…" : "Salin ke sini"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
