"use client";

// Frontend cross-check: dialog + row actions follow design-system.html
// (ResponsiveFormDialog overlay, Select, Button states). This page is a
// single "use client" component — no server wrapper to host the note.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
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
import { Plus, GraduationCap, BookOpen, Users, Calendar, ArrowRightCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

type AcademicYear = { id: string; name: string; startDate: string; endDate: string; status: string };
type Program = { id: string; code: string; name: string; description: string | null; type: string; ageMin: number | null; ageMax: number | null; status: string; _count: { classSections: number } };
type ClassSection = { id: string; name: string; capacity: number; status: string; programId: string; academicYearId: string; campusId: string; program: { name: string; code: string }; academicYear: { name: string }; campus: { name: string }; _count: { enrollments: number } };
type Campus = { id: string; name: string };
type Employee = { id: string; nama: string; kode: string; jabatan: string };
type Assignment = { id: string; role: string; employee: { nama: string; kode: string; jabatan: string } };

const TYPE_LABELS: Record<string, string> = {
  SEMESTER: "Semester",
  YEAR_ROUND: "Sepanjang Tahun",
  SESSION: "Per Sesi",
};

export default function AcademicPage() {
  const router = useRouter();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [yearDialog, setYearDialog] = useState(false);
  const [programDialog, setProgramDialog] = useState(false);
  const [sectionDialog, setSectionDialog] = useState(false);
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [programForm, setProgramForm] = useState({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" });
  const [sectionForm, setSectionForm] = useState({ name: "", programId: "", academicYearId: "", campusId: "", capacity: "20" });
  const [saving, setSaving] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [editingSection, setEditingSection] = useState<ClassSection | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{ type: string; id: string; name: string } | null>(null);
  const [programStatusFilter, setProgramStatusFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("ACTIVE");
  const [sectionStatusFilter, setSectionStatusFilter] = useState<"all" | "ACTIVE" | "INACTIVE">("ACTIVE");

  // Roll forward — clone a source year's active class sections into a target year
  const [rollForwardTarget, setRollForwardTarget] = useState<AcademicYear | null>(null);
  const [rollForwardSourceId, setRollForwardSourceId] = useState("");
  const [rollingForward, setRollingForward] = useState(false);

  // Teacher assignment
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ classSectionId: "", className: "", employeeId: "" });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [classAssignments, setClassAssignments] = useState<Assignment[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  async function loadAssignments(classSectionId: string) {
    const [empRes, assRes] = await Promise.all([
      fetch("/api/employees?status=ACTIVE&pageSize=100"),
      fetch(`/api/teaching-assignments?classSectionId=${classSectionId}`),
    ]);
    const empJson = await empRes.json();
    setEmployees(empJson.data ?? empJson);
    setClassAssignments(await assRes.json());
  }

  async function handleAssignTeacher() {
    if (!assignForm.employeeId) { toast.error("Pilih guru"); return; }
    setAssignSaving(true);
    const res = await fetch("/api/teaching-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: assignForm.employeeId, classSectionId: assignForm.classSectionId }),
    });
    if (res.ok) { toast.success("Guru ditugaskan"); loadAssignments(assignForm.classSectionId); setAssignForm({ ...assignForm, employeeId: "" }); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setAssignSaving(false);
  }

  async function handleRemoveAssignment(assignmentId: string) {
    await fetch(`/api/teaching-assignments/${assignmentId}`, { method: "DELETE" });
    toast.success("Penugasan dihapus");
    loadAssignments(assignForm.classSectionId);
  }

  async function fetchAll() {
    const [y, p, s, c] = await Promise.all([
      fetch("/api/academic-years").then(r => r.json()),
      fetch("/api/programs").then(r => r.json()),
      fetch("/api/class-sections").then(r => r.json()),
      fetch("/api/config/campuses").then(r => r.json()),
    ]);
    setYears(y); setPrograms(p); setSections(s); setCampuses(c);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

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

  async function saveSection() {
    setSaving(true);
    const url = editingSection ? `/api/class-sections/${editingSection.id}` : "/api/class-sections";
    const method = editingSection ? "PUT" : "POST";
    const body = editingSection
      ? { name: sectionForm.name, capacity: parseInt(sectionForm.capacity), campusId: sectionForm.campusId }
      : { ...sectionForm, capacity: parseInt(sectionForm.capacity) };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast.success(editingSection ? "Kelas diperbarui" : "Kelas ditambahkan"); setSectionDialog(false); setEditingSection(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    const urlMap: Record<string, string> = {
      year: `/api/academic-years/${deactivateTarget.id}`,
      program: `/api/programs/${deactivateTarget.id}`,
      section: `/api/class-sections/${deactivateTarget.id}`,
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
      section: `/api/class-sections/${reactivateTarget.id}`,
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

  const filteredPrograms = programStatusFilter === "all"
    ? programs
    : programs.filter(p => p.status === programStatusFilter);

  const filteredSections = sectionStatusFilter === "all"
    ? sections
    : sections.filter(s => s.status === sectionStatusFilter);

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
      id: "classCount",
      header: "Kelas",
      cell: ({ row }) => {
        const count = sections.filter(s => s.academicYear.name === row.original.name).length;
        return <span className="font-currency text-sm">{count}</span>;
      },
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

  const classColumns: ColumnDef<ClassSection>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kelas" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div>
            <span className="text-sm font-semibold">{s.name}</span>
            <p className="text-xs text-muted-foreground">{s.campus.name}</p>
          </div>
        );
      },
    },
    {
      id: "program",
      accessorFn: (row) => row.program.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.program.name}</Badge>,
    },
    {
      id: "academicYear",
      accessorFn: (row) => row.academicYear.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tahun" />,
      cell: ({ row }) => <span className="text-sm">{row.original.academicYear.name}</span>,
    },
    {
      id: "enrollment",
      accessorFn: (row) => row._count.enrollments,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Murid" />,
      cell: ({ row }) => (
        <span className="font-currency text-sm">{row.original._count.enrollments}/{row.original.capacity}</span>
      ),
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
            const s = row.original;
            setEditingSection(s);
            setSectionForm({ name: s.name, programId: s.programId, academicYearId: s.academicYearId, campusId: s.campusId, capacity: String(s.capacity) });
            setSectionDialog(true);
          }}
          onDeactivate={() => setDeactivateTarget({ type: "section", id: row.original.id, name: row.original.name })}
          onActivate={() => setReactivateTarget({ type: "section", id: row.original.id, name: row.original.name })}
          isActive={row.original.status === "ACTIVE"}
          extraActions={[
            {
              label: "Guru Pengajar",
              icon: <Users size={14} />,
              onClick: () => {
                setAssignForm({ classSectionId: row.original.id, className: row.original.name, employeeId: "" });
                setAssignDialog(true);
                loadAssignments(row.original.id);
              },
            },
            {
              label: "Kalender sesi",
              icon: <Calendar size={14} />,
              onClick: () => router.push(`/admin/class-sections/${row.original.id}`),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Akademik" description="Program, tahun ajaran, dan kelas" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Program" value={programs.length} icon={BookOpen} color="primary" index={0} />
        <StatCard label="Tahun Ajaran" value={years.length} icon={Calendar} color="primary" index={1} />
        <StatCard label="Kelas" value={sections.length} icon={GraduationCap} color="success" index={2} />
        <StatCard label="Total Murid" value={sections.reduce((s, c) => s + c._count.enrollments, 0)} icon={Users} color="primary" index={3} />
      </div>

      {/* Programs Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 font-semibold">Program</h2>
          <div className="flex items-center gap-2">
            <Select value={programStatusFilter} onValueChange={(v) => v && setProgramStatusFilter(v as "all" | "ACTIVE" | "INACTIVE")} items={{ all: "Semua Status", ACTIVE: "Aktif", INACTIVE: "Tidak Aktif" }}>
              <SelectTrigger className="h-8 w-[160px]" data-testid="program-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { setEditingProgram(null); setProgramForm({ code: "", name: "", description: "", type: "SEMESTER", ageMin: "", ageMax: "" }); setProgramDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Program
            </Button>
          </div>
        </div>
        <DataTable columns={programColumns} data={filteredPrograms} loading={loading} defaultSort={{ field: "name", order: "asc" }} emptyTitle="Belum ada program" emptyDescription="Tambahkan program pendidikan" />
      </div>

      {/* Academic Years Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 font-semibold">Tahun Ajaran</h2>
          <Button size="sm" onClick={() => { setEditingYear(null); setYearForm({ name: "", startDate: "", endDate: "" }); setYearDialog(true); }}>
            <Plus size={14} className="mr-1.5" /> Tambah Tahun Ajaran
          </Button>
        </div>
        <DataTable columns={yearColumns} data={years} loading={loading} defaultSort={{ field: "name", order: "desc" }} emptyTitle="Belum ada tahun ajaran" emptyDescription="Tambahkan tahun ajaran" />
      </div>

      {/* Class Sections Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 font-semibold">Kelas</h2>
          <div className="flex items-center gap-2">
            <Select value={sectionStatusFilter} onValueChange={(v) => v && setSectionStatusFilter(v as "all" | "ACTIVE" | "INACTIVE")} items={{ all: "Semua Status", ACTIVE: "Aktif", INACTIVE: "Tidak Aktif" }}>
              <SelectTrigger className="h-8 w-[160px]" data-testid="section-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { setEditingSection(null); setSectionForm({ name: "", programId: "", academicYearId: "", campusId: "", capacity: "20" }); setSectionDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Kelas
            </Button>
          </div>
        </div>
        <DataTable columns={classColumns} data={filteredSections} loading={loading} defaultSort={{ field: "name", order: "asc" }} emptyTitle="Belum ada kelas" emptyDescription="Tambahkan kelas untuk program" />
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

      {/* Add Section Dialog */}
      <ResponsiveFormDialog
        open={sectionDialog}
        onOpenChange={setSectionDialog}
        title={editingSection ? "Edit Kelas" : "Tambah Kelas"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSectionDialog(false)} disabled={saving}>Batal</Button>
            <Button onClick={saveSection} disabled={saving}>{saving ? "Menyimpan..." : editingSection ? "Simpan Perubahan" : "Tambah Kelas"}</Button>
          </>
        }
      >
        <Field><FieldLabel required>Nama Kelas</FieldLabel><Input value={sectionForm.name} onChange={e => setSectionForm({ ...sectionForm, name: e.target.value })} placeholder="TKIT A" /></Field>
        <Field>
          <FieldLabel required>Program</FieldLabel>
          {editingSection ? (
            <div className="text-sm text-muted-foreground py-2">{editingSection.program.name}</div>
          ) : (
            <Select value={sectionForm.programId} onValueChange={v => v && setSectionForm({ ...sectionForm, programId: v })}>
              <SelectTrigger><SelectValue placeholder="Pilih program" /></SelectTrigger>
              <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field>
          <FieldLabel required>Tahun Ajaran</FieldLabel>
          {editingSection ? (
            <div className="text-sm text-muted-foreground py-2">{editingSection.academicYear.name}</div>
          ) : (
            <Select value={sectionForm.academicYearId} onValueChange={v => v && setSectionForm({ ...sectionForm, academicYearId: v })}>
              <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </Field>
        <Field>
          <FieldLabel required>Kampus</FieldLabel>
          <Select value={sectionForm.campusId} onValueChange={v => v && setSectionForm({ ...sectionForm, campusId: v })}>
            <SelectTrigger><SelectValue placeholder="Pilih kampus" /></SelectTrigger>
            <SelectContent>{campuses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel>Kapasitas</FieldLabel><Input type="number" value={sectionForm.capacity} onChange={e => setSectionForm({ ...sectionForm, capacity: e.target.value })} /></Field>
      </ResponsiveFormDialog>

      {/* Assign Teacher Dialog */}
      <ResponsiveFormDialog
        open={assignDialog}
        onOpenChange={setAssignDialog}
        title={`Guru Pengajar — ${assignForm.className}`}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setAssignDialog(false)}>Tutup</Button>
        }
      >
        {classAssignments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guru Saat Ini</p>
            {classAssignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{a.employee.nama}</p>
                  <p className="text-xs text-muted-foreground">{a.employee.jabatan} · {a.role === "HOMEROOM" ? "Wali Kelas" : "Pendamping"}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => handleRemoveAssignment(a.id)}>Hapus</Button>
              </div>
            ))}
          </div>
        )}
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tambah Guru</p>
          <Field>
            <FieldLabel>Pilih Guru</FieldLabel>
            <Select value={assignForm.employeeId} onValueChange={v => v && setAssignForm({ ...assignForm, employeeId: v })}>
              <SelectTrigger><SelectValue placeholder="Pilih guru..." /></SelectTrigger>
              <SelectContent>
                {employees
                  .filter(e => !classAssignments.some(a => a.employee.kode === e.kode))
                  .map(e => <SelectItem key={e.id} value={e.id}>{e.nama} ({e.jabatan})</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Button size="sm" className="mt-2" onClick={handleAssignTeacher} disabled={assignSaving}>
            {assignSaving ? "Menugaskan..." : "Tugaskan Guru"}
          </Button>
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
