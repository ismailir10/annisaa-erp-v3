"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type TeachingAssignment = {
  id: string;
  role: string;
  createdAt: string;
  employee: { id: string; nama: string; kode: string | null; jabatan: string | null };
  classSection: {
    id: string;
    name: string;
    program: { name: string };
    campus: { name: string } | null;
  };
};

type Employee = { id: string; nama: string; kode: string | null };
type ClassSection = {
  id: string;
  name: string;
  program: { name: string; code: string };
  academicYear: { name: string };
  campus: { name: string };
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = { HOMEROOM: "Wali Kelas", ASSISTANT: "Asisten" };
const ROLE_OPTIONS = [
  { value: "HOMEROOM", label: "Wali Kelas" },
  { value: "ASSISTANT", label: "Asisten" },
];

const columns: ColumnDef<TeachingAssignment>[] = [
  {
    id: "employee",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Guru" />,
    cell: ({ row }) => {
      const e = row.original.employee;
      return (
        <div>
          <span className="text-sm font-medium">{e.nama}</span>
          {e.kode && <span className="text-xs text-muted-foreground ml-1.5">({e.kode})</span>}
        </div>
      );
    },
  },
  {
    id: "class",
    header: "Program / Kelas",
    cell: ({ row }) => {
      const cs = row.original.classSection;
      return (
        <span className="text-sm">
          {cs.program.name} <span className="text-muted-foreground">· {cs.name}</span>
        </span>
      );
    },
  },
  {
    accessorKey: "role",
    header: "Peran",
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs">
        {ROLE_LABELS[row.original.role] ?? row.original.role}
      </Badge>
    ),
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function TeachingAssignmentsPage() {
  const [data, setData] = useState<TeachingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TeachingAssignment | null>(null);
  const [editTarget, setEditTarget] = useState<TeachingAssignment | null>(null);
  const [editRole, setEditRole] = useState<string>("HOMEROOM");
  const [editSaving, setEditSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ employeeId: "", classSectionId: "", role: "HOMEROOM" });
  const [createSaving, setCreateSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teaching-assignments");
      if (!res.ok) { toast.error("Gagal memuat data"); return; }
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch {
      toast.error("Gagal memuat data penugasan guru");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  useEffect(() => {
    if (!createOpen) return;
    Promise.all([
      fetch("/api/employees?status=ACTIVE&pageSize=200").then((r) => r.ok ? r.json() : null),
      fetch("/api/class-sections?pageSize=200").then((r) => r.ok ? r.json() : null),
    ]).then(([empJson, csJson]) => {
      setEmployees(Array.isArray(empJson?.data) ? empJson.data : []);
      setClassSections(Array.isArray(csJson) ? csJson : csJson?.data ?? []);
    });
  }, [createOpen]);

  function openCreate() {
    setCreateForm({ employeeId: "", classSectionId: "", role: "HOMEROOM" });
    setCreateOpen(true);
  }

  async function handleCreateSave() {
    if (!createForm.employeeId || !createForm.classSectionId) {
      toast.error("Pilih guru dan kelas");
      return;
    }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/teaching-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "Gagal menyimpan");
        return;
      }
      toast.success("Guru berhasil ditugaskan");
      setCreateOpen(false);
      fetchAssignments();
    } finally {
      setCreateSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((a) =>
      a.employee.nama.toLowerCase().includes(q) ||
      a.classSection.name.toLowerCase().includes(q) ||
      a.classSection.program.name.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/teaching-assignments/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menghapus"); return; }
    toast.success("Penugasan dihapus");
    setDeleteTarget(null);
    fetchAssignments();
  }

  function openEdit(row: TeachingAssignment) {
    setEditTarget(row);
    setEditRole(row.role);
  }

  async function handleEditSave() {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/teaching-assignments/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRole }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || "Gagal menyimpan");
        return;
      }
      toast.success("Penugasan diperbarui");
      setEditTarget(null);
      fetchAssignments();
    } finally {
      setEditSaving(false);
    }
  }

  const columnsWithActions = useMemo<ColumnDef<TeachingAssignment>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onEdit={() => openEdit(row.original)}
            extraActions={[
              {
                label: "Hapus",
                onClick: () => setDeleteTarget(row.original),
                destructive: true,
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  if (loading) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <PageHeader
        title="Guru Pengajar"
        description={`${data.length} penugasan`}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" /> Tambah Guru Pengajar
          </Button>
        }
      />

      <DataTableToolbar
        searchPlaceholder="Cari guru, kelas, atau program..."
        onSearchChange={setSearch}
      />

      <DataTable
        columns={columnsWithActions}
        data={filtered}
        defaultSort={{ field: "employee", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada penugasan guru"
        emptyDescription="Klik tombol Tambah untuk menugaskan guru ke kelas."
      />

      <DeactivateConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        entityName={deleteTarget ? `${deleteTarget.employee.nama} dari ${deleteTarget.classSection.program.name} · ${deleteTarget.classSection.name}` : ""}
        action="delete"
        onConfirm={handleDelete}
      />

      <ResponsiveFormDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); }}
        title="Tambah Guru Pengajar"
        description="Pilih guru, kelas, dan peran penugasan."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createSaving}>
              Batal
            </Button>
            <Button onClick={handleCreateSave} disabled={createSaving}>
              {createSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Guru</FieldLabel>
            <Select
              value={createForm.employeeId}
              onValueChange={(v) => setCreateForm((f) => ({ ...f, employeeId: v ?? "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih guru" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nama}{e.kode ? ` (${e.kode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Kelas</FieldLabel>
            <Select
              value={createForm.classSectionId}
              onValueChange={(v) => setCreateForm((f) => ({ ...f, classSectionId: v ?? "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kelas" />
              </SelectTrigger>
              <SelectContent>
                {classSections.map((cs) => (
                  <SelectItem key={cs.id} value={cs.id}>
                    {cs.program.name} · {cs.name} ({cs.academicYear.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Peran</FieldLabel>
            <Select
              value={createForm.role}
              onValueChange={(v) => v && setCreateForm((f) => ({ ...f, role: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ResponsiveFormDialog>

      <ResponsiveFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title="Edit Penugasan"
        description={editTarget
          ? `${editTarget.employee.nama} · ${editTarget.classSection.program.name} · ${editTarget.classSection.name}`
          : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={editSaving}>
              Batal
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving || editRole === editTarget?.role}>
              {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </>
        }
      >
        <Field>
          <FieldLabel>Peran</FieldLabel>
          <Select
            value={editRole}
            onValueChange={(v) => v && setEditRole(v)}
            items={Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </ResponsiveFormDialog>
    </>
  );
}
