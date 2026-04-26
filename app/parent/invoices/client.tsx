"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AlertCircle, Receipt, Sparkles } from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
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

export function InvoicesClient({ data }: { data: InvoiceItem[] | null }) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const loading = data === null;

  useEffect(() => {
    if (data === null) {
      toast.error("Tagihan belum bisa dimuat. Coba lagi sebentar ya.");
    }
  }, [data]);

  const todayYmd = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    if (!data) return { total: 0, count: 0, nearestDue: null as string | null, allOverdue: false };
    const outstanding = data.filter(isOutstanding);
    const total = outstanding.reduce((s, i) => s + (i.totalDue - i.totalPaid), 0);
    const dueDates = outstanding.map((i) => i.dueDate).sort((a, b) => a.localeCompare(b));
    // Prefer the nearest FUTURE due date. If all are past, fall back to the
    // oldest past one and surface it as "lewat tempo" (overdue) instead of
    // "terdekat" (nearest) — saying "jatuh tempo terdekat 10 Februari" when
    // today is 27 April reads as if the bill is still in the future.
    const nearestFuture = dueDates.find((d) => d >= todayYmd) ?? null;
    const nearestDue = nearestFuture ?? dueDates[0] ?? null;
    const allOverdue = nearestFuture === null && dueDates.length > 0;
    return { total, count: outstanding.length, nearestDue, allOverdue };
  }, [data, todayYmd]);

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

  const due = data
    .filter(isOutstanding)
    .map((inv) => ({ inv, isOverdue: inv.dueDate < todayYmd }))
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate));
  // Riwayat — newest payment first. paidAt is the authoritative timestamp;
  // periodLabel is a freeform string ("Jan-2026" vs "Januari 2026") and
  // localeCompare on it produces alphabetic chaos. Falls back to dueDate
  // (also reliable) when paidAt is somehow missing on a PAID invoice.
  const paid = data
    .filter(isPaid)
    .sort((a, b) => {
      const aKey = a.paidAt ?? a.dueDate;
      const bKey = b.paidAt ?? b.dueDate;
      return bKey.localeCompare(aKey);
    });
  const hasAnyOutstanding = due.length > 0;
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
      ) : (
        <section
          className="rounded-xl border p-4 md:p-6"
          style={{
            background: "var(--celebration-gold-subtle)",
            borderColor: "var(--celebration-gold)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-lg"
              style={{
                background: "var(--celebration-gold-subtle)",
                color: "var(--celebration-gold-text)",
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--celebration-gold-text)" }}
              >
                Lunas semua
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Jazakumullahu khairan. Tidak ada tagihan yang menunggu pembayaran.
              </p>
            </div>
          </div>
        </section>
      )}

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
      ) : !hasAnyOutstanding ? (
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
}: {
  invoice: InvoiceItem;
  onClick: () => void;
  tone: "due" | "paid";
  isOverdue: boolean;
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
        className="flex w-full items-baseline gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 active:border-primary/40"
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
