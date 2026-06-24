"use client";

// Frontend cross-check: dialog + row actions follow design-system.html
// (ResponsiveFormDialog overlay, Select, Button states). This page is a
// single "use client" component — no server wrapper to host the note.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Plus, BookOpen, Calendar, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

type AcademicYear = { id: string; name: string; startDate: string; endDate: string; status: string };
type Program = { id: string; code: string; name: string; description: string | null; type: string; ageMin: number | null; ageMax: number | null; status: string; _count: { classSections: number } };

const TYPE_LABELS: Record<string, string> = {
  SEMESTER: "Semester",
  YEAR_ROUND: "Sepanjang Tahun",
  SESSION: "Per Sesi",
};

export default function AcademicPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [yearDialog, setYearDialog] = useState(false);
  const [programDialog, setProgramDialog] = useState(false);
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [programForm, setProgramForm] = useState({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" });
  const [saving, setSaving] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [programStatusFilter, setProgramStatusFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const [yearStatusFilter, setYearStatusFilter] = useState<"all" | "ACTIVE" | "INACTIVE" | "PLANNING" | "ARCHIVED">("all");
  const [programQuery, setProgramQuery] = useState("");
  const [yearQuery, setYearQuery] = useState("");
  const [programPage, setProgramPage] = useState(1);
  const [programPageSize] = useState(10);
  const [yearPage, setYearPage] = useState(1);
  const [yearPageSize] = useState(10);

  // Roll forward — clone a source year's active class sections into a target year
  const [rollForwardTarget, setRollForwardTarget] = useState<AcademicYear | null>(null);
  const [rollForwardSourceId, setRollForwardSourceId] = useState("");
  const [rollingForward, setRollingForward] = useState(false);

  async function fetchAll() {
    const [y, p] = await Promise.all([
      fetch("/api/academic-years").then(r => r.json()),
      fetch("/api/programs").then(r => r.json()),
    ]);
    setYears(y); setPrograms(p);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgramPage(1);
  }, [programStatusFilter, programQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYearPage(1);
  }, [yearStatusFilter, yearQuery]);

  async function saveYear() {
    setSaving(true);
    const url = editingYear ? `/api/academic-years/${editingYear.id}` : "/api/academic-years";
    const method = editingYear ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(yearForm) });
    if (res.ok) { toast.success(editingYear ? "Tahun ajaran diperbarui" : "Tahun ajaran ditambahkan"); setYearDialog(false); setEditingYear(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function saveProgram() {
    setSaving(true);
    const url = editingProgram ? `/api/programs/${editingProgram.id}` : "/api/programs";
    const method = editingProgram ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...programForm, ageMin: programForm.ageMin ? parseInt(programForm.ageMin) : null, ageMax: programForm.ageMax ? parseInt(programForm.ageMax) : null }) });
    if (res.ok) { toast.success(editingProgram ? "Program diperbarui" : "Program ditambahkan"); setProgramDialog(false); setEditingProgram(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    const urlMap: Record<string, string> = {
      year: `/api/academic-years/${deactivateTarget.id}`,
      program: `/api/programs/${deactivateTarget.id}`,
    };
    const res = await fetch(urlMap[deactivateTarget.type], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    if (res.ok) { toast.success("Dinonaktifkan"); setDeactivateTarget(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
  }

  async function handleReactivate() {
    if (!reactivateTarget) return;
    const urlMap: Record<string, string> = {
      year: `/api/academic-years/${reactivateTarget.id}`,
      program: `/api/programs/${reactivateTarget.id}`,
    };
    const res = await fetch(urlMap[reactivateTarget.type], {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (res.ok) { toast.success("Diaktifkan"); setReactivateTarget(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
  }

  async function handleRollForward() {
    if (!rollForwardTarget || !rollForwardSourceId) {
      toast.error("Pilih tahun ajaran sumber");
      return;
    }
    setRollingForward(true);
    const res = await fetch(
      `/api/admin/academic-years/${rollForwardTarget.id}/roll-forward`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceYearId: rollForwardSourceId, trackIds: [] }),
      },
    );
    if (res.ok) {
      const d = await res.json();
      if (d.sectionsCreated === 0 && d.tracksSkippedAlreadyRolled === 0) {
        toast.info("Tidak ada kelas aktif yang bisa digulir dari tahun ajaran sumber");
      } else {
        let msg = `${d.sectionsCreated} kelas digulir ke ${rollForwardTarget.name}`;
        if (d.tracksSkippedAlreadyRolled > 0) {
          msg += ` · ${d.tracksSkippedAlreadyRolled} kelas dilewati (sudah ada)`;
        }
        toast.success(msg);
        if (d.truncated) {
          toast.info("Sebagian kelas digulir — jalankan lagi untuk sisanya");
        }
      }
      setRollForwardTarget(null);
      setRollForwardSourceId("");
      fetchAll();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal menggulir kelas");
    }
    setRollingForward(false);
  }

  // --- Column definitions ---

  const programColumns: ColumnDef<Program>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              <Badge variant="outline" className="text-xs font-currency">{p.code}</Badge>
            </div>
            {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipe" />,
      cell: ({ row }) => <span className="text-sm">{TYPE_LABELS[row.original.type] ?? row.original.type}</span>,
    },
    {
      id: "age",
      header: "Usia",
      cell: ({ row }) => {
        const p = row.original;
        if (p.ageMin == null) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="text-xs">{Math.floor(p.ageMin / 12)}–{Math.floor((p.ageMax ?? 72) / 12)} tahun</span>;
      },
    },
    {
      id: "classes",
      accessorFn: (row) => row._count.classSections,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kelas" />,
      cell: ({ row }) => <span className="font-currency text-sm">{row.original._count.classSections}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => {
            const p = row.original;
            setEditingProgram(p);
            setProgramForm({ code: p.code, name: p.name, description: p.description ?? "", type: p.type, ageMin: p.ageMin ? String(p.ageMin) : "", ageMax: p.ageMax ? String(p.ageMax) : "" });
            setProgramDialog(true);
          }}
          onDeactivate={() => setDeactivateTarget({ type: "program", id: row.original.id, name: row.original.name })}
          onActivate={() => setReactivateTarget({ type: "program", id: row.original.id, name: row.original.name })}
          isActive={row.original.status === "ACTIVE"}
        />
      ),
    },
  ];

  const filteredPrograms = useMemo(() => {
    const needle = programQuery.trim().toLowerCase();
    return programs.filter((p) => {
      const statusMatch = programStatusFilter === "all" || p.status === programStatusFilter;
      const queryMatch = !needle || [p.name, p.code, p.description ?? "", p.type]
        .some((value) => value.toLowerCase().includes(needle));
      return statusMatch && queryMatch;
    });
  }, [programQuery, programStatusFilter, programs]);
  const programTotalPages = Math.max(1, Math.ceil(filteredPrograms.length / programPageSize));
  const safeProgramPage = Math.min(programPage, programTotalPages);
  const programPagination = {
    page: safeProgramPage,
    pageSize: programPageSize,
    total: filteredPrograms.length,
    totalPages: programTotalPages,
  };

  const yearColumns: ColumnDef<AcademicYear>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tahun Ajaran" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "startDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
      cell: ({ row }) => {
        const y = row.original;
        return (
          <span className="text-xs text-muted-foreground">
            {formatDateShort(y.startDate)}
            {" — "}
            {formatDateShort(y.endDate)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "manageClasses",
      header: "",
      cell: ({ row }) => (
        <Link
          href={`/admin/classes?yearId=${row.original.id}`}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Kelola kelas tahun ini
          <ArrowRightCircle size={12} />
        </Link>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => {
            const y = row.original;
            setEditingYear(y);
            setYearForm({ name: y.name, startDate: y.startDate, endDate: y.endDate });
            setYearDialog(true);
          }}
          onDeactivate={() => setDeactivateTarget({ type: "year", id: row.original.id, name: row.original.name })}
          onActivate={() => setReactivateTarget({ type: "year", id: row.original.id, name: row.original.name })}
          isActive={row.original.status === "ACTIVE"}
          extraActions={[{
            label: "Gulir Kelas ke Tahun Ini",
            icon: <ArrowRightCircle size={14} />,
            onClick: () => {
              setRollForwardTarget(row.original);
              setRollForwardSourceId("");
            },
          }]}
        />
      ),
    },
  ];

  const filteredYears = useMemo(() => {
    const needle = yearQuery.trim().toLowerCase();
    return years.filter((year) => {
      const statusMatch = yearStatusFilter === "all" || year.status === yearStatusFilter;
      const queryMatch = !needle || [year.name, year.status]
        .some((value) => value.toLowerCase().includes(needle));
      return statusMatch && queryMatch;
    });
  }, [yearQuery, yearStatusFilter, years]);
  const yearTotalPages = Math.max(1, Math.ceil(filteredYears.length / yearPageSize));
  const safeYearPage = Math.min(yearPage, yearTotalPages);
  const yearPagination = {
    page: safeYearPage,
    pageSize: yearPageSize,
    total: filteredYears.length,
    totalPages: yearTotalPages,
  };

  return (
    <>
      <PageHeader title="Akademik" description="Program dan tahun ajaran" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Program" value={programs.length} icon={BookOpen} color="primary" index={0} />
        <StatCard label="Tahun Ajaran" value={years.length} icon={Calendar} color="primary" index={1} />
      </div>

      {/* Programs Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 font-semibold">Program</h2>
          <Button size="sm" onClick={() => { setEditingProgram(null); setProgramForm({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" }); setProgramDialog(true); }}>
            <Plus size={14} className="mr-1.5" /> Tambah Program
          </Button>
        </div>
        <DataTableToolbar
          value={programQuery}
          onValueChange={setProgramQuery}
          searchPlaceholder="Cari program atau kode..."
          filters={[
            {
              key: "programStatus",
              label: "Status",
              value: programStatusFilter,
              resetValue: "ACTIVE",
              onChange: (v) => setProgramStatusFilter(v as "all" | "ACTIVE" | "INACTIVE"),
              options: [
                { value: "all", label: "Semua Status" },
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Tidak Aktif" },
              ],
            },
          ]}
        />
        <DataTable
          columns={programColumns}
          data={filteredPrograms}
          loading={loading}
          pagination={programPagination}
          defaultSort={{ field: "name", order: "asc" }}
          emptyTitle="Belum ada program"
          emptyDescription="Tambahkan program pendidikan"
        />
      </div>

      {/* Academic Years Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 font-semibold">Tahun Ajaran</h2>
          <Button size="sm" onClick={() => { setEditingYear(null); setYearForm({ name: "", startDate: "", endDate: "" }); setYearDialog(true); }}>
            <Plus size={14} className="mr-1.5" /> Tambah Tahun Ajaran
          </Button>
        </div>
        <DataTableToolbar
          value={yearQuery}
          onValueChange={setYearQuery}
          searchPlaceholder="Cari tahun ajaran..."
          filters={[
            {
              key: "yearStatus",
              label: "Status",
              value: yearStatusFilter,
              onChange: (v) => setYearStatusFilter(v as typeof yearStatusFilter),
              options: [
                { value: "all", label: "Semua Status" },
                { value: "PLANNING", label: "Rencana" },
                { value: "ACTIVE", label: "Aktif" },
                { value: "ARCHIVED", label: "Arsip" },
                { value: "INACTIVE", label: "Tidak Aktif" },
              ],
            },
          ]}
        />
        <DataTable
          columns={yearColumns}
          data={filteredYears}
          loading={loading}
          pagination={yearPagination}
          defaultSort={{ field: "name", order: "desc" }}
          emptyTitle="Belum ada tahun ajaran"
          emptyDescription="Tambahkan tahun ajaran"
        />
      </div>

      {/* Add Year Dialog */}
      <ResponsiveFormDialog
        open={yearDialog}
        onOpenChange={setYearDialog}
        title={editingYear ? "Edit Tahun Ajaran" : "Tambah Tahun Ajaran"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setYearDialog(false)} disabled={saving}>Batal</Button>
            <Button onClick={saveYear} disabled={saving}>{saving ? "Menyimpan..." : editingYear ? "Simpan Perubahan" : "Tambah Tahun Ajaran"}</Button>
          </>
        }
      >
        <Field><FieldLabel required>Nama</FieldLabel><Input value={yearForm.name} onChange={e => setYearForm({ ...yearForm, name: e.target.value })} placeholder="2025/2026" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel>Mulai</FieldLabel><Input type="date" value={yearForm.startDate} onChange={e => setYearForm({ ...yearForm, startDate: e.target.value })} /></Field>
          <Field><FieldLabel>Selesai</FieldLabel><Input type="date" value={yearForm.endDate} onChange={e => setYearForm({ ...yearForm, endDate: e.target.value })} /></Field>
        </div>
      </ResponsiveFormDialog>

      {/* Add Program Dialog */}
      <ResponsiveFormDialog
        open={programDialog}
        onOpenChange={setProgramDialog}
        title={editingProgram ? "Edit Program" : "Tambah Program"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProgramDialog(false)} disabled={saving}>Batal</Button>
            <Button onClick={saveProgram} disabled={saving}>{saving ? "Menyimpan..." : editingProgram ? "Simpan Perubahan" : "Tambah Program"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel required>Kode</FieldLabel><Input value={programForm.code} onChange={e => setProgramForm({ ...programForm, code: e.target.value })} placeholder="TKIT" /></Field>
          <Field><FieldLabel required>Nama</FieldLabel><Input value={programForm.name} onChange={e => setProgramForm({ ...programForm, name: e.target.value })} placeholder="TK Islam Terpadu" /></Field>
        </div>
        <Field><FieldLabel>Deskripsi</FieldLabel><Input value={programForm.description} onChange={e => setProgramForm({ ...programForm, description: e.target.value })} /></Field>
        <Field>
          <FieldLabel>Tipe</FieldLabel>
          <Select value={programForm.type} onValueChange={v => v && setProgramForm({ ...programForm, type: v })} items={{ SEMESTER: "Semester", YEAR_ROUND: "Sepanjang Tahun", SESSION: "Per Sesi" }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMESTER">Semester</SelectItem>
              <SelectItem value="YEAR_ROUND">Sepanjang Tahun</SelectItem>
              <SelectItem value="SESSION">Per Sesi</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel>Usia Min (bulan)</FieldLabel><Input type="number" value={programForm.ageMin} onChange={e => setProgramForm({ ...programForm, ageMin: e.target.value })} /></Field>
          <Field><FieldLabel>Usia Max (bulan)</FieldLabel><Input type="number" value={programForm.ageMax} onChange={e => setProgramForm({ ...programForm, ageMax: e.target.value })} /></Field>
        </div>
      </ResponsiveFormDialog>

      {/* Roll Forward Dialog */}
      <ResponsiveFormDialog
        open={!!rollForwardTarget}
        onOpenChange={(o) => { if (!o) { setRollForwardTarget(null); setRollForwardSourceId(""); } }}
        title="Gulir Kelas ke Tahun Ajaran"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setRollForwardTarget(null); setRollForwardSourceId(""); }} disabled={rollingForward}>Batal</Button>
            <Button onClick={handleRollForward} disabled={rollingForward || !rollForwardSourceId}>
              {rollingForward ? "Menggulir..." : "Gulir Kelas"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Menyalin semua kelas aktif dari tahun ajaran sumber ke{" "}
          <span className="font-medium text-foreground">{rollForwardTarget?.name}</span>.
          Kelas yang sudah ada di tahun ini akan dilewati.
        </p>
        <Field>
          <FieldLabel required>Tahun Ajaran Sumber</FieldLabel>
          <Select
            value={rollForwardSourceId}
            onValueChange={(v) => v && setRollForwardSourceId(v)}
            items={years.filter(y => y.id !== rollForwardTarget?.id).map(y => ({ label: y.name, value: y.id }))}
          >
            <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran sumber" /></SelectTrigger>
            <SelectContent>
              {years.filter(y => y.id !== rollForwardTarget?.id).map(y => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </ResponsiveFormDialog>

      {/* Deactivate Confirm */}
      <DeactivateConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        entityName={deactivateTarget?.name ?? ""}
        onConfirm={handleDeactivate}
      />

      {/* Reactivate Confirm */}
      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(o) => !o && setReactivateTarget(null)}
        title="Aktifkan"
        description={`Aktifkan kembali "${reactivateTarget?.name}"?`}
        onConfirm={handleReactivate}
        confirmLabel="Aktifkan"
      />
    </>
  );
}
