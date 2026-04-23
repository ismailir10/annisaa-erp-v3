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
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

type Holiday = {
  id: string;
  date: string;
  name: string;
  type: string;
  isHalfDay: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  NATIONAL: "Nasional",
  ISLAMIC: "Islam",
  SCHOOL_CLOSURE: "Sekolah",
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ date: "", name: "", type: "NATIONAL", isHalfDay: false });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  async function fetchHolidays() {
    const res = await fetch("/api/config/holidays");
    setHolidays(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchHolidays(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ date: "", name: "", type: "NATIONAL", isHalfDay: false });
    setDialogOpen(true);
  }

  function openEdit(h: Holiday) {
    setEditing(h);
    setForm({ date: h.date, name: h.name, type: h.type, isHalfDay: h.isHalfDay });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.date || !form.name.trim()) { toast.error("Tanggal dan nama wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/config/holidays/${editing.id}` : "/api/config/holidays";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Hari libur diperbarui" : "Hari libur ditambahkan");
      setDialogOpen(false);
      fetchHolidays();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/config/holidays/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Dihapus"); setDeleteTarget(null); fetchHolidays(); }
    else toast.error("Gagal menghapus");
  }

  const columns: ColumnDef<Holiday>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tanggal" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {formatDateShort(row.original.date)}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nama" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.original.name}</span>
          {row.original.isHalfDay && <Badge variant="outline" className="text-xs">½ Hari</Badge>}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tipe" />
      ),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.type}
          label={TYPE_LABELS[row.original.type] ?? row.original.type}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => openEdit(row.original)}
          extraActions={[
            {
              label: "Hapus",
              icon: <Trash2 size={14} />,
              destructive: true,
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Hari Libur"
        description={`${holidays.length} hari libur terdaftar`}
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah Hari Libur
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={holidays}
        loading={loading}
        defaultSort={{ field: "date", order: "asc" }}
        emptyTitle="Belum ada hari libur"
        emptyDescription="Tambahkan hari libur untuk perhitungan hari kerja."
      />

      {/* Delete confirm */}
      <DeactivateConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        entityName={deleteTarget?.name ?? ""}
        action="delete"
        onConfirm={handleDelete}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="p-card">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Hari Libur" : "Tambah Hari Libur"}</DialogTitle>
            <DialogDescription>Hari libur mempengaruhi perhitungan hari kerja</DialogDescription>
          </DialogHeader>
          <div className="space-y-field py-2">
            <Field>
              <FieldLabel>Tanggal *</FieldLabel>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Nama *</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hari Raya Idul Fitri" />
            </Field>
            <Field>
              <FieldLabel>Tipe</FieldLabel>
              <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NATIONAL">Nasional</SelectItem>
                  <SelectItem value="ISLAMIC">Islam</SelectItem>
                  <SelectItem value="SCHOOL_CLOSURE">Penutupan Sekolah</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isHalfDay} onCheckedChange={(c) => setForm({ ...form, isHalfDay: !!c })} />
              Setengah hari
            </label>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
