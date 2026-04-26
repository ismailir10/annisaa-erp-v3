"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { BatchProgressCard } from "@/components/admin/invoices/batch-progress-card";
import { ManualInvoiceDialog } from "@/components/admin/invoices/manual-invoice-dialog";
import { Plus, FileText, Receipt, CheckCircle, Clock, AlertTriangle, LinkIcon, CircleDashed, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah, formatDateShort, formatMonthLabel } from "@/lib/format";
import {
  runBulkGenerate,
  type BatchProgressSnapshot,
  type PlanResponse,
} from "@/lib/finance/run-bulk-generate";
import {
  runBulkRetry,
  type BulkRetrySnapshot,
} from "@/lib/finance/run-bulk-retry";
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

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Invoice = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  dueDate: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  createdAt: string;
  student: { name: string; nickname: string | null };
  _count: { payments: number };
};

type AcademicYear = { id: string; name: string; status: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Invoice>[] = [
  {
    id: "student",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Siswa" />
    ),
    cell: ({ row }) => {
      const inv = row.original;
      return (
        <Link
          href={`/admin/invoices/${inv.id}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <FileText size={14} className="text-primary" />
          </div>
          <div>
            <span className="text-sm font-medium group-hover:text-primary transition-colors">
              {inv.student.name}
            </span>
            <p className="font-currency text-xs text-muted-foreground">
              {inv.invoiceNumber}
            </p>
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: "periodLabel",
    header: "Periode",
    cell: ({ row }) => (
      <div>
        <span className="text-sm">{row.original.periodLabel}</span>
        <p className="text-xs text-muted-foreground">
          Jatuh tempo: {formatDateShort(row.original.dueDate)}
        </p>
      </div>
    ),
  },
  {
    id: "amount",
    header: "Jumlah",
    cell: ({ row }) => {
      const inv = row.original;
      const remaining = Number(inv.totalDue) - Number(inv.totalPaid);
      return (
        <div className="text-right">
          <p className="font-currency text-sm font-bold">
            {formatRupiah(Number(inv.totalDue))}
          </p>
          {Number(inv.totalPaid) > 0 && Number(inv.totalPaid) < Number(inv.totalDue) && (
            <p className="font-currency text-xs text-success">
              Dibayar: {formatRupiah(Number(inv.totalPaid))}
            </p>
          )}
          {remaining > 0 && inv.status !== "DRAFT" && (
            <p className="font-currency text-xs text-destructive">
              Sisa: {formatRupiah(remaining)}
            </p>
          )}
        </div>
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

// ------------------------------------------------------------------
// Generate Invoice Form Body (shared between Dialog + Sheet)
// ------------------------------------------------------------------

function GenerateInvoiceFormBody({
  genForm,
  setGenForm,
  years,
}: {
  genForm: { periodLabel: string; dueDate: string; academicYearId: string };
  setGenForm: (v: { periodLabel: string; dueDate: string; academicYearId: string }) => void;
  years: AcademicYear[];
}) {
  return (
    <>
      <Field>
        <FieldLabel>Periode *</FieldLabel>
        <Input
          value={genForm.periodLabel}
          onChange={(e) => setGenForm({ ...genForm, periodLabel: e.target.value })}
          placeholder="April 2026"
        />
        <FieldDescription>Contoh: April 2026</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Tanggal Jatuh Tempo *</FieldLabel>
        <Input
          type="date"
          value={genForm.dueDate}
          onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel>Tahun Ajaran *</FieldLabel>
        <Select
          value={genForm.academicYearId}
          onValueChange={(v) => v && setGenForm({ ...genForm, academicYearId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [data, setData] = useState<Invoice[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);

  // Dialog state
  const [generateDialog, setGenerateDialog] = useState(false);
  const [genForm, setGenForm] = useState({ periodLabel: "", dueDate: "", academicYearId: "" });
  const [generating, setGenerating] = useState(false);

  // Manual single-invoice dialog — submission redirects to the detail page,
  // so no list refresh is needed on success (the user leaves the list view).
  const [manualDialog, setManualDialog] = useState(false);

  // Bulk-generate + bulk-retry orchestration state (shared progress card).
  // The two flows never overlap on screen — bulk-create runs to completion or
  // is cancelled before bulk-retry can be triggered.
  const [progress, setProgress] = useState<BatchProgressSnapshot | null>(null);
  const [planConfirm, setPlanConfirm] = useState<{
    plan: PlanResponse;
    resolve: (proceed: boolean) => void;
  } | null>(null);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryingRowId, setRetryingRowId] = useState<string | null>(null);
  // Bulk-retry orchestrator state. The retry progress is rendered through
  // the same `<BatchProgressCard>` shell as bulk-generate (different mode).
  const [retryProgress, setRetryProgress] = useState<BulkRetrySnapshot | null>(null);
  const [overflowConfirm, setOverflowConfirm] = useState<{
    total: number;
    resolve: (proceed: boolean) => void;
  } | null>(null);
  const retryDoneAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AbortControllers for the two orchestrators — driven by the
  // BatchProgressCard "Batalkan" button. Reset to null when the run finishes
  // or is cancelled so the next click starts fresh.
  const generateAbortRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<AbortController | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    partiallyPaid: 0,
    paid: 0,
    overdue: 0,
    cancelled: 0,
    pendingPaymentLink: 0,
  });

  const fetchStats = useCallback(() => {
    fetch("/api/invoices/stats")
      .then((r) => r.json())
      .then((s) => {
        if (s?.error) return;
        setStats({
          total: s.total ?? 0,
          draft: s.draft ?? 0,
          sent: s.sent ?? 0,
          partiallyPaid: s.partiallyPaid ?? 0,
          paid: s.paid ?? 0,
          overdue: s.overdue ?? 0,
          cancelled: s.cancelled ?? 0,
          pendingPaymentLink: s.pendingPaymentLink ?? 0,
        });
      })
      .catch((err) => console.error("[invoices] stats fetch failed", err));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetch("/api/academic-years")
      .then((r) => r.json())
      .then((y) => setYears(Array.isArray(y) ? y : y.data ?? []))
      .catch((err) => console.error("[invoices] academic years fetch failed", err));
  }, []);

  const fetchInvoices = useCallback(async () => {
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

      const res = await fetch(`/api/invoices?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data tagihan");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Cleanup the auto-hide timer on unmount + flip mountedRef so any in-flight
  // runBulkGenerate callbacks (onProgress, onPauseDecision, post-run toasts)
  // can short-circuit and avoid setting state on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (doneAutoHideRef.current) clearTimeout(doneAutoHideRef.current);
      if (retryDoneAutoHideRef.current) clearTimeout(retryDoneAutoHideRef.current);
    };
  }, []);

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

  function openGenerateDialog() {
    const now = new Date();
    const monthName = formatMonthLabel(now.getFullYear(), now.getMonth() + 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    const activeYear = years.find((y) => y.status === "ACTIVE");
    setGenForm({ periodLabel: monthName, dueDate, academicYearId: activeYear?.id ?? "" });
    setGenerateDialog(true);
  }

  async function handleGenerate() {
    if (!genForm.periodLabel || !genForm.dueDate || !genForm.academicYearId) {
      toast.error("Lengkapi semua field");
      return;
    }
    setGenerating(true);
    setGenerateDialog(false);

    // Cancel any pending auto-hide timer from a prior run.
    if (doneAutoHideRef.current) {
      clearTimeout(doneAutoHideRef.current);
      doneAutoHideRef.current = null;
    }

    // Fresh AbortController per run — wired to the card's Batalkan button.
    generateAbortRef.current = new AbortController();

    try {
      const out = await runBulkGenerate({
        planRequest: genForm,
        signal: generateAbortRef.current.signal,
        // Promise-based hook: opens the confirm dialog, resolves on user click.
        onPlan: (plan) =>
          new Promise<boolean>((resolve) => {
            if (!mountedRef.current) return resolve(false);
            if (plan.eligible === 0) {
              // Belt-and-suspenders — runBulkGenerate short-circuits no-eligible
              // before calling onPlan, but if a future change wires it here,
              // surface the error and bail.
              resolve(false);
              return;
            }
            setPlanConfirm({ plan, resolve });
          }),
        onProgress: (snapshot) => {
          if (!mountedRef.current) return;
          setProgress({ ...snapshot });
        },
      });

      if (!mountedRef.current) return;

      if (out.phase === "no-eligible") {
        const msg =
          out.plan.skippedAlreadyInvoiced + out.plan.skippedNoFeeStructure > 0
            ? `Tidak ada siswa yang memenuhi syarat (${out.plan.skippedAlreadyInvoiced} sudah punya tagihan, ${out.plan.skippedNoFeeStructure} belum ada struktur biaya)`
            : "Tidak ada siswa yang memenuhi syarat";
        toast.error(msg);
      } else if (out.phase === "user-cancelled") {
        // No toast — confirm dialog Cancel button is the user-visible signal.
        setProgress(null);
      } else if (out.phase === "aborted") {
        toast.error(`Dibatalkan setelah ${out.final.done}/${out.final.total} tagihan dibuat`);
      } else if (out.phase === "done") {
        const { created, xenditOk, xenditFailed } = out.final;
        const tail = xenditFailed > 0 ? `, ${xenditFailed} link gagal — bisa di-retry dari list` : "";
        toast.success(`${created} tagihan dibuat (${xenditOk} link berhasil${tail})`);
        fetchInvoices();
        fetchStats();

        // Auto-hide the progress card 5s after completion (Spec §11 task 11).
        doneAutoHideRef.current = setTimeout(() => {
          setProgress(null);
          doneAutoHideRef.current = null;
        }, 5000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat tagihan");
      setProgress(null);
    } finally {
      setGenerating(false);
      generateAbortRef.current = null;
    }
  }

  function handlePlanConfirm() {
    if (!planConfirm) return;
    const { resolve } = planConfirm;
    setPlanConfirm(null);
    resolve(true);
  }

  function handlePlanCancel() {
    if (!planConfirm) return;
    const { resolve } = planConfirm;
    setPlanConfirm(null);
    resolve(false);
  }

  // Bulk retry — drives the runBulkRetry orchestrator end-to-end. The
  // orchestrator pre-fetches all PENDING_PAYMENT_LINK invoices, chunks them
  // into 25-item slices, and POSTs each chunk through the same
  // /api/invoices/retry-payment-links endpoint used by per-row retries.
  async function handleBulkRetry() {
    setRetryConfirmOpen(false);
    setRetrying(true);

    if (retryDoneAutoHideRef.current) {
      clearTimeout(retryDoneAutoHideRef.current);
      retryDoneAutoHideRef.current = null;
    }

    // Fresh AbortController per run — wired to the card's Batalkan button.
    retryAbortRef.current = new AbortController();

    try {
      const out = await runBulkRetry({
        signal: retryAbortRef.current.signal,
        onProgress: (snapshot) => {
          if (!mountedRef.current) return;
          setRetryProgress({ ...snapshot });
        },
        onOverflow: (total) =>
          new Promise<boolean>((resolve) => {
            if (!mountedRef.current) return resolve(false);
            setOverflowConfirm({ total, resolve });
          }),
      });

      if (!mountedRef.current) return;

      if (out.phase === "no-pending") {
        toast.info("Tidak ada tagihan dengan link gagal");
        setRetryProgress(null);
      } else if (out.phase === "user-cancelled") {
        setRetryProgress(null);
      } else if (out.phase === "aborted") {
        toast.error(
          `Dibatalkan setelah ${out.final.processed}/${out.final.total} tagihan diproses`,
        );
      } else if (out.phase === "done") {
        const { fixed, stillFailed } = out.final;
        if (fixed > 0 && stillFailed === 0) {
          toast.success(`${fixed} link berhasil diperbaiki`);
        } else if (fixed > 0 && stillFailed > 0) {
          toast.success(
            `${fixed} link berhasil, ${stillFailed} masih gagal — buka invoice untuk detail`,
          );
        } else if (fixed === 0 && stillFailed > 0) {
          toast.error(`${stillFailed} link masih gagal — buka invoice untuk detail`);
        }
        fetchInvoices();
        fetchStats();

        retryDoneAutoHideRef.current = setTimeout(() => {
          setRetryProgress(null);
          retryDoneAutoHideRef.current = null;
        }, 5000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencoba ulang link");
      setRetryProgress(null);
    } finally {
      if (mountedRef.current) setRetrying(false);
      retryAbortRef.current = null;
    }
  }

  function handleOverflowConfirm() {
    if (!overflowConfirm) return;
    const { resolve } = overflowConfirm;
    setOverflowConfirm(null);
    resolve(true);
  }

  // Per-row retry — one invoice id, single POST, no progress card. Refetch
  // the list + stats on success so the row's status badge flips.
  async function handleRowRetry(invoiceId: string) {
    setRetryingRowId(invoiceId);
    try {
      const res = await fetch("/api/invoices/retry-payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: [invoiceId] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Gagal mencoba ulang link");
        return;
      }
      const out = await res.json();
      if (out.succeeded > 0) {
        toast.success("Link pembayaran berhasil dibuat");
      } else {
        const firstErr = out.results?.[0]?.error;
        toast.error(`Masih gagal${firstErr ? `: ${firstErr}` : ""}`);
      }
    } finally {
      if (!mountedRef.current) return;
      setRetryingRowId(null);
      // Refresh on every exit path — even after a transient HTTP error the
      // server might have already advanced state (paymentLinkError updated).
      // Mirrors handleBulkRetry's unconditional refresh semantics.
      fetchInvoices();
      fetchStats();
    }
  }

  async function handleVoidInvoice() {
    if (!voidTarget) return;
    const res = await fetch(`/api/invoices/${voidTarget.id}/void`, { method: "POST" });
    if (!mountedRef.current) return;
    if (res.ok) {
      toast.success("Tagihan dibatalkan");
      setVoidTarget(null);
      fetchInvoices();
      fetchStats();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal membatalkan tagihan");
    }
  }

  const columnsWithActions = useMemo<ColumnDef<Invoice>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const inv = row.original;
          const canVoid =
            inv.status === "DRAFT" ||
            inv.status === "SENT" ||
            inv.status === "PENDING_PAYMENT_LINK";
          const isRetryRow = inv.status === "PENDING_PAYMENT_LINK";
          const isRetryingThisRow = retryingRowId === inv.id;
          return (
            <DataTableRowActions
              onView={() => router.push(`/admin/invoices/${inv.id}`)}
              onVoid={canVoid ? () => setVoidTarget(inv) : undefined}
              extraActions={
                isRetryRow
                  ? [
                      {
                        label: isRetryingThisRow ? "Mencoba..." : "Coba Lagi Link",
                        icon: <RefreshCw size={14} />,
                        onClick: () => {
                          if (!isRetryingThisRow) handleRowRetry(inv.id);
                        },
                      },
                    ]
                  : undefined
              }
            />
          );
        },
      },
    ],
    // handleRowRetry is stable across renders for the purposes of this effect
    // (closes over fetchInvoices/fetchStats which are useCallback-stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, retryingRowId],
  );

  return (
    <>
      <PageHeader
        title="Tagihan"
        description={`${pagination.total} tagihan`}
        actions={
          <div className="flex gap-2">
            {stats.pendingPaymentLink > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRetryConfirmOpen(true)}
                disabled={retrying}
                className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              >
                <RefreshCw size={14} className="mr-1.5" />
                {retrying
                  ? "Mencoba..."
                  : `Coba Lagi Link (${stats.pendingPaymentLink})`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setManualDialog(true)}>
              <Plus size={14} className="mr-1.5" /> Tagihan Manual
            </Button>
            <Button size="sm" variant="outline" onClick={openGenerateDialog} disabled={generating}>
              <Plus size={14} className="mr-1.5" /> Buat Tagihan
            </Button>
          </div>
        }
      />

      {progress && progress.phase !== "idle" && (
        <BatchProgressCard
          progress={progress}
          onCancel={() => generateAbortRef.current?.abort()}
        />
      )}

      {retryProgress && (
        <BatchProgressCard
          mode="retry"
          progress={retryProgress}
          onCancel={() => retryAbortRef.current?.abort()}
        />
      )}

      {/* Overflow confirm — surfaces when more than 1000 invoices are stuck.
          Single confirm button per spec; closing the dialog without confirming
          aborts the orchestrator cleanly. */}
      <AlertDialog
        open={!!overflowConfirm}
        onOpenChange={(o) => {
          if (!o && overflowConfirm) {
            const { resolve } = overflowConfirm;
            setOverflowConfirm(null);
            resolve(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Antrian retry penuh</AlertDialogTitle>
            <AlertDialogDescription>
              {overflowConfirm
                ? `1000 tagihan akan diproses sekarang. Sisa ${overflowConfirm.total - 1000} tagihan: jalankan ulang "Coba Lagi Link" setelah batch ini selesai.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleOverflowConfirm}>
              Mulai Proses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StatsCardsRow>
        <StatCard label="Total Tagihan" value={stats.total} icon={Receipt} color="primary" index={0} />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="warning" index={1} />
        <StatCard label="Lunas" value={stats.paid} icon={CheckCircle} color="success" index={2} />
        <StatCard label="Sebagian" value={stats.partiallyPaid} icon={CircleDashed} color="warning" index={3} />
        <StatCard label="Jatuh Tempo" value={stats.overdue} icon={AlertTriangle} color="error" index={4} />
        {stats.pendingPaymentLink > 0 && (
          <StatCard label="Link Gagal" value={stats.pendingPaymentLink} icon={LinkIcon} color="warning" index={5} />
        )}
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari siswa atau nomor tagihan..."
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
              { value: "all", label: "Semua Status" },
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Terkirim" },
              { value: "PAID", label: "Lunas" },
              { value: "PARTIALLY_PAID", label: "Sebagian" },
              { value: "OVERDUE", label: "Jatuh Tempo" },
              { value: "PENDING_PAYMENT_LINK", label: "Link Gagal" },
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
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Buat tagihan bulanan untuk semua siswa aktif"
      />

      {/* Bulk Retry Confirmation */}
      <ConfirmDialog
        open={retryConfirmOpen}
        onOpenChange={setRetryConfirmOpen}
        title="Coba Lagi Link Pembayaran"
        description={`Membuat ulang link untuk ${stats.pendingPaymentLink} tagihan. Lanjutkan?`}
        onConfirm={handleBulkRetry}
        confirmLabel="Lanjutkan"
      />

      {/* Bulk-generate plan confirmation — shows eligibility breakdown before
          the batch loop kicks off. Uses ConfirmDialog so the description can
          inline the skipped counts. Cancel resolves the orchestrator's onPlan
          promise with `false`, ending the run before any batch is posted. */}
      <ConfirmDialog
        open={!!planConfirm}
        onOpenChange={(o) => {
          if (!o && planConfirm) handlePlanCancel();
        }}
        title="Buat Tagihan"
        description={
          planConfirm
            ? `${planConfirm.plan.eligible} siswa akan ditagih.` +
              (planConfirm.plan.skippedAlreadyInvoiced > 0 || planConfirm.plan.skippedNoFeeStructure > 0
                ? ` Dilewati: ${planConfirm.plan.skippedAlreadyInvoiced} sudah punya tagihan, ${planConfirm.plan.skippedNoFeeStructure} belum ada struktur biaya.`
                : "") +
              " Lanjutkan?"
            : ""
        }
        onConfirm={handlePlanConfirm}
        confirmLabel="Lanjutkan"
      />

      {/* Void Confirmation */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="Batalkan Tagihan"
        description={`Tagihan ${voidTarget?.invoiceNumber} (${voidTarget?.student.name}) tidak bisa dibayar lagi. Riwayat tetap tersimpan.`}
        onConfirm={handleVoidInvoice}
        confirmLabel="Ya, Batalkan"
      />

      {/* Manual single-invoice creation — own component handles Dialog/Sheet
          switch internally and pushes to detail page on success. */}
      <ManualInvoiceDialog open={manualDialog} onOpenChange={setManualDialog} />

      {/* Generate Dialog (desktop) / Sheet (mobile, side="bottom" — narrow single-column form) */}
      {isMobile ? (
        <Sheet open={generateDialog} onOpenChange={setGenerateDialog}>
          <SheetContent side="bottom" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Buat Tagihan Bulanan</SheetTitle>
              <SheetDescription>
                Sistem akan membuat tagihan untuk semua siswa aktif berdasarkan struktur biaya program.
              </SheetDescription>
            </SheetHeader>
            <div className="p-card space-y-field">
              <GenerateInvoiceFormBody genForm={genForm} setGenForm={setGenForm} years={years} />
            </div>
            <SheetFooter>
              <SheetClose><Button variant="outline">Batal</Button></SheetClose>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "Membuat..." : "Buat Tagihan"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
          <DialogContent className="p-card">
            <DialogHeader>
              <DialogTitle>Buat Tagihan Bulanan</DialogTitle>
              <DialogDescription>
                Sistem akan membuat tagihan untuk semua siswa aktif berdasarkan struktur biaya program.
              </DialogDescription>
            </DialogHeader>
            <div className="p-card space-y-field">
              <GenerateInvoiceFormBody genForm={genForm} setGenForm={setGenForm} years={years} />
            </div>
            <DialogFooter>
              <DialogClose>
                <Button variant="outline">Batal</Button>
              </DialogClose>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "Membuat..." : "Buat Tagihan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}
