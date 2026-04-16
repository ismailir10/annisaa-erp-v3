"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ClipboardList, LayoutTemplate, Power, PowerOff } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentTemplate = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  program: { name: string };
  categories: { id: string; name: string; indicators: unknown[] }[];
  _count: { assessments: number };
};

type Program = { id: string; name: string; code: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

const TYPE_LABELS: Record<string, string> = {
  SEMESTER: "Semester",
  QUARTERLY: "Triwulan",
  MONTHLY: "Bulanan",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentTemplatesPage() {
  const [data, setData] = useState<AssessmentTemplate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState("all");
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", type: "SEMESTER", programId: "" });

  // Edit dialog
  const [editTarget, setEditTarget] = useState<AssessmentTemplate | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", type: "SEMESTER" });

  // Deactivate / Activate confirm
  const [toggleTarget, setToggleTarget] = useState<AssessmentTemplate | null>(null);
  const [toggling, setToggling] = useState(false);

  // ── Fetch programs once ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((d) => setPrograms(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch stats once ────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/assessments/templates?page=1&pageSize=1").then((r) => r.json()),
      fetch("/api/assessments/templates?page=1&pageSize=1&isActive=true").then((r) => r.json()),
      fetch("/api/assessments/templates?page=1&pageSize=1&isActive=false").then((r) => r.json()),
    ]).then(([all, active, inactive]) => {
      setStats({
        total: all.pagination?.total ?? 0,
        active: active.pagination?.total ?? 0,
        inactive: inactive.pagination?.total ?? 0,
      });
    }).catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch list ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (search) params.set("search", search);
      if (isActiveFilter !== "all") params.set("isActive", isActiveFilter);

      const res = await fetch(`/api/assessments/templates?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal memuat data");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data template");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, isActiveFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  function openEdit(t: AssessmentTemplate) {
    setEditTarget(t);
    setEditForm({ name: t.name, type: t.type });
  }

  async function handleCreate() {
    if (!createForm.name.trim()) { toast.error("Nama template wajib diisi"); return; }
    if (!createForm.programId) { toast.error("Program wajib dipilih"); return; }
    setCreating(true);
    const res = await fetch("/api/assessments/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      toast.success("Template berhasil dibuat");
      setCreateOpen(false);
      setCreateForm({ name: "", type: "SEMESTER", programId: "" });
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal membuat template");
    }
    setCreating(false);
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.name.trim()) { toast.error("Nama template wajib diisi"); return; }
    setEditing(true);
    const res = await fetch(`/api/assessments/templates/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, type: editForm.type }),
    });
    if (res.ok) {
      toast.success("Template berhasil diperbarui");
      setEditTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal memperbarui template");
    }
    setEditing(false);
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setToggling(true);
    const res = await fetch(`/api/assessments/templates/${toggleTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !toggleTarget.isActive }),
    });
    if (res.ok) {
      toast.success(toggleTarget.isActive ? "Template dinonaktifkan" : "Template diaktifkan");
      setToggleTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal mengubah status");
    }
    setToggling(false);
  }

  // ── Columns ─────────────────────────────────────────────────────

  const columns: ColumnDef<AssessmentTemplate>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nama Template" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.program.name}</p>
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipe",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[row.original.type] ?? row.original.type}
        </Badge>
      ),
    },
    {
      id: "categories",
      header: "Kategori",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.categories.length} kategori
        </span>
      ),
    },
    {
      id: "assessments",
      header: "Penilaian",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original._count.assessments} rapor
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <DataTableRowActions
            onEdit={() => openEdit(t)}
            onDeactivate={t.isActive ? () => setToggleTarget(t) : undefined}
            onActivate={!t.isActive ? () => setToggleTarget(t) : undefined}
            isActive={t.isActive}
          />
        );
      },
    },
  ];

  // ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Template Penilaian"
        description={`${pagination.total} template`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <LayoutTemplate size={14} className="mr-1.5" />
            Tambah Template
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Template" value={stats.total} icon={ClipboardList} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={Power} color="success" index={1} />
        <StatCard label="Tidak Aktif" value={stats.inactive} icon={PowerOff} color="error" index={2} />
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama template..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "isActive",
            label: "Status",
            value: isActiveFilter,
            onChange: (v) => {
              setIsActiveFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: [
              { value: "all", label: "Semua Status" },
              { value: "true", label: "Aktif" },
              { value: "false", label: "Tidak Aktif" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onPageSizeChange={(pageSize) => setPagination((p) => ({ ...p, page: 1, pageSize }))}
        loading={loading}
        emptyTitle="Belum ada template penilaian"
        emptyDescription="Buat template untuk mulai membuat laporan perkembangan siswa."
      />

      {/* ── Create dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!creating) setCreateOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Template Penilaian</DialogTitle>
            <DialogDescription>Template untuk laporan perkembangan siswa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel>Nama Template</FieldLabel>
              <Input
                placeholder="Contoh: Laporan Perkembangan Semester 1"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Program</FieldLabel>
              <Select
                value={createForm.programId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, programId: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih program..." />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Tipe Penilaian</FieldLabel>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v ?? f.type }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={creating}>Batal</Button>
            </DialogClose>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ─────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!editing && !o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template Penilaian</DialogTitle>
            <DialogDescription>{editTarget?.program.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel>Nama Template</FieldLabel>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Tipe Penilaian</FieldLabel>
              <Select
                value={editForm.type}
                onValueChange={(v) => setEditForm((f) => ({ ...f, type: v ?? f.type }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={editing}>Batal</Button>
            </DialogClose>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toggle active confirm ───────────────────────────────── */}
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => { if (!o) setToggleTarget(null); }}
        title={toggleTarget?.isActive ? "Nonaktifkan Template?" : "Aktifkan Template?"}
        description={
          toggleTarget?.isActive
            ? `Template "${toggleTarget?.name}" tidak akan bisa digunakan untuk penilaian baru.`
            : `Template "${toggleTarget?.name}" akan tersedia kembali untuk penilaian.`
        }
        confirmLabel={toggleTarget?.isActive ? "Nonaktifkan" : "Aktifkan"}
        destructive={toggleTarget?.isActive}
        loading={toggling}
        onConfirm={handleToggleActive}
      />
    </>
  );
}
