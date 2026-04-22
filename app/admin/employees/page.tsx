"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { ACTIVE_STATUS_OPTIONS } from "@/lib/constants/filter-options";
import { Button } from "@/components/ui/button";
import { Plus, Users, UserCheck, UserX } from "lucide-react";
import { formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Employee = {
  id: string;
  kode: string;
  nama: string;
  email: string;
  jabatan: string;
  status: string;
  campusId: string;
  bankAccountNo: string | null;
  bpjsEnrolled: boolean;
  createdAt: string;
  campus: { name: string };
};

type Campus = { id: string; name: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Employee>[] = [
  {
    accessorKey: "nama",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Nama" />
    ),
    cell: ({ row }) => {
      const e = row.original;
      return (
        <Link
          href={`/admin/employees/${e.id}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-primary text-xs font-bold">{e.nama[0]}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {e.nama}
              </span>
              <span className="font-currency text-xs text-muted-foreground">
                {e.kode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{e.email}</p>
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: "jabatan",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Jabatan" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.original.jabatan}</span>
    ),
  },
  {
    id: "campus",
    header: "Kampus",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.campus.name}</span>
    ),
  },
  {
    id: "bank",
    header: "Rekening",
    cell: ({ row }) => {
      if (!row.original.bankAccountNo) {
        return <StatusBadge status="UNFILLED" />;
      }
      return (
        <span className="text-xs text-muted-foreground font-currency">
          ••• {row.original.bankAccountNo.slice(-4)}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dibuat" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateShort(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function EmployeesPage() {
  const router = useRouter();
  const [data, setData] = useState<Employee[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);

  // Fetch campuses + stats once
  useEffect(() => {
    fetch("/api/config/campuses")
      .then((r) => r.json())
      .then((c) => setCampuses(Array.isArray(c) ? c : []))
      .catch((err) => console.error("[employees] campuses fetch failed", err));
    // Quick stats — fetch all with minimal data
    Promise.all([
      fetch("/api/employees?pageSize=1&status=ACTIVE").then(r => r.json()),
      fetch("/api/employees?pageSize=1&status=INACTIVE").then(r => r.json()),
    ]).then(([active, inactive]) => {
      const a = active.pagination?.total ?? 0;
      const i = inactive.pagination?.total ?? 0;
      setStats({ total: a + i, active: a, inactive: i });
    }).catch((err) => console.error("[employees] stats fetch failed", err));
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (campusFilter !== "all") params.set("campusId", campusFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/employees?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data karyawan");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, campusFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => {
    setSortBy(field);
    setSortOrder(order);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    const res = await fetch(`/api/employees/${deactivateTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    });
    if (res.ok) {
      toast.success(`${deactivateTarget.nama} dinonaktifkan`);
      setDeactivateTarget(null);
      fetchEmployees();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal menonaktifkan karyawan");
    }
  }, [deactivateTarget, fetchEmployees]);

  const columnsWithActions = useMemo<ColumnDef<Employee>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() => router.push(`/admin/employees/${row.original.id}`)}
            onEdit={() => router.push(`/admin/employees/${row.original.id}`)}
            onDeactivate={
              row.original.status === "ACTIVE"
                ? () => setDeactivateTarget(row.original)
                : undefined
            }
            isActive={row.original.status === "ACTIVE"}
          />
        ),
      },
    ],
    [router],
  );

  // Build campus filter options dynamically
  const campusOptions = [
    { value: "all", label: "Semua Kampus" },
    ...campuses.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <>
      <PageHeader
        title="Karyawan"
        description={`${pagination.total} karyawan terdaftar`}
        actions={
          <Link href="/admin/employees/new">
            <Button size="sm">
              <Plus size={14} className="mr-1.5" /> Tambah
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <StatsCardsRow cols={3}>
        <StatCard label="Total Karyawan" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Aktif" value={stats.active} icon={UserCheck} color="success" index={1} />
        <StatCard label="Tidak Aktif" value={stats.inactive} icon={UserX} color="error" index={2} />
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari nama, kode, atau email..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "campus",
            label: "Kampus",
            value: campusFilter,
            onChange: (v) => {
              setCampusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: campusOptions,
          },
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: ACTIVE_STATUS_OPTIONS,
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
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada karyawan"
        emptyDescription="Tambahkan karyawan baru untuk memulai."
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title="Nonaktifkan Karyawan"
        description={`Nonaktifkan "${deactivateTarget?.nama}"? Data tidak akan dihapus dan dapat diaktifkan kembali.`}
        onConfirm={handleDeactivate}
        confirmLabel="Nonaktifkan"
      />
    </>
  );
}
