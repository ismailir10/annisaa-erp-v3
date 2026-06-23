"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, ChevronRight, Receipt, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatRupiah, formatDate } from "@/lib/format";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/portal/page-header";
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton";

const InvoiceDetailSheet = dynamic(
  () => import("./invoice-detail-sheet").then((mod) => ({ default: mod.InvoiceDetailSheet })),
  {
    loading: () => <InvoiceDetailSkeleton />,
    ssr: false,
  }
);

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  dueDate: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  xenditPaymentUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

function isOutstanding(inv: InvoiceItem): boolean {
  const remaining = inv.totalDue - inv.totalPaid;
  return remaining > 0 && inv.status !== "CANCELLED" && inv.status !== "PAID";
}

function isPaid(inv: InvoiceItem): boolean {
  return inv.status === "PAID";
}

type OtherChildOutstanding = {
  studentId: string;
  studentName: string;
  count: number;
};

type SelectedChildSummary = {
  count: number;
  total: number;
  nearestDue: string | null;
};

export function InvoicesClient({
  data,
  selectedStudentName = "",
  selectedChildSummary,
  otherChildrenWithOutstanding = [],
}: {
  data: InvoiceItem[] | null;
  selectedStudentName?: string;
  selectedChildSummary?: SelectedChildSummary;
  otherChildrenWithOutstanding?: OtherChildOutstanding[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceParam = searchParams.get("invoice");
  const xenditStatusParam = searchParams.get("xenditStatus");

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("due-asc");
  const [recentlyPaidIds, setRecentlyPaidIds] = useState<Set<string>>(new Set());
  const prevDataRef = useRef<InvoiceItem[] | null>(null);
  const loading = data === null;

  useEffect(() => {
    if (data === null) {
      toast.error("Tagihan belum bisa dimuat. Coba lagi sebentar ya.");
    }
  }, [data]);

  // Xendit return-URL handler. Backend rewires success_return_url and
  // cancel_return_url to land here with `?invoice=<id>&xenditStatus=paid|cancel`.
  // Open the detail sheet for the invoice, fire a one-shot toast, then strip
  // the query params so a refresh does not re-fire the toast. Only acts when
  // the invoice id resolves against the parent's own data — a stale or
  // foreign id leaves the params intact for now (a future render with refreshed
  // data may resolve them).
  useEffect(() => {
    if (!data || !invoiceParam || !xenditStatusParam) return;
    const found = data.find((i) => i.id === invoiceParam);
    if (!found) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedInvoiceId(invoiceParam);
    if (xenditStatusParam === "paid") {
      toast.success(`Alhamdulillah, tagihan ${found.periodLabel} terbayar.`);
    } else if (xenditStatusParam === "cancel") {
      toast("Pembayaran belum selesai. Silakan coba lagi, Pak/Bu.");
    }
    router.replace("/parent/invoices", { scroll: false });
  }, [data, invoiceParam, xenditStatusParam, router]);

  // Webhook → list freshness. While at least one outstanding invoice has an
  // active Xendit payment session (xenditPaymentUrl != null), poll the server
  // component every 30 s so the parent sees the PAID flip without manual
  // refresh. Stops as soon as no in-flight payment remains.
  const hasInFlightPayment = useMemo(
    () => data?.some((i) => i.xenditPaymentUrl != null && isOutstanding(i)) ?? false,
    [data],
  );
  useEffect(() => {
    if (!hasInFlightPayment) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [hasInFlightPayment, router]);

  // Diff-detect status transitions to PAID across renders. Fire one-shot toast
  // and add the row id to the recently-paid set for ring-flash animation.
  useEffect(() => {
    if (!data) return;
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    if (!prev) return;
    const flipped: string[] = [];
    for (const curr of data) {
      const prior = prev.find((p) => p.id === curr.id);
      if (prior && prior.status !== "PAID" && curr.status === "PAID") {
        flipped.push(curr.id);
        toast.success(
          `Alhamdulillah, tagihan ${curr.periodLabel} baru saja terbayar.`,
        );
      }
    }
    if (flipped.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentlyPaidIds((prevSet) => {
      const next = new Set(prevSet);
      flipped.forEach((id) => next.add(id));
      return next;
    });
    const timer = setTimeout(() => {
      setRecentlyPaidIds((prevSet) => {
        const next = new Set(prevSet);
        flipped.forEach((id) => next.delete(id));
        return next;
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [data]);

  const todayYmd = useMemo(() => getTodayInTimezone("Asia/Jakarta"), []);

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((inv) => {
        const outstanding = isOutstanding(inv);
        const overdue = outstanding && inv.dueDate < todayYmd;
        const paid = isPaid(inv);
        const matchesQuery =
          !q ||
          inv.periodLabel.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "due" && outstanding) ||
          (statusFilter === "overdue" && overdue) ||
          (statusFilter === "paid" && paid);
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => {
        if (sortMode === "due-desc") return b.dueDate.localeCompare(a.dueDate);
        if (sortMode === "paid-desc") return (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate);
        if (sortMode === "amount-desc") {
          const amountA = isOutstanding(a) ? a.totalDue - a.totalPaid : a.totalDue;
          const amountB = isOutstanding(b) ? b.totalDue - b.totalPaid : b.totalDue;
          return amountB - amountA;
        }
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [data, query, statusFilter, sortMode, todayYmd]);

  const showListControls = (data?.length ?? 0) > 10;

  const summary = useMemo(() => {
    // Prefer selectedChildSummary when supplied — it is derived from the same
    // household helper as /parent's Tagihan tile, so the banner total cannot
    // disagree with home by construction. Fall back to deriving from `data`
    // for legacy callers (e.g. tests that don't pass the prop).
    if (selectedChildSummary) {
      const { count, total, nearestDue } = selectedChildSummary;
      const allOverdue = nearestDue !== null && nearestDue < todayYmd && count > 0;
      return { total, count, nearestDue, allOverdue };
    }
    if (!data) return { total: 0, count: 0, nearestDue: null as string | null, allOverdue: false };
    const outstanding = data.filter(isOutstanding);
    const total = outstanding.reduce((s, i) => s + (i.totalDue - i.totalPaid), 0);
    const dueDates = outstanding.map((i) => i.dueDate).sort((a, b) => a.localeCompare(b));
    const nearestFuture = dueDates.find((d) => d >= todayYmd) ?? null;
    const nearestDue = nearestFuture ?? dueDates[0] ?? null;
    const allOverdue = nearestFuture === null && dueDates.length > 0;
    return { total, count: outstanding.length, nearestDue, allOverdue };
  }, [data, todayYmd, selectedChildSummary]);

  if (loading) {
    return (
      <div className="space-y-4 pb-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground">
            Tagihan belum bisa dimuat. Coba lagi sebentar ya.
          </p>
        </div>
      </div>
    );
  }

  // No invoices ever sent — neutral empty state, NOT the "Lunas semua"
  // celebration (spec B4 targets the all-paid state, not the no-invoice state).
  if (data.length === 0) {
    return (
      <div className="space-y-6 pb-4">
        <PageHeader title="Tagihan" subtitle="Pantau pembayaran SPP & biaya tambahan" />
        <EmptyState
          accent="warm"
          icon={Receipt}
          title="Belum ada tagihan"
          description="Tagihan akan muncul di sini setelah sekolah menerbitkannya."
        />
      </div>
    );
  }

  const due = filteredData
    .filter(isOutstanding)
    .map((inv) => ({ inv, isOverdue: inv.dueDate < todayYmd }))
    .sort((a, b) => {
      if (sortMode === "due-desc") return b.inv.dueDate.localeCompare(a.inv.dueDate);
      if (sortMode === "amount-desc") {
        return (b.inv.totalDue - b.inv.totalPaid) - (a.inv.totalDue - a.inv.totalPaid);
      }
      return a.inv.dueDate.localeCompare(b.inv.dueDate);
    });
  // Riwayat — newest payment first. paidAt is the authoritative timestamp;
  // periodLabel is a freeform string ("Jan-2026" vs "Januari 2026") and
  // localeCompare on it produces alphabetic chaos. Falls back to dueDate
  // (also reliable) when paidAt is somehow missing on a PAID invoice.
  const paid = filteredData
    .filter(isPaid)
    .sort((a, b) => {
      if (sortMode === "due-asc") return a.dueDate.localeCompare(b.dueDate);
      if (sortMode === "due-desc") return b.dueDate.localeCompare(a.dueDate);
      if (sortMode === "amount-desc") return b.totalDue - a.totalDue;
      const aKey = a.paidAt ?? a.dueDate;
      const bKey = b.paidAt ?? b.dueDate;
      return bKey.localeCompare(aKey);
    });
  const hasAnyOutstanding = due.length > 0;
  const noFilterResults = showListControls && filteredData.length === 0;
  const RIWAYAT_INITIAL = 12;
  const paidVisible = showAllPaid ? paid : paid.slice(0, RIWAYAT_INITIAL);
  const paidHasMore = paid.length > RIWAYAT_INITIAL;

  return (
    <div className="space-y-6 pb-4">
      <PageHeader title="Tagihan" subtitle="Pantau pembayaran SPP & biaya tambahan" />

      {hasAnyOutstanding ? (
        <section
          className="rounded-xl border bg-card p-4 md:p-6"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Belum dibayar
          </p>
          <p className="mt-1 font-currency text-2xl sm:text-display font-bold leading-none tracking-tight text-status-absent-text">
            {formatRupiah(summary.total)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.count} tagihan
            {summary.nearestDue ? (
              <>
                {summary.allOverdue ? " · lewat tempo sejak " : " · jatuh tempo terdekat "}
                <b className="text-foreground">
                  {formatDate(summary.nearestDue, { day: "numeric", month: "long", year: "numeric" })}
                </b>
              </>
            ) : null}
          </p>
        </section>
      ) : otherChildrenWithOutstanding.length > 0 ? (
        // Selected child is paid, but a sibling still has outstanding tagihan.
        // Without this branch the page reads "Lunas semua" while /parent's
        // Tagihan tile shows the household total — the UAT-2026-05-03 INV-01
        // contradiction. Sibling rows ARE the CTA — no separate "select above"
        // instruction (it would compete with the rows + duplicate ChildSelectorTabs).
        <section className="rounded-xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-status-present-subtle text-status-present-text">
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Lunas untuk {selectedStudentName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {otherChildrenWithOutstanding.reduce((s, c) => s + c.count, 0)} tagihan menunggu untuk anak lain.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {otherChildrenWithOutstanding.map((c) => (
                  <Link
                    key={c.studentId}
                    href={`/parent/invoices?child=${c.studentId}`}
                    className="flex min-h-[44px] items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/30 active:border-primary/40"
                  >
                    <span className="font-medium text-foreground">{c.studentName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-status-absent-text">
                      {c.count} tagihan
                      <ChevronRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-celebration-gold bg-celebration-gold-subtle p-4 md:p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-celebration-gold-subtle text-celebration-gold-text">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-celebration-gold-text">
                Lunas semua
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Jazakumullahu khairan. Tidak ada tagihan yang menunggu pembayaran.
              </p>
            </div>
          </div>
        </section>
      )}

      {showListControls ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-3" aria-label="Filter tagihan">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari periode atau nomor tagihan..."
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)}>
              <SelectTrigger aria-label="Filter status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="due">Belum Dibayar</SelectItem>
                <SelectItem value="overdue">Lewat Tempo</SelectItem>
                <SelectItem value="paid">Lunas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(value) => value && setSortMode(value)}>
              <SelectTrigger aria-label="Urutkan tagihan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due-asc">Jatuh Tempo Terdekat</SelectItem>
                <SelectItem value="due-desc">Jatuh Tempo Terakhir</SelectItem>
                <SelectItem value="paid-desc">Pembayaran Terbaru</SelectItem>
                <SelectItem value="amount-desc">Nominal Terbesar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(query || statusFilter !== "all" || sortMode !== "due-asc") ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setSortMode("due-asc");
              }}
            >
              Reset
            </Button>
          ) : null}
        </section>
      ) : null}

      {showListControls && filteredData.length === 0 ? (
        <EmptyState
          accent="warm"
          icon={Receipt}
          title="Tidak ada tagihan sesuai filter"
          description="Ubah pencarian, status, atau urutan untuk melihat tagihan lain."
        />
      ) : null}

      {hasAnyOutstanding && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Belum dibayar
          </p>
          <ul className="space-y-2" aria-label="Tagihan belum dibayar">
            {due.map(({ inv, isOverdue }) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onClick={() => setSelectedInvoiceId(inv.id)}
                tone="due"
                isOverdue={isOverdue}
              />
            ))}
          </ul>
        </section>
      )}

      {paid.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Riwayat pembayaran
          </p>
          <ul className="space-y-2" aria-label="Riwayat pembayaran">
            {paidVisible.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onClick={() => setSelectedInvoiceId(inv.id)}
                tone="paid"
                isOverdue={false}
                highlight={recentlyPaidIds.has(inv.id)}
              />
            ))}
          </ul>
          {paidHasMore ? (
            <div className="mt-3 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllPaid((v) => !v)}
                aria-expanded={showAllPaid}
              >
                {showAllPaid
                  ? `Tampilkan ${RIWAYAT_INITIAL} terakhir`
                  : `Lihat semua (${paid.length} riwayat)`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : !hasAnyOutstanding && !noFilterResults ? (
        <EmptyState
          accent="warm"
          icon={Receipt}
          title="Belum ada riwayat tagihan"
          description="Tagihan akan muncul di sini setelah sekolah menerbitkannya."
        />
      ) : null}

      <InvoiceDetailSheet
        open={!!selectedInvoiceId}
        onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
        invoiceId={selectedInvoiceId}
      />
    </div>
  );
}

function InvoiceRow({
  invoice,
  onClick,
  tone,
  isOverdue,
  highlight = false,
}: {
  invoice: InvoiceItem;
  onClick: () => void;
  tone: "due" | "paid";
  isOverdue: boolean;
  highlight?: boolean;
}) {
  const remaining = invoice.totalDue - invoice.totalPaid;
  const amount = tone === "due" ? remaining : invoice.totalDue;

  const secondary =
    tone === "due"
      ? `Jatuh tempo ${formatDate(invoice.dueDate, { day: "numeric", month: "long" })}${isOverdue ? " · lewat tempo" : ""}`
      : `Dibayar${invoice.paidAt ? ` ${formatDate(invoice.paidAt.slice(0, 10), { day: "numeric", month: "long" })}` : ""}`;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-baseline gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 active:border-primary/40 ${highlight ? "animate-in fade-in duration-700 ring-2 ring-status-present-text/40" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{invoice.periodLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>
        </div>
        <span
          className={`font-currency tabular-nums text-sm font-bold ${tone === "due" ? "text-status-absent-text" : "text-status-present-text"}`}
        >
          {formatRupiah(amount)}
        </span>
      </button>
    </li>
  );
}
