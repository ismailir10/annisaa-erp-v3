"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Naik Kelas Massal — bulk class promotion dialog. Wires the previously
 * UI-less GET/POST /api/promotions: pick a source class, preview its ACTIVE
 * roster, untick students to hold back, pick a target class (any academic
 * year — year-end promotion crosses years), execute. Capacity is re-checked
 * row-locked server-side; the hint here is advisory so the admin sees the
 * problem before submitting.
 */

type AcademicYear = { id: string; name: string; status: string };

type SectionOption = {
  id: string;
  name: string;
  capacity: number;
  enrolledCount: number;
};

type RosterStudent = {
  enrollmentId: string;
  id: string;
  name: string;
  nickname: string | null;
  nis: string | null;
};

async function fetchSections(yearId: string): Promise<SectionOption[]> {
  const params = new URLSearchParams({
    yearId,
    pageSize: "100",
    status: "ACTIVE",
  });
  const res = await fetch(`/api/admin/classes?${params}`);
  if (!res.ok) throw new Error("Gagal memuat daftar kelas");
  const j = await res.json().catch(() => null);
  const rows = Array.isArray(j?.data) ? j.data : [];
  return rows.map(
    (r: { id: string; name: string; capacity: number; enrolledCount: number }) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      enrolledCount: r.enrolledCount,
    }),
  );
}

export function BulkPromoteDialog({
  open,
  onOpenChange,
  years,
  defaultSourceYearId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  years: AcademicYear[];
  defaultSourceYearId: string;
  onDone: () => void;
}) {
  const [sourceYearId, setSourceYearId] = useState(defaultSourceYearId);
  const [targetYearId, setTargetYearId] = useState(defaultSourceYearId);
  const [sourceSections, setSourceSections] = useState<SectionOption[]>([]);
  const [targetSections, setTargetSections] = useState<SectionOption[]>([]);
  const [sourceClassId, setSourceClassId] = useState("");
  const [targetClassId, setTargetClassId] = useState("");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [rosterLoading, setRosterLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything each time the dialog opens (fresh promotion run).
  useEffect(() => {
    if (open) {
      setSourceYearId(defaultSourceYearId);
      setTargetYearId(defaultSourceYearId);
      setSourceClassId("");
      setTargetClassId("");
      setRoster([]);
      setExcluded(new Set());
      setError(null);
    }
  }, [open, defaultSourceYearId]);

  // Load section options per selected year. Cancellation mirrors the roster
  // effect below — a slow earlier-year response must not overwrite the
  // currently selected year's options.
  useEffect(() => {
    if (!open || !sourceYearId) return;
    let cancelled = false;
    fetchSections(sourceYearId)
      .then((s) => {
        if (!cancelled) setSourceSections(s);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Gagal memuat data");
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceYearId]);

  useEffect(() => {
    if (!open || !targetYearId) return;
    let cancelled = false;
    fetchSections(targetYearId)
      .then((s) => {
        if (!cancelled) setTargetSections(s);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Gagal memuat data");
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetYearId]);

  // Roster preview for the chosen source class.
  useEffect(() => {
    if (!sourceClassId) {
      setRoster([]);
      setExcluded(new Set());
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    setError(null);
    fetch(`/api/promotions?sourceClassSectionId=${sourceClassId}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Gagal memuat daftar siswa");
        }
        return res.json();
      })
      .then((j) => {
        if (cancelled) return;
        setRoster(Array.isArray(j.students) ? j.students : []);
        setExcluded(new Set());
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Gagal memuat data");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceClassId]);

  const selectedCount = roster.length - excluded.size;

  const targetSection = useMemo(
    () => targetSections.find((s) => s.id === targetClassId),
    [targetSections, targetClassId],
  );
  const available = targetSection
    ? targetSection.capacity - targetSection.enrolledCount
    : null;
  const overCapacity = available !== null && selectedCount > available;

  const toggleStudent = useCallback((studentId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }, []);

  async function submit() {
    if (!sourceClassId || !targetClassId) {
      setError("Kelas asal dan kelas tujuan wajib dipilih");
      return;
    }
    if (sourceClassId === targetClassId) {
      setError("Kelas tujuan harus berbeda dari kelas asal");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceClassSectionId: sourceClassId,
          targetClassSectionId: targetClassId,
          excludeStudentIds: Array.from(excluded),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Gagal memproses naik kelas");
        return;
      }
      toast.success(
        `${j.promoted} siswa naik kelas${j.skipped ? `, ${j.skipped} ditahan` : ""}`,
      );
      onOpenChange(false);
      onDone();
    } catch {
      setError("Gagal memproses naik kelas. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const yearLabel = (y: AcademicYear) =>
    `${y.name}${y.status === "ACTIVE" ? " · Aktif" : y.status === "PLANNING" ? " · Rencana" : y.status === "ARCHIVED" ? " · Arsip" : ""}`;

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
      title="Naik Kelas Massal"
      description="Pindahkan seluruh siswa aktif satu kelas ke kelas tujuan. Hilangkan centang untuk menahan siswa di kelas lama."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !sourceClassId || !targetClassId || selectedCount === 0}
          >
            {submitting ? "Memproses..." : `Naik Kelas (${selectedCount} siswa)`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field>
          <FieldLabel>Tahun Ajaran Asal</FieldLabel>
          <Select value={sourceYearId} onValueChange={(v) => { if (v) { setSourceYearId(v); setSourceClassId(""); } }}>
            <SelectTrigger><SelectValue placeholder="Pilih tahun" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>{yearLabel(y)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Kelas Asal</FieldLabel>
          <Select value={sourceClassId} onValueChange={(v) => setSourceClassId(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
            <SelectContent>
              {sourceSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.enrolledCount} siswa)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tahun Ajaran Tujuan</FieldLabel>
          <Select value={targetYearId} onValueChange={(v) => { if (v) { setTargetYearId(v); setTargetClassId(""); } }}>
            <SelectTrigger><SelectValue placeholder="Pilih tahun" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>{yearLabel(y)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Kelas Tujuan</FieldLabel>
          <Select value={targetClassId} onValueChange={(v) => setTargetClassId(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
            <SelectContent>
              {targetSections
                .filter((s) => s.id !== sourceClassId)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} (sisa {Math.max(s.capacity - s.enrolledCount, 0)} kursi)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {targetSection && (
        <p
          className={`text-xs ${overCapacity ? "text-destructive" : "text-muted-foreground"}`}
        >
          Kelas tujuan: {targetSection.enrolledCount}/{targetSection.capacity} terisi — sisa{" "}
          {Math.max(available ?? 0, 0)} kursi, dibutuhkan {selectedCount}.
          {overCapacity && " Kapasitas tidak cukup — kurangi siswa atau pilih kelas lain."}
        </p>
      )}

      <Field>
        <FieldLabel>
          Siswa yang naik kelas{roster.length > 0 ? ` (${selectedCount}/${roster.length})` : ""}
        </FieldLabel>
        {rosterLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {sourceClassId
              ? "Tidak ada siswa aktif di kelas ini."
              : "Pilih kelas asal untuk melihat daftar siswa."}
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <ul className="divide-y">
              {roster.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={`promote-${s.id}`}
                    checked={!excluded.has(s.id)}
                    onCheckedChange={() => toggleStudent(s.id)}
                  />
                  <label htmlFor={`promote-${s.id}`} className="flex-1 cursor-pointer text-sm">
                    {s.name}
                    {s.nis && (
                      <span className="ml-2 text-xs text-muted-foreground">NIS {s.nis}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </ResponsiveFormDialog>
  );
}
