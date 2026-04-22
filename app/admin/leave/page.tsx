"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Check, X, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";

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
    (async () => {
      try {
        const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
          fetch("/api/leave/requests?pageSize=1&status=PENDING"),
          fetch("/api/leave/requests?pageSize=1&status=APPROVED"),
          fetch("/api/leave/requests?pageSize=1&status=REJECTED"),
        ]);
        const parseTotal = async (res: Response) => {
          if (!res.ok) return 0;
          const data = await res.json();
          return data.pagination?.total ?? 0;
        };
        const p = await parseTotal(pendingRes);
        const a = await parseTotal(approvedRes);
        const r = await parseTotal(rejectedRes);
        setStats({ total: p + a + r, pending: p, approved: a, rejected: r });
      } catch {
        // Stats stay at default zeros — non-critical
      }
    })();
  }, []);

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

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
    } catch {
      toast.error("Gagal memuat data cuti");
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

  function openReview(req: LeaveRequest, action: "approve" | "reject" | "view") {
    setReviewTarget(req);
    setReviewNote("");
    if (action === "view") {
      setViewOnly(true);
    } else {
      setViewOnly(false);
      setReviewAction(action);
    }
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
              <span className="font-currency text-xs text-muted-foreground">
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
              <StatusBadge status={r.leaveType} label={TYPE_LABELS[r.leaveType]} />
              <span className="text-xs font-medium">{r.days} hari</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateShort(r.startDate)} — {formatDateShort(r.endDate)}
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
            <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
              Catatan: {row.original.reviewNote}
            </p>
          )}
        </div>
      ),
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        const isPending = r.status === "PENDING";
        return (
          <DataTableRowActions
            onView={() => openReview(r, "view")}
            extraActions={
              isPending
                ? [
                    {
                      label: "Setujui",
                      icon: <Check size={14} />,
                      onClick: () => openReview(r, "approve"),
                    },
                    {
                      label: "Tolak",
                      icon: <X size={14} />,
                      onClick: () => openReview(r, "reject"),
                      destructive: true,
                    },
                  ]
                : undefined
            }
          />
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

      <StatsCardsRow>
        <StatCard label="Total Pengajuan" value={stats.total} icon={FileText} color="primary" index={0} />
        <StatCard label="Menunggu" value={stats.pending} icon={Clock} color="warning" index={1} />
        <StatCard label="Disetujui" value={stats.approved} icon={CheckCircle} color="success" index={2} />
        <StatCard label="Ditolak" value={stats.rejected} icon={XCircle} color="error" index={3} />
      </StatsCardsRow>

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
      <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) { setReviewTarget(null); setViewOnly(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {viewOnly ? "Detail Cuti" : reviewAction === "approve" ? "Setujui Cuti" : "Tolak Cuti"}
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
                <strong>Tanggal:</strong> {reviewTarget?.startDate ? formatDateShort(reviewTarget.startDate) : ""} —{" "}
                {reviewTarget?.endDate ? formatDateShort(reviewTarget.endDate) : ""}
              </p>
              <p>
                <strong>Alasan:</strong> {reviewTarget?.reason}
              </p>
              {reviewTarget?.reviewNote && (
                <p>
                  <strong>Catatan:</strong> {reviewTarget.reviewNote}
                </p>
              )}
            </div>
            {!viewOnly && (
              <>
                <Field>
                  <FieldLabel>
                    {reviewAction === "approve"
                      ? "Catatan (opsional)"
                      : "Alasan penolakan *"}
                  </FieldLabel>
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
                </Field>
                {reviewAction === "approve" && (
                  <p className="text-xs text-muted-foreground">
                    Menyetujui akan otomatis membuat record kehadiran LEAVE untuk tanggal
                    tersebut.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">{viewOnly ? "Tutup" : "Batal"}</Button>
            </DialogClose>
            {!viewOnly && (
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
