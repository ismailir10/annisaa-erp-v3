"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, ClipboardList, Trash2 } from "lucide-react";
import { formatDateShort } from "@/lib/format";

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

type Program = { id: string; name: string };

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = { SEMESTER: "Semester", QUARTERLY: "Kuartal", MONTHLY: "Bulanan" };

type CategoryForm = { name: string; indicators: string[] };

const EMPTY_CATEGORY: CategoryForm = { name: "", indicators: [""] };

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
      <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[row.original.type] ?? row.original.type}</Badge>
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  // Edit form (top-level only)
  const [editForm, setEditForm] = useState({ name: "", type: "SEMESTER" });

  useEffect(() => {
    fetch("/api/programs").then(r => r.json()).then(setPrograms).catch(() => {});
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assessments/templates");
      if (!res.ok) { toast.error("Gagal memuat template"); return; }
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch {
      toast.error("Gagal memuat template penilaian");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.program.name.toLowerCase().includes(q)
    );
  }, [data, search]);

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
    fetchTemplates();
  }

  // ── Edit ────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch(`/api/assessments/templates/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menyimpan"); setSaving(false); return; }
    toast.success("Template diperbarui");
    setEditTarget(null);
    setSaving(false);
    fetchTemplates();
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
    fetchTemplates();
  }

  // ── Form helpers ────────────────────────────────────────
  function addCategory() {
    setCreateForm({ ...createForm, categories: [...createForm.categories, { ...EMPTY_CATEGORY }] });
  }
  function removeCategory(index: number) {
    setCreateForm({ ...createForm, categories: createForm.categories.filter((_, i) => i !== index) });
  }
  function updateCategory(index: number, name: string) {
    const cats = [...createForm.categories];
    cats[index] = { ...cats[index], name };
    setCreateForm({ ...createForm, categories: cats });
  }
  function addIndicator(catIndex: number) {
    const cats = [...createForm.categories];
    cats[catIndex] = { ...cats[catIndex], indicators: [...cats[catIndex].indicators, ""] };
    setCreateForm({ ...createForm, categories: cats });
  }
  function removeIndicator(catIndex: number, indIndex: number) {
    const cats = [...createForm.categories];
    cats[catIndex] = { ...cats[catIndex], indicators: cats[catIndex].indicators.filter((_, i) => i !== indIndex) };
    setCreateForm({ ...createForm, categories: cats });
  }
  function updateIndicator(catIndex: number, indIndex: number, value: string) {
    const cats = [...createForm.categories];
    const inds = [...cats[catIndex].indicators];
    inds[indIndex] = value;
    cats[catIndex] = { ...cats[catIndex], indicators: inds };
    setCreateForm({ ...createForm, categories: cats });
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
              onEdit={() => { setEditTarget(t); setEditForm({ name: t.name, type: t.type }); }}
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

  if (loading) return <Skeleton className="h-96 rounded-xl" />;

  const activeCount = data.filter((t) => t.isActive).length;

  return (
    <>
      <PageHeader
        title="Template Penilaian"
        description={`${data.length} template`}
        actions={
          <Button size="sm" onClick={() => { setCreateForm({ name: "", programId: "", type: "SEMESTER", categories: [{ ...EMPTY_CATEGORY }] }); setCreateDialog(true); }}>
            <Plus size={14} className="mr-1.5" /> Buat Template
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Template" value={data.length} icon={ClipboardList} color="primary" index={0} />
        <StatCard label="Aktif" value={activeCount} icon={ClipboardList} color="success" index={1} />
        <StatCard label="Nonaktif" value={data.length - activeCount} icon={ClipboardList} color="warning" index={2} />
      </div>

      <DataTableToolbar searchPlaceholder="Cari template atau program..." onSearchChange={setSearch} />

      <DataTable
        columns={columnsWithActions}
        data={filtered}
        defaultSort={{ field: "name", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada template penilaian"
        emptyDescription="Buat template untuk mulai menilai siswa."
      />

      {/* Create Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Buat Template Penilaian</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4 py-2">
              <Field><FieldLabel>Nama Template *</FieldLabel><Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Laporan Perkembangan Semester 1" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Program *</FieldLabel>
                  <Select value={createForm.programId} onValueChange={(v) => v && setCreateForm({ ...createForm, programId: v })}>
                    <SelectTrigger><SelectValue placeholder="Pilih program" /></SelectTrigger>
                    <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Tipe</FieldLabel>
                  <Select value={createForm.type} onValueChange={(v) => v && setCreateForm({ ...createForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEMESTER">Semester</SelectItem>
                      <SelectItem value="QUARTERLY">Kuartal</SelectItem>
                      <SelectItem value="MONTHLY">Bulanan</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Kategori & Indikator</span>
                  <Button size="sm" variant="outline" onClick={addCategory}><Plus size={12} className="mr-1" /> Kategori</Button>
                </div>
                {createForm.categories.map((cat, ci) => (
                  <div key={ci} className="border rounded-lg p-3 mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input className="flex-1" placeholder="Nama kategori" value={cat.name} onChange={(e) => updateCategory(ci, e.target.value)} />
                      {createForm.categories.length > 1 && (
                        <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => removeCategory(ci)}><Trash2 size={14} /></Button>
                      )}
                    </div>
                    {cat.indicators.map((ind, ii) => (
                      <div key={ii} className="flex items-center gap-2 pl-4">
                        <Input className="flex-1 text-sm" placeholder={`Indikator ${ii + 1}`} value={ind} onChange={(e) => updateIndicator(ci, ii, e.target.value)} />
                        {cat.indicators.length > 1 && (
                          <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => removeIndicator(ci, ii)}><Trash2 size={12} /></Button>
                        )}
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" className="ml-4 text-xs" onClick={() => addIndicator(ci)}>+ Indikator</Button>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Menyimpan..." : "Buat Template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Template</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Field><FieldLabel>Nama *</FieldLabel><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
            <Field>
              <FieldLabel>Tipe</FieldLabel>
              <Select value={editForm.type} onValueChange={(v) => v && setEditForm({ ...editForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEMESTER">Semester</SelectItem>
                  <SelectItem value="QUARTERLY">Kuartal</SelectItem>
                  <SelectItem value="MONTHLY">Bulanan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {editTarget && (
              <div className="text-xs text-muted-foreground">
                <p>Program: {editTarget.program.name}</p>
                <p>{editTarget.categories.length} kategori, {editTarget.categories.reduce((s, c) => s + c.indicators.length, 0)} indikator</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={deactivateTarget?.isActive ? "Nonaktifkan Template" : "Aktifkan Template"}
        description={`Ubah status "${deactivateTarget?.name}"?`}
        confirmLabel={deactivateTarget?.isActive ? "Nonaktifkan" : "Aktifkan"}
        onConfirm={handleToggleActive}
        destructive={deactivateTarget?.isActive ?? false}
      />
    </>
  );
}
