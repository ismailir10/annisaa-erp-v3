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
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Plus, Banknote, FileCheck, Clock, Send } from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  actualWorkDays: number;
  status: string;
  approvedAt: string | null;
  _count: { items: number };
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

const columns: ColumnDef<PayrollRun>[] = [
  {
    id: "period",
    accessorKey: "periodStart",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Periode" />
    ),
    cell: ({ row }) => {
      const run = row.original;
      return (
        <Link
          href={`/admin/payroll/${run.id}`}
          className="group"
        >
          <span className="text-sm font-medium group-hover:text-primary transition-colors">
            {run.periodStart} — {run.periodEnd}
          </span>
        </Link>
      );
    },
  },
  {
    id: "employees",
    header: "Karyawan",
    cell: ({ row }) => (
      <span className="text-sm">{row.original._count.items} orang</span>
    ),
  },
  {
    accessorKey: "actualWorkDays",
    header: "Hari Kerja",
    cell: ({ row }) => (
      <span className="text-sm font-currency">{row.original.actualWorkDays} hari</span>
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

export default function PayrollListPage() {
  const router = useRouter();
  const [data, setData] = useState<PayrollRun[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("periodStart");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, draft: 0, approved: 0, slipsSent: 0 });

  // Stats fetch once
  useEffect(() => {
    Promise.all([
      fetch("/api/payroll?pageSize=1&status=DRAFT").then(r => r.json()),
      fetch("/api/payroll?pageSize=1&status=APPROVED").then(r => r.json()),
      fetch("/api/payroll?pageSize=1&status=SLIPS_SENT").then(r => r.json()),
    ]).then(([draft, approved, sent]) => {
      const d = draft.pagination?.total ?? 0;
      const a = approved.pagination?.total ?? 0;
      const s = sent.pagination?.total ?? 0;
      setStats({ total: d + a + s, draft: d, approved: a, slipsSent: s });
    }).catch(() => { /* stats are non-critical */ });
  }, []);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/payroll?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch (err) {
      console.error("Failed to fetch payroll runs:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

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

  const columnsWithActions = useMemo<ColumnDef<PayrollRun>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() => router.push(`/admin/payroll/${row.original.id}`)}
          />
        ),
      },
    ],
    [router],
  );

  return (
    <>
      <PageHeader
        title="Penggajian"
        description={`${pagination.total} riwayat penggajian`}
        actions={
          <Link href="/admin/payroll/new">
            <Button size="sm">
              <Plus size={14} className="mr-1.5" /> Buat Penggajian
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Penggajian" value={stats.total} icon={Banknote} color="primary" index={0} />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="warning" index={1} />
        <StatCard label="Disetujui" value={stats.approved} icon={FileCheck} color="success" index={2} />
        <StatCard label="Slip Terkirim" value={stats.slipsSent} icon={Send} color="primary" index={3} />
      </div>

      <DataTableToolbar
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: [
              { value: "all", label: "Semua Status" },
              { value: "DRAFT", label: "Draft" },
              { value: "APPROVED", label: "Disetujui" },
              { value: "EXPORTED", label: "Diekspor" },
              { value: "SLIPS_SENT", label: "Slip Terkirim" },
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
        defaultSort={{ field: "periodStart", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada penggajian"
        emptyDescription="Mulai dengan membuat penggajian baru."
      />
    </>
  );
}
