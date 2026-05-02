"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
      <span className="text-sm tabular-nums">{row.original.actualWorkDays} hari</span>
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

function defaultPayrollPeriod() {
  const now = new Date();
  const endMonth = now.getMonth();
  const endYear = now.getFullYear();
  const startMonth = endMonth === 0 ? 11 : endMonth - 1;
  const startYear = endMonth === 0 ? endYear - 1 : endYear;
  return {
    start: `${startYear}-${String(startMonth + 1).padStart(2, "0")}-21`,
    end: `${endYear}-${String(endMonth + 1).padStart(2, "0")}-20`,
  };
}

export default function PayrollListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [data, setData] = useState<PayrollRun[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(() => defaultPayrollPeriod().start);
  const [periodEnd, setPeriodEnd] = useState(() => defaultPayrollPeriod().end);
  const [generating, setGenerating] = useState(false);

  const openCreate = useCallback(() => {
    const p = defaultPayrollPeriod();
    setPeriodStart(p.start);
    setPeriodEnd(p.end);
    setCreateOpen(true);
  }, []);

  // Auto-open dialog when arriving via ?create=1 (from dashboard quick-action).
  useEffect(() => {
    if (searchParams?.get("create") === "1") {
      openCreate();
      router.replace("/admin/payroll");
    }
  }, [searchParams, openCreate, router]);

  async function handleGenerate() {
    setGenerating(true);
    const res = await fetch("/api/payroll/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd }),
    });
    if (res.ok) {
      const d = await res.json();
      toast.success("Draft penggajian dibuat");
      setCreateOpen(false);
      router.push(`/admin/payroll/${d.id}`);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal membuat draft");
    }
    setGenerating(false);
  }

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

  // Stats fetch once — single groupBy endpoint, not three pageSize=1 list calls
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payroll/stats");
        if (!res.ok) return;
        const data = (await res.json()) as {
          total: number;
          draft: number;
          approved: number;
          slipsSent: number;
        };
        setStats(data);
      } catch {
        // Stats stay at default zeros — non-critical, don't block the page
      }
    })();
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
    } catch {
      toast.error("Gagal memuat data penggajian");
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
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" /> Buat Penggajian
          </Button>
        }
      />

      <StatsCardsRow>
        <StatCard label="Total Penggajian" value={stats.total} icon={Banknote} color="primary" index={0} />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="warning" index={1} />
        <StatCard label="Disetujui" value={stats.approved} icon={FileCheck} color="success" index={2} />
        <StatCard label="Slip Terkirim" value={stats.slipsSent} icon={Send} color="primary" index={3} />
      </StatsCardsRow>

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
              // F-22: `EXPORTED` removed — no code path produces this status.
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

      {/* Create Payroll — Dialog on desktop, Sheet on mobile */}
      {isMobile ? (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="bottom" className="h-auto">
            <SheetHeader>
              <SheetTitle>Buat Penggajian Baru</SheetTitle>
            </SheetHeader>
            <div className="space-y-field py-4">
              <PayrollPeriodBody periodStart={periodStart} setPeriodStart={setPeriodStart} periodEnd={periodEnd} setPeriodEnd={setPeriodEnd} />
            </div>
            <SheetFooter>
              <SheetClose><Button variant="ghost">Batal</Button></SheetClose>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "Memproses..." : "Buat Draft Penggajian"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Buat Penggajian Baru</DialogTitle>
            </DialogHeader>
            <div className="space-y-field py-2">
              <PayrollPeriodBody periodStart={periodStart} setPeriodStart={setPeriodStart} periodEnd={periodEnd} setPeriodEnd={setPeriodEnd} />
            </div>
            <DialogFooter>
              <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "Memproses..." : "Buat Draft Penggajian"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function PayrollPeriodBody({
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
}: {
  periodStart: string;
  setPeriodStart: (v: string) => void;
  periodEnd: string;
  setPeriodEnd: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel>Tanggal Mulai</FieldLabel>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Tanggal Selesai</FieldLabel>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Sistem akan menghitung hari kerja aktual, kehadiran per karyawan, dan semua komponen gaji.
      </p>
    </>
  );
}
