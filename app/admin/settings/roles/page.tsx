"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, ShieldCheck, Lock } from "lucide-react";
import { PERMISSION_GROUPS, getSystemRolePermissions } from "@/lib/permissions";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type RoleRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  permissions: string; // JSON string
  _count: { users: number };
};

// ------------------------------------------------------------------
// System role cards
// ------------------------------------------------------------------

const SYSTEM_ROLES = [
  {
    role: "SCHOOL_ADMIN",
    name: "Admin Sekolah",
    description: "Akses penuh ke semua fitur sistem",
    icon: ShieldCheck,
    color: "text-primary" as const,
  },
  {
    role: "TEACHER",
    name: "Guru",
    description: "Akses kehadiran dan data siswa di kelas yang diajar",
    icon: Shield,
    color: "text-success" as const,
  },
  {
    role: "GUARDIAN",
    name: "Wali Murid",
    description: "Akses data anak, tagihan, kehadiran, dan rapor",
    icon: Shield,
    color: "text-warning" as const,
  },
];

function SystemRoleCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {SYSTEM_ROLES.map((sr) => {
        const perms = getSystemRolePermissions(sr.role);
        return (
          <div
            key={sr.role}
            className="bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <sr.icon size={20} className={sr.color} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{sr.name}</h3>
                  <Badge variant="secondary" className="text-xs">
                    <Lock size={10} className="mr-1" />
                    Bawaan
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sr.description}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {perms.length === Object.values(PERMISSION_GROUPS).flatMap((g) => Object.keys(g.permissions)).length
                ? "Semua izin"
                : `${perms.length} izin`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// Permission Checkboxes
// ------------------------------------------------------------------

function PermissionCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (perms: string[]) => void;
}) {
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((p) => p !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const toggleGroup = (groupPerms: string[]) => {
    const allSelected = groupPerms.every((p) => selected.includes(p));
    if (allSelected) {
      onChange(selected.filter((p) => !groupPerms.includes(p)));
    } else {
      const newPerms = new Set([...selected, ...groupPerms]);
      onChange(Array.from(newPerms));
    }
  };

  return (
    <div className="space-y-5 max-h-80 overflow-y-auto pr-2">
      {Object.entries(PERMISSION_GROUPS).map(([key, group]) => {
        const groupPerms = Object.keys(group.permissions);
        const allSelected = groupPerms.every((p) => selected.includes(p));
        const someSelected =
          !allSelected && groupPerms.some((p) => selected.includes(p));

        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={() => toggleGroup(groupPerms)}
              />
              <span className="text-sm font-semibold">{group.label}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 ml-6">
              {Object.entries(group.permissions).map(([code, label]) => (
                <label
                  key={code}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(code)}
                    onCheckedChange={() => toggle(code)}
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------
// Columns for custom roles
// ------------------------------------------------------------------

function buildColumns(
  onEdit: (role: RoleRow) => void,
  onDelete: (role: RoleRow) => void
): ColumnDef<RoleRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nama" />
      ),
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium">{row.original.name}</span>
          {row.original.description && (
            <p className="text-xs text-muted-foreground">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: "Kode",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-mono">
          {row.original.code}
        </Badge>
      ),
    },
    {
      id: "permCount",
      header: "Jumlah Izin",
      cell: ({ row }) => {
        const perms = safeParsePermissions(row.original.permissions);
        return <span className="text-sm">{perms.length}</span>;
      },
    },
    {
      id: "userCount",
      header: "Pengguna",
      cell: ({ row }) => (
        <span className="text-sm">{row.original._count.users}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => onEdit(row.original)}
          extraActions={[
            {
              label: "Hapus",
              destructive: true,
              onClick: () => onDelete(row.original),
            },
          ]}
        />
      ),
    },
  ];
}

function safeParsePermissions(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles");
      if (!res.ok) {
        toast.error("Gagal memuat peran");
        return;
      }
      const json = await res.json();
      setRoles(json.data ?? []);
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Separate system and custom roles
  const customRoles = useMemo(
    () => roles.filter((r) => !r.isSystem),
    [roles]
  );

  // Open create dialog
  const openCreate = useCallback(() => {
    setEditTarget(null);
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setFormPermissions([]);
    setDialogOpen(true);
  }, []);

  // Open edit dialog
  const openEdit = useCallback((role: RoleRow) => {
    setEditTarget(role);
    setFormName(role.name);
    setFormCode(role.code);
    setFormDescription(role.description ?? "");
    setFormPermissions(safeParsePermissions(role.permissions));
    setDialogOpen(true);
  }, []);

  // Save (create or update)
  const handleSave = useCallback(async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error("Nama dan kode wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const url = editTarget
        ? `/api/roles/${editTarget.id}`
        : "/api/roles";
      const method = editTarget ? "PUT" : "POST";
      const body = editTarget
        ? { name: formName, description: formDescription, permissions: formPermissions }
        : { name: formName, code: formCode, description: formDescription, permissions: formPermissions };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal menyimpan");
        return;
      }
      toast.success(editTarget ? "Peran berhasil diperbarui" : "Peran berhasil dibuat");
      setDialogOpen(false);
      fetchRoles();
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  }, [editTarget, formName, formCode, formDescription, formPermissions, fetchRoles]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/roles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal menghapus");
        return;
      }
      toast.success("Peran berhasil dihapus");
      setDeleteTarget(null);
      fetchRoles();
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchRoles]);

  const columns = useMemo(
    () => buildColumns(openEdit, (role) => setDeleteTarget(role)),
    [openEdit]
  );

  // Dummy pagination for DataTable (client-side since custom roles will be few)
  const pagination = useMemo(
    () => ({
      page: 1,
      pageSize: 50,
      total: customRoles.length,
      totalPages: 1,
    }),
    [customRoles.length]
  );

  return (
    <>
      <PageHeader
        title="Peran & Izin"
        description="Kelola peran dan izin akses pengguna"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" /> Tambah Peran
          </Button>
        }
      />

      {/* System Roles */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Peran Bawaan
      </h2>
      <SystemRoleCards />

      {/* Custom Roles */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Peran Kustom
      </h2>
      <DataTable
        columns={columns}
        data={customRoles}
        pagination={pagination}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onSortChange={() => {}}
        defaultSort={{ field: "name", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada peran kustom"
        emptyDescription="Buat peran kustom untuk mengatur izin akses yang lebih spesifik."
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Peran" : "Tambah Peran"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel>Nama Peran</FieldLabel>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Contoh: Admin Keuangan"
              />
            </Field>

            <Field>
              <FieldLabel>Kode</FieldLabel>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="Contoh: FINANCE_ADMIN"
                disabled={!!editTarget}
              />
              <FieldDescription>
                Huruf kapital, angka, dan underscore. Tidak bisa diubah setelah dibuat.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Deskripsi</FieldLabel>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Deskripsi singkat peran ini..."
                rows={2}
              />
            </Field>

            <div>
              <p className="text-sm font-medium mb-2">Izin Akses</p>
              <PermissionCheckboxes
                selected={formPermissions}
                onChange={setFormPermissions}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Batal
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Peran</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus peran &quot;{deleteTarget?.name}
              &quot;? Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
