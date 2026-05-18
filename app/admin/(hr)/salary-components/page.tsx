"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type Component = {
  id: string;
  code: string;
  label: string;
  category: string;
  calcType: string;
  isProRated: boolean;
  isEnabled: boolean;
  sortOrder: number;
};

const CALC_LABELS: Record<string, string> = {
  FIXED: "Tetap",
  PCT_OF_BASE: "% Gaji Pokok",
  ATTENDANCE_BASED: "Kehadiran",
};

export default function SalaryComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);
  const [form, setForm] = useState({
    code: "", label: "", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: "0",
  });
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Component | null>(null);

  async function fetchComponents() {
    const res = await fetch("/api/salary-components");
    setComponents(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchComponents(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ code: "", label: "", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: String(components.length + 1) });
    setDialogOpen(true);
  }

  function openEdit(c: Component) {
    setEditing(c);
    setForm({
      code: c.code, label: c.label, category: c.category, calcType: c.calcType,
      isProRated: c.isProRated, sortOrder: String(c.sortOrder),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim()) { toast.error("Label wajib diisi"); return; }
    if (!editing && !form.code.trim()) { toast.error("Kode wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/salary-components/${editing.id}` : "/api/salary-components";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) }),
    });
    if (res.ok) {
      toast.success(editing ? "Komponen diperbarui" : "Komponen ditambahkan");
      setDialogOpen(false);
      fetchComponents();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function toggleEnabled(c: Component) {
    const res = await fetch(`/api/salary-components/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !c.isEnabled }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Gagal memperbarui komponen");
      return;
    }
    toast.success(c.isEnabled ? "Komponen dinonaktifkan" : "Komponen diaktifkan");
    fetchComponents();
  }

  const columns: ColumnDef<Component>[] = [
    {
      accessorKey: "sortOrder",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="#" />
      ),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.sortOrder}</span>
      ),
    },
    {
      accessorKey: "label",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Komponen" />
      ),
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className={!c.isEnabled ? "opacity-50" : ""}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              <Badge variant="outline" className="text-xs font-currency">{c.code}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{CALC_LABELS[c.calcType]}</span>
              {c.isProRated && <span className="text-xs text-muted-foreground">· Pro-rata</span>}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Kategori" />
      ),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.category}
          label={row.original.category === "INCOME" ? "Pendapatan" : "Potongan"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <DataTableRowActions
            onEdit={() => openEdit(c)}
            isActive={c.isEnabled}
            onDeactivate={() => setConfirmTarget(c)}
            onActivate={() => toggleEnabled(c)}
          />
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Komponen Gaji"
        description="Konfigurasi komponen pendapatan dan potongan"
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah Komponen
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={components}
        loading={loading}
        defaultSort={{ field: "sortOrder", order: "asc" }}
        emptyTitle="Belum ada komponen gaji"
        emptyDescription="Tambahkan komponen pendapatan dan potongan."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="p-card sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Komponen" : "Tambah Komponen"}</DialogTitle>
            <DialogDescription>Komponen gaji menentukan struktur penggajian</DialogDescription>
          </DialogHeader>
          <div className="space-y-field py-2">
            {!editing && (
              <Field>
                <FieldLabel required>Kode</FieldLabel>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="tunjangan_baru" />
              </Field>
            )}
            <Field>
              <FieldLabel required>Label</FieldLabel>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Tunjangan Baru" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Kategori</FieldLabel>
                <Select value={form.category} onValueChange={(v) => v && setForm({ ...form, category: v })} items={{ INCOME: "Pendapatan", DEDUCTION: "Potongan" }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Pendapatan</SelectItem>
                    <SelectItem value="DEDUCTION">Potongan</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Tipe Kalkulasi</FieldLabel>
                <Select value={form.calcType} onValueChange={(v) => v && setForm({ ...form, calcType: v })} items={{ FIXED: "Tetap", PCT_OF_BASE: "% Gaji Pokok", ATTENDANCE_BASED: "Berbasis Kehadiran" }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Tetap</SelectItem>
                    <SelectItem value="PCT_OF_BASE">% Gaji Pokok</SelectItem>
                    <SelectItem value="ATTENDANCE_BASED">Berbasis Kehadiran</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Urutan</FieldLabel>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isProRated} onCheckedChange={(c) => setForm({ ...form, isProRated: !!c })} />
              Pro-rata (dihitung berdasarkan hari hadir)
            </label>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Komponen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate guard — activation stays single-click (non-destructive) */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent className="p-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan komponen ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.label} tidak akan masuk perhitungan penggajian berikutnya. Bisa diaktifkan kembali kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmTarget) toggleEnabled(confirmTarget);
                setConfirmTarget(null);
              }}
            >
              Ya, Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
