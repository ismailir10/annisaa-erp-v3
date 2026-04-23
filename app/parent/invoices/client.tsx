"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryHero } from "@/components/portal/summary-hero";
import { CardListItem } from "@/components/portal/card-list-item";
import {
  AlertCircle,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { formatRupiah, formatDateShort } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { InvoiceFilter } from "@/components/parent/invoice-filter";
import { PageHeader } from "@/components/portal/page-header";
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton";

// Dynamically import InvoiceDetailSheet to reduce initial bundle size
const InvoiceDetailSheet = dynamic(
  () => import("./invoice-detail-sheet").then((mod) => ({ default: mod.InvoiceDetailSheet })),
  {
    loading: () => <InvoiceDetailSkeleton />,
    ssr: false,
  }
);

const PARENT_INVOICE_LABELS: Record<string, string> = {
  SENT: "Belum Dibayar",
  PARTIALLY_PAID: "Dibayar Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
  CANCELLED: "Dibatalkan",
};

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

/**
 * Decide which S1-intent status + label to hand the StatusBadge for a given
 * invoice. Cycle-3 color-correctness fix: an UNPAID / SENT parent invoice is
 * danger-severity (jatuh tempo akan datang → money out of pocket), not
 * info-severity. Default STATUS_MAP renders SENT as blue (status-leave-subtle)
 * which semantically clashes with IZIN/permission. Remap SENT → OVERDUE on the
 * chip only — the underlying invoice status is untouched for API / filter use.
 */
function chipStatusFor(status: string): string {
  if (status === "SENT") return "OVERDUE";
  return status;
}

export function InvoicesClient({ data }: { data: InvoiceItem[] | null }) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("unpaid");
  const loading = data === null;

  useEffect(() => {
    if (data === null) {
      toast.error("Tagihan belum bisa dimuat. Coba lagi sebentar ya.");
    }
  }, [data]);

  // Derive totals from full data set (hero is scoped to the whole child, not the active filter).
  const { totalOutstanding, outstandingCount, nearestDueDate, childName } = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalOutstanding: 0, outstandingCount: 0, nearestDueDate: null as string | null, childName: "" };
    }
    const outstanding = data.filter((i) => {
      const remaining = i.totalDue - i.totalPaid;
      return remaining > 0 && i.status !== "CANCELLED" && i.status !== "PAID";
    });
    const total = outstanding.reduce((sum, i) => sum + (i.totalDue - i.totalPaid), 0);
    // Nearest future-or-past due date among outstanding invoices.
    const nearest = outstanding
      .map((i) => i.dueDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
    // Child name isn't directly on the list item — leave empty; secondary copy
    // falls back to a generic phrasing when unknown.
    return {
      totalOutstanding: total,
      outstandingCount: outstanding.length,
      nearestDueDate: nearest,
      childName: "",
    };
  }, [data]);

  if (loading) {
    return (
      <div className="pb-24">
        {/* Hero skeleton — mirrors SummaryHero shape (border-l-4, rounded-xl, p-card). */}
        <Skeleton className="h-24 w-full rounded-xl mb-4" />

        {/* Header skeleton — mirrors "Tagihan Saya" h1 */}
        <Skeleton className="h-6 w-36 mb-4" />

        {/* Filter tabs — 5 pills mirroring InvoiceFilter (sticky, bg-background) */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-3 -mx-page-x px-page-x mb-4">
          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>
        </div>

        {/* Card list skeletons — mirror CardListItem geometry. */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-card rounded-xl border border-border bg-card"
            >
              <Skeleton className="size-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
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
          <p className="text-sm text-muted-foreground">Tagihan belum bisa dimuat. Coba lagi sebentar ya.</p>
        </div>
      </div>
    );
  }

  // Filter data based on status
  const filteredData = data.filter((item) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unpaid") return item.status === "SENT";
    if (statusFilter === "partial") return item.status === "PARTIALLY_PAID";
    if (statusFilter === "paid") return item.status === "PAID";
    if (statusFilter === "overdue") return item.status === "OVERDUE";
    return true;
  });

  // Preserve newest-first ordering (cycle-2 DataTable default was periodLabel desc).
  const sortedData = [...filteredData].sort((a, b) =>
    b.periodLabel.localeCompare(a.periodLabel)
  );

  const unpaidCount = data.filter((i) => i.status === "SENT").length;
  const partialCount = data.filter((i) => i.status === "PARTIALLY_PAID").length;
  const overdueCount = data.filter((i) => i.status === "OVERDUE").length;

  const counts = {
    total: data.length,
    unpaid: unpaidCount,
    partial: partialCount,
    paid: data.filter((i) => i.status === "PAID").length,
    overdue: overdueCount,
  };

  const hasOutstanding = totalOutstanding > 0;

  return (
    <div className="pb-24">
      {/* T2a — SummaryHero. Danger-tinted when outstanding, celebration-tinted when all lunas. */}
      <div className="mb-4">
        {hasOutstanding ? (
          <SummaryHero
            tone="danger"
            icon={Wallet}
            primary={formatRupiah(totalOutstanding)}
            secondary={
              nearestDueDate
                ? `${outstandingCount} tagihan · jatuh tempo ${formatDateShort(nearestDueDate)}`
                : `${outstandingCount} tagihan belum dibayar`
            }
            elevated
          />
        ) : (
          <SummaryHero
            tone="celebration"
            icon={Sparkles}
            primary="Alhamdulillah, semua lunas."
            secondary={
              childName
                ? `Tidak ada tagihan yang belum dibayar untuk ${childName}.`
                : "Tidak ada tagihan yang belum dibayar saat ini."
            }
            elevated
          />
        )}
      </div>

      <PageHeader title="Tagihan Saya" />

      {/* Filter - Touch-Friendly Chips */}
      <div className="mb-4">
        <InvoiceFilter
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      {/* T2b — CardListItem list (replaces DataTable for ≤10-row parent norm). */}
      {sortedData.length === 0 ? (
        // T2c — filter-driven empty states.
        statusFilter === "unpaid" || statusFilter === "overdue" ? (
          <EmptyState
            accent="celebration"
            icon={Sparkles}
            title="Alhamdulillah, semua lunas"
            description={
              childName
                ? `Tidak ada tagihan yang belum dibayar untuk ${childName}.`
                : "Tidak ada tagihan yang belum dibayar saat ini."
            }
          />
        ) : statusFilter === "paid" ? (
          <EmptyState
            accent="warm"
            icon={Receipt}
            title="Belum ada pembayaran"
            description="Riwayat pembayaran akan muncul di sini setelah tagihan dilunasi."
          />
        ) : (
          <EmptyState
            accent="warm"
            icon={Receipt}
            title="Belum ada tagihan"
            description="Tagihan akan muncul di sini setelah sekolah menerbitkannya."
          />
        )
      ) : (
        <ul className="space-y-2" aria-label="Daftar tagihan">
          {sortedData.map((inv) => (
            <li key={inv.id}>
              <CardListItem
                onClick={() => setSelectedInvoiceId(inv.id)}
                leading={
                  <span className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Receipt className="size-5 text-primary" aria-hidden="true" />
                  </span>
                }
                primary={inv.periodLabel}
                secondary={`${inv.invoiceNumber} · Jatuh tempo ${formatDateShort(inv.dueDate)}`}
                trailing={
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge
                      variant="intent"
                      status={chipStatusFor(inv.status)}
                      label={PARENT_INVOICE_LABELS[inv.status] ?? inv.status}
                    />
                    <span className="font-currency text-sm font-bold tabular-nums">
                      {formatRupiah(inv.totalDue)}
                    </span>
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <InvoiceDetailSheet
        open={!!selectedInvoiceId}
        onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
        invoiceId={selectedInvoiceId}
      />
    </div>
  );
}
