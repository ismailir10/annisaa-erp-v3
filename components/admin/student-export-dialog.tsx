"use client";

/**
 * Siswa data export configurator.
 *
 * Opened from the Students list PageHeader. Admin narrows row criteria
 * (status / gender / tahun ajaran / program / kelas) and picks which columns
 * to include (4 groups, per-group select-all), then downloads a filtered CSV
 * from `GET /api/students/export`.
 *
 * Overlay rule (ui.md): Dialog on desktop, Sheet on mobile — same body.
 * Cross-checked against design-system.html (Overlays §: Dialog/Sheet) for
 * shell + button placement.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Field, FieldLabel } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/section-heading";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  STUDENT_EXPORT_COLUMNS,
  EXPORT_GROUP_LABELS,
  ALL_EXPORT_COLUMN_KEYS,
  type ExportColumnGroup,
} from "@/lib/students/export";

type RefItem = { id: string; name: string; programId?: string; academicYearId?: string };

const GROUP_ORDER: ExportColumnGroup[] = ["identity", "compliance", "enrollment", "guardian"];

const EXPORT_STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "ACTIVE", label: "Aktif" },
  { value: "INACTIVE", label: "Tidak Aktif" },
  { value: "GRADUATED", label: "Lulus" },
  { value: "WITHDRAWN", label: "Keluar" },
];
const GENDER_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "L", label: "Laki-laki" },
  { value: "P", label: "Perempuan" },
];

const TOTAL_COLUMNS = ALL_EXPORT_COLUMN_KEYS.length;

export function StudentExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();

  // Row criteria
  const [status, setStatus] = useState("all");
  const [gender, setGender] = useState("all");
  const [academicYearId, setAcademicYearId] = useState("all");
  const [programId, setProgramId] = useState("all");
  const [classSectionId, setClassSectionId] = useState("all");

  // Column selection — every column on by default.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ALL_EXPORT_COLUMN_KEYS));

  // Reference data for the criteria dropdowns.
  const [years, setYears] = useState<RefItem[]>([]);
  const [programs, setPrograms] = useState<RefItem[]>([]);
  const [sections, setSections] = useState<RefItem[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(false);

  useEffect(() => {
    if (!open || refsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [yRes, pRes, sRes] = await Promise.all([
          fetch("/api/academic-years"),
          fetch("/api/programs"),
          fetch("/api/class-sections"),
        ]);
        const [y, p, s] = await Promise.all([yRes.json(), pRes.json(), sRes.json()]);
        if (cancelled) return;
        setYears(Array.isArray(y) ? y : []);
        setPrograms(Array.isArray(p) ? p : []);
        setSections(Array.isArray(s) ? s : []);
        setRefsLoaded(true);
      } catch {
        if (!cancelled) toast.error("Gagal memuat pilihan filter");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refsLoaded]);

  // Kelas options narrow to the chosen program / year. Changing program or
  // year resets the kelas pick inline (in the Select onValueChange handlers
  // below) rather than via an effect — a synchronous setState in an effect
  // trips the react-hooks/set-state-in-effect lint rule.
  const filteredSections = useMemo(
    () =>
      sections.filter(
        (s) =>
          (programId === "all" || s.programId === programId) &&
          (academicYearId === "all" || s.academicYearId === academicYearId),
      ),
    [sections, programId, academicYearId],
  );

  const columnsByGroup = useMemo(() => {
    const map = new Map<ExportColumnGroup, typeof STUDENT_EXPORT_COLUMNS[number][]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const col of STUDENT_EXPORT_COLUMNS) map.get(col.group)!.push(col);
    return map;
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(
    (group: ExportColumnGroup, on: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const col of columnsByGroup.get(group) ?? []) {
          if (on) next.add(col.key);
          else next.delete(col.key);
        }
        return next;
      });
    },
    [columnsByGroup],
  );

  const handleDownload = useCallback(() => {
    if (selected.size === 0) return;
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (gender !== "all") params.set("gender", gender);
    if (academicYearId !== "all") params.set("academicYearId", academicYearId);
    if (programId !== "all") params.set("programId", programId);
    if (classSectionId !== "all") params.set("classSectionId", classSectionId);
    // Omit `columns` when every column is selected — the server defaults to all.
    if (selected.size < TOTAL_COLUMNS) {
      params.set("columns", ALL_EXPORT_COLUMN_KEYS.filter((k) => selected.has(k)).join(","));
    }
    const qs = params.toString();
    const a = document.createElement("a");
    a.href = qs ? `/api/students/export?${qs}` : "/api/students/export";
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Unduhan data siswa dimulai");
    onOpenChange(false);
  }, [selected, status, gender, academicYearId, programId, classSectionId, onOpenChange]);

  const body = (
    <div className="space-y-6">
      {/* Row criteria */}
      <div className="space-y-field">
        <SectionHeading label="Kriteria Siswa" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Jenis Kelamin</FieldLabel>
            <Select value={gender} onValueChange={(v) => setGender(v ?? "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Tahun Ajaran</FieldLabel>
            <Select
              value={academicYearId}
              onValueChange={(v) => {
                setAcademicYearId(v ?? "all");
                setClassSectionId("all");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua Tahun Ajaran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tahun Ajaran</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Program</FieldLabel>
            <Select
              value={programId}
              onValueChange={(v) => {
                setProgramId(v ?? "all");
                setClassSectionId("all");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Program</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Kelas</FieldLabel>
            <Select value={classSectionId} onValueChange={(v) => setClassSectionId(v ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {filteredSections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* Column selection */}
      <div className="space-y-field">
        <SectionHeading label="Kolom Data" />
        <div className="space-y-4">
          {GROUP_ORDER.map((group) => {
            const cols = columnsByGroup.get(group) ?? [];
            const allOn = cols.every((c) => selected.has(c.key));
            return (
              <div key={group} className="rounded-md border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={allOn}
                    onCheckedChange={(checked) => toggleGroup(group, checked === true)}
                  />
                  {EXPORT_GROUP_LABELS[group]}
                </label>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pl-6">
                  {cols.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Checkbox
                        checked={selected.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      {col.header}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const downloadDisabled = selected.size === 0;
  const downloadButton = (
    <Button onClick={handleDownload} disabled={downloadDisabled}>
      <Download size={14} className="mr-1.5" />
      Unduh CSV{selected.size > 0 ? ` (${selected.size} kolom)` : ""}
    </Button>
  );
  const title = "Unduh Data Siswa";
  const description = "Pilih kriteria siswa dan kolom data, lalu unduh sebagai berkas CSV.";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4">{body}</div>
          <SheetFooter>{downloadButton}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{downloadButton}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
