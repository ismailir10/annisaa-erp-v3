"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { ACTIVE_STATUS_OPTIONS } from "@/lib/constants/filter-options";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Users, ShieldCheck, GraduationCap, UserX } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  customRoleId: string | null;
  customRole: { id: string; name: string; code: string } | null;
};

type RoleOption = {
  id: string;
  name: string;
  code: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Role label mapping
// ------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "Admin",
  TEACHER: "Guru",
  GUARDIAN: "Wali Murid",
};

function getRoleLabel(user: UserRow): string {
  if (user.customRole) return user.customRole.name;
  return ROLE_LABELS[user.role] ?? user.role;
}

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

function buildColumns(
  onEdit: (user: UserRow) => void,
  onToggleStatus: (user: UserRow) => void
): ColumnDef<UserRow>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nama" />
      ),
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-bold">
                {(u.name ?? u.email)[0].toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium">{u.name ?? "—"}</span>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      header: "Peran",
      cell: ({ row }) => (
        <span className="text-sm">{getRoleLabel(row.original)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "lastLoginAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Login Terakhir" />
      ),
      cell: ({ row }) => {
        const d = row.original.lastLoginAt;
        if (!d) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {formatDateShort(d.split("T")[0])}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <DataTableRowActions
            onEdit={() => onEdit(u)}
            onDeactivate={
              u.status === "ACTIVE" ? () => onToggleStatus(u) : undefined
            }
            onActivate={
              u.status === "INACTIVE" ? () => onToggleStatus(u) : undefined
            }
            isActive={u.status === "ACTIVE"}
          />
        );
      },
    },
  ];
}

// ------------------------------------------------------------------
// Page component
// ------------------------------------------------------------------

export default function UsersPage() {
  const [data, setData] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [stats, setStats] = useState({
    total: 0,
    admin: 0,
    teacher: 0,
    guardian: 0,
    inactive: 0,
  });

  // Roles for the edit dialog
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");
  const [saving, setSaving] = useState(false);

  // Fetch roles once
  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((json) => setRoles(json.data ?? []))
      .catch((err) => console.error("[users] roles fetch failed", err));
  }, []);

  // Stats fetch
  useEffect(() => {
    Promise.all([
      fetch("/api/users?pageSize=1&status=ACTIVE&role=SCHOOL_ADMIN").then((r) =>
        r.json()
      ),
      fetch("/api/users?pageSize=1&status=ACTIVE&role=TEACHER").then((r) =>
        r.json()
      ),
      fetch("/api/users?pageSize=1&status=ACTIVE&role=GUARDIAN").then((r) =>
        r.json()
      ),
      fetch("/api/users?pageSize=1&status=INACTIVE").then((r) => r.json()),
    ])
      .then(([admin, teacher, guardian, inactive]) => {
        const a = admin.pagination?.total ?? 0;
        const t = teacher.pagination?.total ?? 0;
        const g = guardian.pagination?.total ?? 0;
        const i = inactive.pagination?.total ?? 0;
        setStats({
          total: a + t + g,
          admin: a,
          teacher: t,
          guardian: g,
          inactive: i,
        });
      })
      .catch((err) => console.error("[users] stats fetch failed", err));
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Terjadi kesalahan");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data pengguna");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, status, roleFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatus(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleRoleFilterChange = useCallback((value: string) => {
    setRoleFilter(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback(
    (field: string, order: "asc" | "desc") => {
      setSortBy(field);
      setSortOrder(order);
      setPagination((p) => ({ ...p, page: 1 }));
    },
    []
  );

  // Edit dialog
  const openEdit = useCallback((user: UserRow) => {
    setEditTarget(user);
    setEditRoleId(user.customRoleId ?? "none");
    setEditStatus(user.status);
  }, []);

  const handleToggleStatus = useCallback(
    async (user: UserRow) => {
      const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal mengubah status");
        return;
      }
      toast.success(
        newStatus === "ACTIVE"
          ? "Pengguna diaktifkan"
          : "Pengguna dinonaktifkan"
      );
      fetchUsers();
    },
    [fetchUsers]
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customRoleId: editRoleId === "none" ? null : editRoleId,
          status: editStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal menyimpan");
        return;
      }
      toast.success("Pengguna diperbarui");
      setEditTarget(null);
      fetchUsers();
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  }, [editTarget, editRoleId, editStatus, fetchUsers]);

  const columns = useMemo(
    () => buildColumns(openEdit, handleToggleStatus),
    [openEdit, handleToggleStatus]
  );

  return (
    <>
      <PageHeader
        title="Pengguna"
        description={`${pagination.total} pengguna terdaftar`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Total Aktif"
          value={stats.total}
          icon={Users}
          color="primary"
          index={0}
        />
        <StatCard
          label="Admin"
          value={stats.admin}
          icon={ShieldCheck}
          color="primary"
          index={1}
        />
        <StatCard
          label="Guru"
          value={stats.teacher}
          icon={Users}
          color="success"
          index={2}
        />
        <StatCard
          label="Wali Murid"
          value={stats.guardian}
          icon={GraduationCap}
          color="warning"
          index={3}
        />
        <StatCard
          label="Tidak Aktif"
          value={stats.inactive}
          icon={UserX}
          color="error"
          index={4}
        />
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama atau email..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "role",
            label: "Peran",
            value: roleFilter,
            onChange: handleRoleFilterChange,
            options: [
              { value: "all", label: "Semua Peran" },
              { value: "SCHOOL_ADMIN", label: "Admin" },
              { value: "TEACHER", label: "Guru" },
              { value: "GUARDIAN", label: "Wali Murid" },
            ],
          },
          {
            key: "status",
            label: "Status",
            value: status,
            onChange: handleStatusChange,
            options: ACTIVE_STATUS_OPTIONS,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "name", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada pengguna"
        emptyDescription="Pengguna akan muncul setelah login pertama kali."
      />

      {/* Edit Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
          </DialogHeader>

          <div className="space-y-field py-2">
            <div>
              <p className="text-sm font-medium">{editTarget?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {editTarget?.email}
              </p>
            </div>

            <Field>
              <FieldLabel>Peran Kustom</FieldLabel>
              <Select value={editRoleId} onValueChange={(v) => v && setEditRoleId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih peran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa peran kustom</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select value={editStatus} onValueChange={(v) => v && setEditStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Batal
            </DialogClose>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
