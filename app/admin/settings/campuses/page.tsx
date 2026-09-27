"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { ACTIVE_STATUS_OPTIONS } from "@/lib/constants/filter-options";
import { LocateFixed, Plus } from "lucide-react";
import { toast } from "sonner";

type Campus = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  _count: { employees: number };
};

// The API's `?status=` accepts ACTIVE | INACTIVE | ALL (default ACTIVE) —
// the toolbar filter uses the shared "all" value, translated below.
type StatusFilter = "all" | "ACTIVE" | "INACTIVE";

export default function CampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campus | null>(null);
  // FIND-004: surface deactivated campuses via an explicit filter so the
  // admin can reactivate them without dropping into SQL.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [query, setQuery] = useState("");

  const fetchCampuses = useCallback(async (filter: StatusFilter) => {
    setLoading(true);
    const param = filter === "all" ? "ALL" : filter;
    const res = await fetch(`/api/config/campuses?status=${param}`);
    setCampuses(await res.json());
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCampuses(statusFilter); }, [fetchCampuses, statusFilter]);

  const handleReactivate = useCallback(
    async (c: Campus) => {
      const res = await fetch(`/api/config/campuses/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (res.ok) {
        toast.success("Kampus diaktifkan kembali");
        fetchCampuses(statusFilter);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Gagal mengaktifkan kampus. Coba lagi.");
      }
    },
    [fetchCampuses, statusFilter],
  );

  const openNew = useCallback(() => {
    setEditing(null);
    setForm({ name: "", address: "", lat: "", lng: "" });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((c: Campus) => {
    setEditing(c);
    setForm({
      name: c.name,
      address: c.address ?? "",
      lat: c.lat?.toString() ?? "",
      lng: c.lng?.toString() ?? "",
    });
    setDialogOpen(true);
  }, []);

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Nama wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/config/campuses/${editing.id}` : "/api/config/campuses";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Kampus diperbarui" : "Kampus ditambahkan");
      setDialogOpen(false);
      fetchCampuses(statusFilter);
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan kampus. Periksa kolom yang ditandai.");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/config/campuses/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Kampus dinonaktifkan");
      setDeleteTarget(null);
      fetchCampuses(statusFilter);
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menonaktifkan kampus. Coba lagi.");
    }
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) { toast.error("GPS tidak tersedia di perangkat ini. Isi koordinat manual."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(8),
          lng: pos.coords.longitude.toFixed(8),
        }));
        toast.success("Lokasi diperoleh");
      },
      () => toast.error("Gagal mendapatkan lokasi. Izinkan akses lokasi atau isi koordinat manual.")
    );
  }

  const filteredCampuses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campuses;
    return campuses.filter((c) =>
      [c.name, c.address ?? ""].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [campuses, query]);

  const columns = useMemo<ColumnDef<Campus>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Nama" />,
        cell: ({ row }) => (
          <div>
            <span className="text-sm font-medium">{row.original.name}</span>
            <p className="text-xs text-muted-foreground">
              {row.original._count.employees} karyawan
            </p>
          </div>
        ),
      },
      {
        accessorKey: "address",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Alamat" />,
        meta: { priority: "low" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.address || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          const isActive = c.status === "ACTIVE";
          return (
            <DataTableRowActions
              rowLabel={c.name}
              onEdit={isActive ? () => openEdit(c) : undefined}
              onDeactivate={isActive ? () => setDeleteTarget(c) : undefined}
              onActivate={!isActive ? () => handleReactivate(c) : undefined}
              isActive={isActive}
            />
          );
        },
      },
    ],
    [openEdit, handleReactivate],
  );

  return (
    <>
      <PageHeader
        title="Kampus"
        description="Kelola lokasi kampus/cabang sekolah"
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah Kampus
          </Button>
        }
      />

      <DataTableToolbar
        value={query}
        onValueChange={setQuery}
        searchPlaceholder="Cari nama atau alamat..."
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => setStatusFilter(v as StatusFilter),
            resetValue: "ACTIVE",
            options: ACTIVE_STATUS_OPTIONS,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredCampuses}
        loading={loading}
        defaultSort={{ field: "name", order: "asc" }}
        emptyTitle={statusFilter === "INACTIVE" ? "Tidak ada kampus nonaktif" : "Belum ada kampus"}
        emptyDescription={
          statusFilter === "INACTIVE"
            ? "Semua kampus saat ini aktif."
            : "Tambahkan lokasi kampus/cabang untuk mulai mengelola karyawan per kampus."
        }
      />

      {/* Add/Edit Dialog */}
      <ResponsiveFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Kampus" : "Tambah Kampus"}
        description={editing ? "Perbarui informasi kampus" : "Tambahkan lokasi kampus baru"}
        footer={<>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Kampus"}
          </Button>
        </>}
      >
            <Field>
              <FieldLabel required htmlFor="campus-name">Nama</FieldLabel>
              <Input id="campus-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Taman Aster" required aria-required="true" />
            </Field>
            <Field>
              <FieldLabel htmlFor="campus-address">Alamat</FieldLabel>
              <Input id="campus-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Jl. Contoh No.1, Bekasi" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="campus-lat">Latitude</FieldLabel>
                <Input id="campus-lat" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="-6.2234" type="number" step="any" />
              </Field>
              <Field>
                <FieldLabel htmlFor="campus-lng">Longitude</FieldLabel>
                <Input id="campus-lng" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="106.8432" type="number" step="any" />
              </Field>
            </div>
            <Button variant="outline" size="sm" onClick={getCurrentLocation} type="button">
              <LocateFixed size={14} className="mr-1.5" /> Ambil Lokasi Saat Ini
            </Button>
      </ResponsiveFormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Nonaktifkan Kampus"
        description={`Nonaktifkan "${deleteTarget?.name}"? Kampus akan disembunyikan dari daftar tetapi data historis tetap utuh. Kampus dengan karyawan aktif tidak bisa dinonaktifkan.`}
        onConfirm={handleDelete}
        confirmLabel="Nonaktifkan"
        destructive
      />
    </>
  );
}
