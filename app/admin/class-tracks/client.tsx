"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Building2, Layers, Plus, School } from "lucide-react";
import { toast } from "sonner";

type ClassTrack = {
  id: string;
  campusId: string;
  programId: string;
  name: string;
  status: string;
  campus: { id: string; name: string };
  program: { id: string; code: string; name: string };
  _count: { sections: number };
};
type Campus = { id: string; name: string; status: string };
type Program = { id: string; code: string; name: string; status: string };

type StatusFilter = "ACTIVE" | "INACTIVE" | "all";

export function ClassTracksClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<ClassTrack[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassTrack | null>(null);
  const [form, setForm] = useState({ campusId: "", programId: "", name: "" });
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<ClassTrack | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<ClassTrack | null>(null);

  async function fetchAll() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "100" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (campusFilter !== "all") params.set("campusId", campusFilter);
    if (programFilter !== "all") params.set("programId", programFilter);
    const [trackRes, campusRes, programRes] = await Promise.all([
      fetch(`/api/admin/class-tracks?${params.toString()}`),
      fetch("/api/config/campuses?status=ALL"),
      fetch("/api/programs"),
    ]);

    const trackJson = trackRes.ok ? await trackRes.json().catch(() => null) : null;
    setRows(Array.isArray(trackJson?.data) ? trackJson.data : []);
    if (!trackRes.ok) toast.error("Gagal memuat daftar rombongan belajar");

    // Reference data drives the campus/program dropdowns + filters. A non-2xx
    // here (permission error, network failure) would otherwise silently
    // render empty selects with no explanation — surface it instead.
    if (campusRes.ok) {
      const campusJson = await campusRes.json().catch(() => null);
      setCampuses(Array.isArray(campusJson) ? campusJson : campusJson?.data ?? []);
    } else {
      setCampuses([]);
      toast.error("Gagal memuat daftar kampus");
    }

    if (programRes.ok) {
      const programJson = await programRes.json().catch(() => null);
      setPrograms(Array.isArray(programJson) ? programJson : programJson?.data ?? []);
    } else {
      setPrograms([]);
      toast.error("Gagal memuat daftar program");
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, campusFilter, programFilter]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "ACTIVE");
    const sectionTotal = active.reduce((acc, r) => acc + r._count.sections, 0);
    return { active: active.length, all: rows.length, sections: sectionTotal };
  }, [rows]);

  function resetForm() {
    setEditing(null);
    setForm({ campusId: "", programId: "", name: "" });
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(row: ClassTrack) {
    setEditing(row);
    setForm({ campusId: row.campusId, programId: row.programId, name: row.name });
    setDialogOpen(true);
  }

  async function save() {
    if (!editing && (!form.campusId || !form.programId)) {
      toast.error("Pilih kampus dan program");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Nama rombongan belajar wajib diisi");
      return;
    }
    setSaving(true);
    const url = editing
      ? `/api/admin/class-tracks/${editing.id}`
      : `/api/admin/class-tracks`;
    const method = editing ? "PATCH" : "POST";
    const body = editing
      ? { name: form.name.trim() }
      : {
          campusId: form.campusId,
          programId: form.programId,
          name: form.name.trim(),
        };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(
        editing ? "Rombongan belajar diperbarui" : "Rombongan belajar ditambahkan",
      );
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function flipStatus(target: ClassTrack, status: "ACTIVE" | "INACTIVE") {
    const res =
      status === "INACTIVE"
        ? await fetch(`/api/admin/class-tracks/${target.id}`, { method: "DELETE" })
        : await fetch(`/api/admin/class-tracks/${target.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
    if (res.ok) {
      toast.success(status === "ACTIVE" ? "Diaktifkan" : "Dinonaktifkan");
      fetchAll();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal");
    }
  }

  const columns: ColumnDef<ClassTrack>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nama" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
      ),
    },
    {
      id: "campus",
      accessorFn: (r) => r.campus.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kampus" />,
      cell: ({ row }) => <span className="text-sm">{row.original.campus.name}</span>,
    },
    {
      id: "program",
      accessorFn: (r) => r.program.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.program.name}{" "}
          <span className="text-muted-foreground">({row.original.program.code})</span>
        </span>
      ),
    },
    {
      id: "sections",
      accessorFn: (r) => r._count.sections,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rombel" />,
      cell: ({ row }) => (
        <span className="font-currency text-sm">{row.original._count.sections}</span>
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
        <div className="flex items-center justify-end">
          <DataTableRowActions
            onEdit={canWrite ? () => openEdit(row.original) : undefined}
            onDeactivate={
              canWrite && row.original.status === "ACTIVE"
                ? () => setDeactivateTarget(row.original)
                : undefined
            }
            onActivate={
              canWrite && row.original.status === "INACTIVE"
                ? () => setReactivateTarget(row.original)
                : undefined
            }
            isActive={row.original.status === "ACTIVE"}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-section">
      <PageHeader
        title="Rombongan Belajar"
        description="Identitas kelas yang stabil lintas tahun ajaran — dipetakan ke kampus dan program. Rombel harian dibuat menyusul di bawah setiap rombongan belajar."
        actions={
          canWrite ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" /> Tambah Rombongan Belajar
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-card">
        <StatCard label="Rombongan belajar aktif" value={stats.active} icon={School} color="success" index={0} />
        <StatCard label="Total tercatat" value={stats.all} icon={Layers} index={1} />
        <StatCard label="Rombel terdaftar" value={stats.sections} icon={Building2} color="primary" sublabel="pada rombongan belajar aktif" index={2} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={campusFilter} onValueChange={(v) => setCampusFilter(v ?? "all")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Semua kampus" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kampus</SelectItem>
            {campuses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={programFilter} onValueChange={(v) => setProgramFilter(v ?? "all")}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Semua program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua program</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "ACTIVE") as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Tidak aktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} />

      <ResponsiveFormDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) resetForm();
        }}
        title={editing ? "Ubah Rombongan Belajar" : "Tambah Rombongan Belajar"}
        description={
          editing
            ? "Perbarui nama rombongan belajar. Kampus dan program tidak dapat diubah."
            : "Pilih kampus dan program, lalu beri nama rombongan belajar."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Kampus</FieldLabel>
            <Select
              value={form.campusId}
              onValueChange={(v) => setForm((f) => ({ ...f, campusId: v ?? "" }))}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kampus" />
              </SelectTrigger>
              <SelectContent>
                {campuses
                  // When editing, always include the row's existing campus
                  // even if it has been deactivated since — otherwise the
                  // dialog would show an empty Select trigger.
                  .filter((c) => c.status === "ACTIVE" || c.id === form.campusId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.status !== "ACTIVE" ? " (nonaktif)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Program</FieldLabel>
            <Select
              value={form.programId}
              onValueChange={(v) => setForm((f) => ({ ...f, programId: v ?? "" }))}
              disabled={!!editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih program" />
              </SelectTrigger>
              <SelectContent>
                {programs
                  .filter((p) => p.status === "ACTIVE" || p.id === form.programId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                      {p.status !== "ACTIVE" ? " — nonaktif" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Nama rombongan belajar</FieldLabel>
            <Input
              value={form.name}
              placeholder="mis. TKIT A"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
        </div>
      </ResponsiveFormDialog>

      <DeactivateConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
        entityName={
          deactivateTarget
            ? `rombongan belajar ${deactivateTarget.name} (${deactivateTarget.campus.name})` +
              (deactivateTarget._count.sections > 0
                ? ` — ${deactivateTarget._count.sections} rombel terkait tetap aktif`
                : "")
            : "rombongan belajar"
        }
        onConfirm={async () => {
          if (deactivateTarget) {
            await flipStatus(deactivateTarget, "INACTIVE");
            setDeactivateTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(v) => !v && setReactivateTarget(null)}
        title="Aktifkan kembali rombongan belajar?"
        description={
          reactivateTarget
            ? `${reactivateTarget.name} · ${reactivateTarget.campus.name} akan muncul kembali di daftar aktif.`
            : ""
        }
        confirmLabel="Aktifkan"
        onConfirm={async () => {
          if (reactivateTarget) {
            await flipStatus(reactivateTarget, "ACTIVE");
            setReactivateTarget(null);
          }
        }}
      />
    </div>
  );
}
