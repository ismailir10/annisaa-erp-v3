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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Users, UserCheck, UserX } from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Guardian = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string;
  _count: { guardians: number };
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Guardian>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nama" />,
    cell: ({ row }) => (
      <span className="text-sm font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Telepon",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.email || "—"}</span>
    ),
  },
  {
    id: "students",
    header: "Siswa",
    cell: ({ row }) => (
      <span className="text-sm">{row.original._count.guardians} siswa</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function GuardiansPage() {
  const [data, setData] = useState<Guardian[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  const [editTarget, setEditTarget] = useState<Guardian | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Guardian | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", whatsapp: "" });
  const [saving, setSaving] = useState(false);

  // Stats
  useEffect(() => {
    Promise.all([
      fetch("/api/guardians?pageSize=1").then(r => r.json()),
      fetch("/api/guardians?pageSize=1&status=ACTIVE").then(r => r.json()),
      fetch("/api/guardians?pageSize=1&status=INACTIVE").then(r => r.json()),
    ]).then(([all, active, inactive]) => {
      setStats({
        total: all.pagination?.total ?? 0,
        active: active.pagination?.total ?? 0,
        inactive: inactive.pagination?.total ?? 0,
      });
    }).catch(() => {});
  }, []);

  const fetchGuardians = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize), sortBy, sortOrder });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/guardians?${params}`);
      if (!res.ok) { toast.error("Gagal memuat data wali"); return; }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data wali");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, status, sortBy, sortOrder]);

  useEffect(() => { fetchGuardians(); }, [fetchGuardians]);

  const handleSearchChange = useCallback((value: string) => { setSearch(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handleStatusChange = useCallback((value: string) => { setStatus(value); setPagination(p => ({ ...p, page: 1 })); }, []);
  const handlePageChange = useCallback((page: number) => { setPagination(p => ({ ...p, page })); }, []);
  const handlePageSizeChange = useCallback((pageSize: number) => { setPagination(p => ({ ...p, page: 1, pageSize })); }, []);
  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => { setSortBy(field); setSortOrder(order); setPagination(p => ({ ...p, page: 1 })); }, []);

  async function handleEditSave() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch(`/api/guardians/${editTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal menyimpan"); setSaving(false); return; }
    toast.success("Data wali diperbarui");
    setEditTarget(null);
    setSaving(false);
    fetchGuardians();
  }

  async function handleStatusToggle() {
    if (!deactivateTarget) return;
    const newStatus = deactivateTarget.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const res = await fetch(`/api/guardians/${deactivateTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error || "Gagal mengubah status"); return; }
    toast.success(newStatus === "ACTIVE" ? "Wali diaktifkan" : "Wali dinonaktifkan");
    setDeactivateTarget(null);
    fetchGuardians();
  }

  const columnsWithActions = useMemo<ColumnDef<Guardian>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const g = row.original;
          return (
            <DataTableRowActions
              onEdit={() => { setEditTarget(g); setEditForm({ name: g.name, email: g.email || "", phone: g.phone || "", whatsapp: g.whatsapp || "" }); }}
              onDeactivate={g.status !== "INACTIVE" ? () => setDeactivateTarget(g) : undefined}
              onActivate={g.status === "INACTIVE" ? () => setDeactivateTarget(g) : undefined}
              isActive={g.status !== "INACTIVE"}
            />
          );
        },
      },
    ],
    [],
  );

  if (loading && data.length === 0) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <>
      <PageHeader title="Wali Murid" description={`${pagination.total} wali terdaftar`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Wali" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Tidak Aktif" value={stats.inactive} icon={UserX} color="warning" index={2} />
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama, email, atau telepon..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: status,
            onChange: handleStatusChange,
            options: [
              { value: "all", label: "Semua Status" },
              { value: "ACTIVE", label: "Aktif" },
              { value: "INACTIVE", label: "Tidak Aktif" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columnsWithActions}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "name", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada wali terdaftar"
        emptyDescription="Wali murid akan otomatis muncul saat mendaftarkan siswa."
      />

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Wali</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Field><FieldLabel>Nama *</FieldLabel><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
            <Field><FieldLabel>Email</FieldLabel><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
            <Field><FieldLabel>Telepon</FieldLabel><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
            <Field><FieldLabel>WhatsApp</FieldLabel><Input value={editForm.whatsapp} onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })} /></Field>
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
        title={deactivateTarget?.status === "INACTIVE" ? "Aktifkan Wali" : "Nonaktifkan Wali"}
        description={`Ubah status "${deactivateTarget?.name}"? Data tidak akan dihapus.`}
        confirmLabel={deactivateTarget?.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}
        onConfirm={handleStatusToggle}
        destructive={deactivateTarget?.status !== "INACTIVE"}
      />
    </>
  );
}
