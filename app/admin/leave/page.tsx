"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  employee: {
    nama: string;
    kode: string;
    jabatan: string;
    campus: { name: string };
  };
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Sakit",
  PERMISSION: "Izin",
  OTHER: "Lainnya",
};

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function AdminLeavePage() {
  const [data, setData] = useState<LeaveRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  // Stats fetch once
  useEffect(() => {
    Promise.all([
      fetch("/api/leave/requests?pageSize=1&status=PENDING").then(r => r.json()),
      fetch("/api/leave/requests?pageSize=1&status=APPROVED").then(r => r.json()),
      fetch("/api/leave/requests?pageSize=1&status=REJECTED").then(r => r.json()),
    ]).then(([pending, approved, rejected]) => {
      const p = pending.pagination?.total ?? 0;
      const a = approved.pagination?.total ?? 0;
      const r = rejected.pagination?.total ?? 0;
      setStats({ total: p + a + r, pending: p, approved: a, rejected: r });
    }).catch(() => {});
  }, []);

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/leave/requests?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch (err) {
      console.error("Failed to fetch leave requests:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

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

  function openReview(req: LeaveRequest, action: "approve" | "reject") {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNote("");
  }

  async function handleReview() {
    if (!reviewTarget) return;
    if (reviewAction === "reject" && !reviewNote.trim()) {
      toast.error("Alasan penolakan wajib diisi");
      return;
    }
    setReviewing(true);
    const res = await fetch(`/api/leave/requests/${reviewTarget.id}/${reviewAction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reviewNote }),
    });
    if (res.ok) {
      toast.success(reviewAction === "approve" ? "Cuti disetujui" : "Cuti ditolak");
      setReviewTarget(null);
      fetchRequests();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal memproses");
    }
    setReviewing(false);
  }

  // ------------------------------------------------------------------
  // Columns (needs access to openReview)
  // ------------------------------------------------------------------

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      id: "employee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Karyawan" />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{r.employee.nama}</span>
              <span className="font-currency text-[10px] text-muted-foreground">
                {r.employee.kode}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.employee.jabatan} · {r.employee.campus.name}
            </p>
          </div>
        );
      },
    },
    {
      id: "leave",
      header: "Cuti",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {TYPE_LABELS[r.leaveType] ?? r.leaveType}
              </Badge>
              <span className="text-xs font-medium">{r.days} hari</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.startDate} — {r.endDate}
            </p>
          </div>
        );
      },
    },
    {
      id: "reason",
      header: "Alasan",
      cell: ({ row }) => (
        <div className="max-w-[200px]">
          <p className="text-xs truncate">{row.original.reason}</p>
          {row.original.reviewNote && (
            <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">
              Catatan: {row.original.reviewNote}
            </p>
          )}
        </div>
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
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        if (r.status !== "PENDING") return null;
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[#00875A] border-[#00875A]/30 hover:bg-[#00875A]/10"
              onClick={() => openReview(r, "approve")}
            >
              <Check size={12} className="mr-1" /> Setuju
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => openReview(r, "reject")}
            >
              <X size={12} className="mr-1" /> Tolak
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Pengajuan Cuti"
        description={`${pagination.total} pengajuan`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Pengajuan" value={stats.total} icon={FileText} color="primary" index={0} />
        <StatCard label="Menunggu" value={stats.pending} icon={Clock} color="warning" index={1} />
        <StatCard label="Disetujui" value={stats.approved} icon={CheckCircle} color="success" index={2} />
        <StatCard label="Ditolak" value={stats.rejected} icon={XCircle} color="error" index={3} />
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama karyawan..."
        onSearchChange={handleSearchChange}
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
              { value: "PENDING", label: "Menunggu" },
              { value: "APPROVED", label: "Disetujui" },
              { value: "REJECTED", label: "Ditolak" },
              { value: "all", label: "Semua" },
            ],
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
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Tidak ada pengajuan cuti"
        emptyDescription="Pengajuan cuti dari guru akan muncul di sini."
      />

      {/* Review dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Setujui Cuti" : "Tolak Cuti"}
            </DialogTitle>
            <DialogDescription>
              {reviewTarget?.employee.nama} —{" "}
              {TYPE_LABELS[reviewTarget?.leaveType ?? ""] ?? reviewTarget?.leaveType} (
              {reviewTarget?.days} hari)
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="text-sm">
              <p>
                <strong>Tanggal:</strong> {reviewTarget?.startDate} —{" "}
                {reviewTarget?.endDate}
              </p>
              <p>
                <strong>Alasan:</strong> {reviewTarget?.reason}
              </p>
            </div>
            <div>
              <Label>
                {reviewAction === "approve"
                  ? "Catatan (opsional)"
                  : "Alasan penolakan *"}
              </Label>
              <Textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewAction === "approve"
                    ? "Catatan untuk karyawan..."
                    : "Jelaskan alasan penolakan..."
                }
                rows={2}
              />
            </div>
            {reviewAction === "approve" && (
              <p className="text-xs text-muted-foreground">
                Menyetujui akan otomatis membuat record kehadiran LEAVE untuk tanggal
                tersebut.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button
              onClick={handleReview}
              disabled={reviewing}
              className={
                reviewAction === "reject"
                  ? "bg-destructive hover:bg-destructive/90"
                  : ""
              }
            >
              {reviewing
                ? "Memproses..."
                : reviewAction === "approve"
                  ? "Setujui"
                  : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
