"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Check, X, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter, useSearchParams } from "next/navigation";

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

// ------------------------------------------------------------------
// Review body (shared between Dialog on desktop and Sheet on mobile)
// ------------------------------------------------------------------

type ReviewBodyProps = {
  target: LeaveRequest;
  viewOnly: boolean;
  reviewAction: "approve" | "reject";
  reviewNote: string;
  setReviewNote: (v: string) => void;
};

function LeaveReviewBody({
  target,
  viewOnly,
  reviewAction,
  reviewNote,
  setReviewNote,
}: ReviewBodyProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p>
          <strong>Tanggal:</strong>{" "}
          {target.startDate ? formatDateShort(target.startDate) : ""} —{" "}
          {target.endDate ? formatDateShort(target.endDate) : ""}
        </p>
        <p>
          <strong>Alasan:</strong> {target.reason}
        </p>
        {target.reviewNote && (
          <p>
            <strong>Catatan:</strong> {target.reviewNote}
          </p>
        )}
      </div>
      {!viewOnly && (
        <>
          <Field>
            <FieldLabel htmlFor="leave-review-note">
              {reviewAction === "approve"
                ? "Catatan (opsional)"
                : "Alasan penolakan *"}
            </FieldLabel>
            <Textarea
              id="leave-review-note"
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
              Menyetujui akan otomatis membuat catatan kehadiran LEAVE untuk tanggal
              tersebut.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminLeavePage() {
  const isMobile = useIsMobile();
  const routeSearchParams = useSearchParams();
  const requestId = routeSearchParams.get("requestId");
  const router = useRouter();
  const closedRequest = useRef<string | null>(null);
  const pageHeading = useRef<HTMLDivElement>(null);
  const openedFromLink = useRef(false);
  const [canApprove, setCanApprove] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState(false);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkRetry, setDeepLinkRetry] = useState(0);
  const [statsState, setStatsState] = useState<"loading" | "ready" | "error">("loading");
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

  // F-21: single stats endpoint replaces the prior 3-call pattern. The old
  // code fired three sequential `pageSize=1` list queries just to read
  // `pagination.total` — wasteful when one `groupBy` returns all buckets.
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/leave/stats");
      if (!res.ok) throw new Error("stats unavailable");
      const json = await res.json();
      setStatsState("ready");
      setStats({
        total: json.total ?? 0,
        pending: json.pending ?? 0,
        approved: json.approved ?? 0,
        rejected: json.rejected ?? 0,
      });
    } catch {
      setStatsState("error");
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
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
      if (!res.ok) throw new Error("leave unavailable");
      const json = await res.json();
      setCanApprove(json.capabilities?.approve === true);
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!requestId) {
      closedRequest.current = null;
      if (openedFromLink.current) setReviewTarget(null);
      return;
    }
    if (closedRequest.current === requestId) return;
    let active = true;
    setReviewTarget(null);
    setDeepLinkLoading(true);
    setDeepLinkError(false);
    // Resolve the selected record independently of table search, status and page.
    fetch(`/api/leave/requests?requestId=${encodeURIComponent(requestId)}&page=1&pageSize=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error("request unavailable");
        const json = await res.json();
        if (!active) return;
        const record = json.data?.find((row: LeaveRequest) => row.id === requestId);
        if (!record) { setDeepLinkError(true); return; }
        setCanApprove(json.capabilities?.approve === true);
        openReview(record, "view", true);
      })
      .catch(() => { if (active) setDeepLinkError(true); })
      .finally(() => { if (active) setDeepLinkLoading(false); });
    return () => { active = false; };
  }, [requestId, deepLinkRetry]);

  function closeReview() {
    setDeepLinkError(false);
    setDeepLinkLoading(false);
    setReviewTarget(null);
    setViewOnly(false);
    if (requestId) {
      closedRequest.current = requestId;
      const next = new URLSearchParams(routeSearchParams.toString());
      next.delete("requestId");
      router.replace(`/admin/leave-requests${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  }

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

  function openReview(req: LeaveRequest, action: "approve" | "reject" | "view", fromLink = false) {
    openedFromLink.current = fromLink;
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
    if (!reviewTarget || !canApprove) return;
    if (reviewAction === "reject" && !reviewNote.trim()) {
      toast.error("Alasan penolakan wajib diisi");
      return;
    }
    setReviewing(true);
    try {
    const res = await fetch(`/api/leave/requests/${reviewTarget.id}/${reviewAction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reviewNote }),
    });
    if (res.ok) {
      toast.success(reviewAction === "approve" ? "Cuti disetujui" : "Cuti ditolak");
      closeReview();
      fetchRequests();
      fetchStats();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal memproses pengajuan cuti. Coba lagi.");
    }
    } catch {
      toast.error("Pengajuan belum tersimpan. Periksa koneksi dan coba lagi.");
    } finally { setReviewing(false); }
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
        const isPending = canApprove && r.status === "PENDING";
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
      <div ref={pageHeading} tabIndex={-1} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <PageHeader
          title="Pengajuan Cuti"
          description={fetchError ? "Daftar pengajuan belum tersedia" : loading ? "Memuat pengajuan…" : `${pagination.total} pengajuan`}
        />
      </div>

      {deepLinkLoading && <p role="status" className="mb-field text-body">Memuat pengajuan yang dipilih…</p>}
      {deepLinkError && <Alert className="mb-field"><AlertTitle>Pengajuan tidak tersedia</AlertTitle><AlertDescription><p>Pengajuan tidak ditemukan atau tidak dapat dibuka dengan akses Anda.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDeepLinkRetry(value => value + 1)}>Coba lagi</Button><Button variant="ghost" onClick={closeReview}>Lihat daftar pengajuan</Button></div></AlertDescription></Alert>}
      {statsState === "error" && <Alert className="mb-field"><AlertTitle>Ringkasan izin belum tersedia</AlertTitle><AlertDescription><Button variant="outline" onClick={fetchStats}>Muat ulang ringkasan</Button></AlertDescription></Alert>}
      {statsState === "ready" && <StatsCardsRow>
        <StatCard label="Total Pengajuan" value={stats.total} icon={FileText} color="primary" index={0} />
        <StatCard label="Menunggu" value={stats.pending} icon={Clock} color="warning" index={1} />
        <StatCard label="Disetujui" value={stats.approved} icon={CheckCircle} color="success" index={2} />
        <StatCard label="Ditolak" value={stats.rejected} icon={XCircle} color="error" index={3} />
      </StatsCardsRow>}

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
        actions={
          stats.pending > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              <Clock size={12} /> Menunggu: {stats.pending}
            </span>
          ) : undefined
        }
      />

      {fetchError ? <Alert><AlertTitle>Daftar pengajuan belum dapat dimuat</AlertTitle><AlertDescription><Button onClick={fetchRequests} variant="outline">Coba lagi</Button></AlertDescription></Alert> : <DataTable
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
      />}

      {/* Review dialog/sheet — split by viewport */}
      {reviewTarget && (
        isMobile ? (
          <Sheet
            open={!!reviewTarget}
            onOpenChange={(o) => { if (!o && !reviewing) closeReview(); }}
          >
            <SheetContent finalFocus={() => openedFromLink.current ? pageHeading.current : true} side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  {viewOnly ? "Detail Cuti" : reviewAction === "approve" ? "Setujui Cuti" : "Tolak Cuti"}
                </SheetTitle>
                <SheetDescription>
                  {reviewTarget.employee.nama} —{" "}
                  {TYPE_LABELS[reviewTarget.leaveType] ?? reviewTarget.leaveType} (
                  {reviewTarget.days} hari)
                </SheetDescription>
              </SheetHeader>
              <div className="p-card space-y-field">
                <LeaveReviewBody
                  target={reviewTarget}
                  viewOnly={viewOnly}
                  reviewAction={reviewAction}
                  reviewNote={reviewNote}
                  setReviewNote={setReviewNote}
                />
                <div className="flex flex-col-reverse gap-2 pt-2">
                  {/* FIND-018: mirror row-kebab Setujui/Tolak in detail view. */}
                  {viewOnly && canApprove && reviewTarget.status === "PENDING" && (
                    <>
                      <Button onClick={() => { setReviewAction("approve"); setViewOnly(false); }}>
                        Setujui
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setReviewAction("reject"); setViewOnly(false); }}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Tolak
                      </Button>
                    </>
                  )}
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
                  <SheetClose
                    render={
                      <Button variant="ghost">{viewOnly ? "Tutup" : "Batal"}</Button>
                    }
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o && !reviewing) closeReview(); }}>
            <DialogContent finalFocus={() => openedFromLink.current ? pageHeading.current : true} className="p-card sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {viewOnly ? "Detail Cuti" : reviewAction === "approve" ? "Setujui Cuti" : "Tolak Cuti"}
                </DialogTitle>
                <DialogDescription>
                  {reviewTarget.employee.nama} —{" "}
                  {TYPE_LABELS[reviewTarget.leaveType] ?? reviewTarget.leaveType} (
                  {reviewTarget.days} hari)
                </DialogDescription>
              </DialogHeader>
              <div className="p-card space-y-field">
                <LeaveReviewBody
                  target={reviewTarget}
                  viewOnly={viewOnly}
                  reviewAction={reviewAction}
                  reviewNote={reviewNote}
                  setReviewNote={setReviewNote}
                />
              </div>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button variant="ghost">{viewOnly ? "Tutup" : "Batal"}</Button>
                  }
                />
                {/* FIND-018: mirror the row-kebab Setujui/Tolak actions in the
                    detail dialog footer when the leave is still PENDING. Pre-fix
                    the detail view only offered Tutup, forcing admins to close
                    and re-open via the kebab to act. */}
                {viewOnly && canApprove && reviewTarget.status === "PENDING" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => { setReviewAction("reject"); setViewOnly(false); }}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Tolak
                    </Button>
                    <Button
                      onClick={() => { setReviewAction("approve"); setViewOnly(false); }}
                    >
                      Setujui
                    </Button>
                  </>
                )}
                {!viewOnly && (
                  <Button
                    onClick={handleReview}
                    disabled={reviewing}
                    variant={reviewAction === "reject" ? "destructive" : "default"}
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
        )
      )}
    </>
  );
}
