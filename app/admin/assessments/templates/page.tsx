"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  KategoriIndikatorBuilder,
  EMPTY_CATEGORY,
  type CategoryForm,
} from "@/components/admin/assessments/KategoriIndikatorBuilder";
import { toast } from "sonner";
import { Plus, ClipboardList, Power, PowerOff } from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  indicators: { id: string; description: string; sortOrder: number }[];
};

type AssessmentTemplate = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  programId: string;
  program: { name: string };
  categories: Category[];
  _count: { assessments: number };
  createdAt: string;
};

type Program = { id: string; name: string; code?: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = { SEMESTER: "Semester", QUARTERLY: "Kuartal", MONTHLY: "Bulanan" };

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<AssessmentTemplate>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nama Template" />,
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
  },
  {
    id: "program",
    header: "Program",
    cell: ({ row }) => <span className="text-sm">{row.original.program.name}</span>,
  },
  {
    accessorKey: "type",
    header: "Tipe",
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-xs">{TYPE_LABELS[row.original.type] ?? row.original.type}</Badge>
    ),
  },
  {
    id: "categories",
    header: "Kategori",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.categories.length} kategori</span>
    ),
  },
  {
    id: "assessments",
    header: "Penilaian",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original._count.assessments}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function AssessmentTemplatesPage() {
  const [data, setData] = useState<AssessmentTemplate[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState("all");
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [programs, setPrograms] = useState<Program[]>([]);
  const [createDialog, setCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<AssessmentTemplate | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AssessmentTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({
    name: "",
    programId: "",
    type: "SEMESTER",
    categories: [{ ...EMPTY_CATEGORY }] as CategoryForm[],
  });

  // Edit form — categories included; the builder is locked client-side
  // when the template already has assessments (see editLockNotice below).
  const [editForm, setEditForm] = useState<{
    name: string;
    type: string;
    categories: CategoryForm[];
  }>({ name: "", type: "SEMESTER", categories: [] });

  // ── Fetch programs once ────────────────────────────────────
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((d) => setPrograms(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch stats (re-run after mutations) ──────────────────
  const fetchStats = useCallback(() => {
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

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Fetch list (server paginated) ─────────────────────────
  const fetchTemplates = useCallback(async () => {
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
        toast.error(err.error || "Gagal memuat template");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat template penilaian");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, isActiveFilter]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  function refreshAll() {
    fetchTemplates();
    fetchStats();
  }

  // ── Create ──────────────────────────────────────────────
  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.programId) {
      toast.error("Nama dan program wajib diisi");
      return;
    }
    // Validate categories
    for (const cat of createForm.categories) {
      if (!cat.name.trim()) { toast.error("Nama kategori wajib diisi"); return; }
      for (const ind of cat.indicators) {
        if (!ind.trim()) { toast.error("Deskripsi indikator wajib diisi"); return; }
      }
    }
    setSaving(true);
    const res = await fetch("/api/assessments/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        programId: createForm.programId,
        type: createForm.type,
        categories: createForm.categories.map((cat) => ({ name: cat.name.trim(), indicators: cat.indicators.map((i) => i.trim()) })),
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal membuat template"); setSaving(false); return; }
    toast.success("Template penilaian dibuat");
    setCreateDialog(false);
    setCreateForm({ name: "", programId: "", type: "SEMESTER", categories: [{ ...EMPTY_CATEGORY }] });
    setSaving(false);
    refreshAll();
  }

  // ── Edit ────────────────────────────────────────────────
  const editLocked = (editTarget?._count.assessments ?? 0) > 0;

  async function handleEditSave() {
    if (!editTarget) return;
    // Validate categories only when the builder is unlocked. Locked templates
    // only send name + type.
    if (!editLocked) {
      for (const cat of editForm.categories) {
        if (!cat.name.trim()) { toast.error("Nama kategori wajib diisi"); return; }
        if (cat.indicators.length === 0) { toast.error("Minimal satu indikator per kategori"); return; }
        for (const ind of cat.indicators) {
          if (!ind.trim()) { toast.error("Deskripsi indikator wajib diisi"); return; }
        }
      }
    }
    setSaving(true);
    const payload: {
      name: string;
      type: string;
      categories?: { name: string; indicators: string[] }[];
    } = { name: editForm.name, type: editForm.type };
    if (!editLocked) {
      payload.categories = editForm.categories.map((cat) => ({
        name: cat.name.trim(),
        indicators: cat.indicators.map((i) => i.trim()),
      }));
    }
    const res = await fetch(`/api/assessments/templates/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menyimpan"); setSaving(false); return; }
    toast.success("Template diperbarui");
    setEditTarget(null);
    setSaving(false);
    refreshAll();
  }

  // ── Deactivate ──────────────────────────────────────────
  async function handleToggleActive() {
    if (!deactivateTarget) return;
    const newState = !deactivateTarget.isActive;
    const res = await fetch(`/api/assessments/templates/${deactivateTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: newState }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal mengubah status"); return; }
    toast.success(newState ? "Template diaktifkan" : "Template dinonaktifkan");
    setDeactivateTarget(null);
    refreshAll();
  }

  const columnsWithActions = useMemo<ColumnDef<AssessmentTemplate>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const t = row.original;
          return (
            <DataTableRowActions
              onEdit={() => {
                setEditTarget(t);
                setEditForm({
                  name: t.name,
                  type: t.type,
                  categories: t.categories.length
                    ? t.categories.map((c) => ({
                        name: c.name,
                        indicators: c.indicators.map((i) => i.description),
                      }))
                    : [{ ...EMPTY_CATEGORY }],
                });
              }}
              onDeactivate={t.isActive ? () => setDeactivateTarget(t) : undefined}
              onActivate={!t.isActive ? () => setDeactivateTarget(t) : undefined}
              isActive={t.isActive}
            />
          );
        },
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Template Penilaian"
        description={`${stats.total} template`}
        actions={
          <Button size="sm" onClick={() => { setCreateForm({ name: "", programId: programs[0]?.id ?? "", type: "SEMESTER", categories: [{ ...EMPTY_CATEGORY }] }); setCreateDialog(true); }}>
            <Plus size={14} className="mr-1.5" /> Buat Template
          </Button>
        }
      />

      <StatsCardsRow cols={3}>
        <StatCard label="Total Template" value={stats.total} icon={ClipboardList} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={Power} color="success" index={1} />
        <StatCard label="Tidak Aktif" value={stats.inactive} icon={PowerOff} color="error" index={2} />
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari template atau program..."
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
        columns={columnsWithActions}
        data={data}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onPageSizeChange={(pageSize) => setPagination((p) => ({ ...p, page: 1, pageSize }))}
        defaultSort={{ field: "name", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada template penilaian"
        emptyDescription="Buat template untuk mulai menilai siswa."
      />

      {/* Create Dialog */}
      <ResponsiveFormDialog
        open={createDialog}
        onOpenChange={setCreateDialog}
        title="Buat Template Penilaian"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateDialog(false)} disabled={saving}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Menyimpan..." : "Buat Template"}</Button>
          </>
        }
      >
        <div className="space-y-field">
            <Field><FieldLabel required>Nama Template</FieldLabel><Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Laporan Perkembangan Semester 1" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel required>Program</FieldLabel>
                <Select value={createForm.programId} onValueChange={(v) => v && setCreateForm({ ...createForm, programId: v })} items={programs.map((p) => ({ label: p.name, value: p.id }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih program" /></SelectTrigger>
                  <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Tipe</FieldLabel>
                <Select value={createForm.type} onValueChange={(v) => v && setCreateForm({ ...createForm, type: v })} items={{ SEMESTER: "Semester", QUARTERLY: "Kuartal", MONTHLY: "Bulanan" }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEMESTER">Semester</SelectItem>
                    <SelectItem value="QUARTERLY">Kuartal</SelectItem>
                    <SelectItem value="MONTHLY">Bulanan</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <KategoriIndikatorBuilder
              value={createForm.categories}
              onChange={(cats) => setCreateForm({ ...createForm, categories: cats })}
            />
        </div>
      </ResponsiveFormDialog>

      {/* Edit Dialog */}
      <ResponsiveFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title="Edit Template"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={saving}>Batal</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
          </>
        }
      >
        <Field><FieldLabel required>Nama</FieldLabel><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
        <Field>
          <FieldLabel>Tipe</FieldLabel>
          <Select value={editForm.type} onValueChange={(v) => v && setEditForm({ ...editForm, type: v })} items={{ SEMESTER: "Semester", QUARTERLY: "Kuartal", MONTHLY: "Bulanan" }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SEMESTER">Semester</SelectItem>
              <SelectItem value="QUARTERLY">Kuartal</SelectItem>
              <SelectItem value="MONTHLY">Bulanan</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {editTarget && (
          <p className="text-xs text-muted-foreground">Program: {editTarget.program.name}</p>
        )}
        <KategoriIndikatorBuilder
          value={editForm.categories}
          onChange={(cats) => setEditForm({ ...editForm, categories: cats })}
          disabled={editLocked}
          lockNotice={
            editLocked
              ? `Template ini sudah dipakai ${editTarget?._count.assessments ?? 0} penilaian. Nama dan tipe bisa diubah; struktur kategori dikunci untuk menjaga riwayat nilai.`
              : undefined
          }
        />
      </ResponsiveFormDialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={deactivateTarget?.isActive ? "Nonaktifkan Template" : "Aktifkan Template"}
        description={deactivateTarget?.isActive ? `Template "${deactivateTarget?.name}" tidak akan tersedia untuk penilaian baru. Bisa diaktifkan kembali kapan saja.` : `Template "${deactivateTarget?.name}" akan tersedia kembali untuk penilaian baru.`}
        confirmLabel={deactivateTarget?.isActive ? "Nonaktifkan" : "Aktifkan"}
        onConfirm={handleToggleActive}
        destructive={deactivateTarget?.isActive ?? false}
      />
    </>
  );
}
