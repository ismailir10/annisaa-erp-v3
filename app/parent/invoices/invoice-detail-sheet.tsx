"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryHero } from "@/components/portal/summary-hero";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  CircleDot,
  CreditCard,
  ExternalLink,
  Info,
  Landmark,
  MinusCircle,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { formatRupiah, formatDateShort } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton";

const PARENT_INVOICE_LABELS: Record<string, string> = {
  SENT: "Belum Dibayar",
  PARTIALLY_PAID: "Dibayar Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
  CANCELLED: "Dibatalkan",
};

type InvoiceLine = {
  id: string;
  labelSnapshot: string;
  amount: number;
  finalAmount: number;
  adjustmentAmount: number;
  adjustmentNote: string | null;
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
};

type InvoiceDetail = {
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
  lines: InvoiceLine[];
  payments: Payment[];
  student: {
    name: string;
    nickname: string | null;
    classSection: {
      name: string;
      program: {
        name: string;
      };
    } | null;
  };
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  BANK_TRANSFER: "Transfer Bank",
  XENDIT: "Xendit",
  OTHER: "Lainnya",
};

const METHOD_ICONS: Record<string, LucideIcon> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  XENDIT: CreditCard,
  OTHER: CreditCard,
};

/**
 * Remap the sheet-status to the S1 intent palette. UNPAID / SENT is
 * danger-severity (red status-absent family) — not info (blue). Matches the
 * list-page chipStatusFor() helper in `client.tsx`.
 */
function sheetChipStatusFor(status: string): string {
  if (status === "SENT") return "OVERDUE";
  return status;
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
}) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [prevInvoiceId, setPrevInvoiceId] = useState<string | null>(null);

  // Reset state when sheet closes, fetch when it opens with a new invoiceId
  if (open && invoiceId && invoiceId !== prevInvoiceId) {
    setPrevInvoiceId(invoiceId);
    setLoading(true);
    setInvoice(null);

    fetch(`/api/guardian/invoices/${invoiceId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load invoice");
        return res.json();
      })
      .then((data) => {
        setInvoice(data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Tagihan belum bisa dimuat. Coba lagi sebentar ya.");
        setLoading(false);
      });
  }

  if (!open && prevInvoiceId !== null) {
    setPrevInvoiceId(null);
    setInvoice(null);
    setLoading(false);
  }

  if (!invoiceId) return null;

  if (loading || !invoice) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <div className="p-card">
            <InvoiceDetailSkeleton />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const remaining = invoice.totalDue - invoice.totalPaid;
  const isPayable = remaining > 0 && invoice.status !== "CANCELLED" && invoice.status !== "PAID";
  const hasPaymentLink = !!invoice.xenditPaymentUrl;

  // Map status → SummaryHero tone + icon + secondary copy for the sheet hero.
  const heroConfig = ((): {
    tone: "danger" | "warn" | "success" | "celebration" | "neutral";
    icon: LucideIcon;
    primary: string;
    secondary: string;
  } => {
    if (invoice.status === "PAID") {
      return {
        tone: "success",
        icon: CheckCircle2,
        primary: formatRupiah(invoice.totalDue),
        secondary: invoice.paidAt
          ? `Lunas pada ${formatDateShort(invoice.paidAt)}`
          : "Lunas — Alhamdulillah.",
      };
    }
    if (invoice.status === "CANCELLED") {
      return {
        tone: "neutral",
        icon: MinusCircle,
        primary: formatRupiah(invoice.totalDue),
        secondary: "Tagihan ini dibatalkan.",
      };
    }
    if (invoice.status === "PARTIALLY_PAID") {
      return {
        tone: "warn",
        icon: CircleDot,
        primary: formatRupiah(remaining),
        secondary: `Sisa yang perlu dibayar · jatuh tempo ${formatDateShort(invoice.dueDate)}`,
      };
    }
    if (invoice.status === "OVERDUE") {
      return {
        tone: "danger",
        icon: AlertTriangle,
        primary: formatRupiah(remaining),
        secondary: `Tagihan ini telah jatuh tempo (${formatDateShort(invoice.dueDate)})`,
      };
    }
    // SENT / default
    return {
      tone: "danger",
      icon: Wallet,
      primary: formatRupiah(remaining),
      secondary: hasPaymentLink
        ? `Jatuh tempo ${formatDateShort(invoice.dueDate)}`
        : "Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat.",
    };
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base">{invoice.invoiceNumber}</SheetTitle>
            <StatusBadge
              variant="intent"
              status={sheetChipStatusFor(invoice.status)}
              label={PARENT_INVOICE_LABELS[invoice.status] ?? invoice.status}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.student.name} · {invoice.periodLabel}
          </p>
          {invoice.student.classSection && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.student.classSection.name} · {invoice.student.classSection.program.name}
            </p>
          )}
        </SheetHeader>

        <div className="px-card pb-card space-y-field">
          {/* T2d — SummaryHero as the primary visual moment of the sheet. */}
          <SummaryHero
            tone={heroConfig.tone}
            icon={heroConfig.icon}
            primary={heroConfig.primary}
            secondary={heroConfig.secondary}
            elevated={false}
          />

          {/* Dates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar size={12} aria-hidden="true" />
              <span>Jatuh Tempo: {formatDateShort(invoice.dueDate)}</span>
            </div>
            {invoice.sentAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar size={12} aria-hidden="true" />
                <span>Dikirim: {formatDateShort(invoice.sentAt)}</span>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Rincian Tagihan
            </h3>
            <ul className="space-y-2">
              {invoice.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{line.labelSnapshot}</p>
                    {line.adjustmentAmount !== 0 && (
                      <p className="text-xs text-muted-foreground">
                        Penyesuaian: {formatRupiah(line.adjustmentAmount)}
                        {line.adjustmentNote && ` (${line.adjustmentNote})`}
                      </p>
                    )}
                  </div>
                  <span className="font-currency text-sm font-semibold tabular-nums">
                    {formatRupiah(line.finalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Tagihan</span>
              <span className="font-currency font-semibold tabular-nums">
                {formatRupiah(invoice.totalDue)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dibayar</span>
              <span className="font-currency font-semibold tabular-nums text-status-present-text">
                {formatRupiah(invoice.totalPaid)}
              </span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sisa</span>
                <span className="font-currency font-bold tabular-nums text-destructive">
                  {formatRupiah(remaining)}
                </span>
              </div>
            )}
          </div>

          {/* Payment History */}
          {invoice.payments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Riwayat Pembayaran
              </h3>
              <ul className="space-y-2">
                {invoice.payments.map((p) => {
                  const MethodIcon = METHOD_ICONS[p.method] ?? CreditCard;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                    >
                      <span className="size-9 shrink-0 rounded-full bg-status-present-subtle flex items-center justify-center">
                        <MethodIcon
                          className="size-4 text-status-present-text"
                          aria-hidden="true"
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {METHOD_LABELS[p.method] ?? p.method}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(p.paidAt)}
                          {p.reference && ` · Ref: ${p.reference}`}
                        </p>
                      </div>
                      <span className="font-currency text-sm font-bold tabular-nums text-status-present-text">
                        {formatRupiah(p.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Payment Action — only render when link is available. */}
          {isPayable && hasPaymentLink && (
            <div className="pt-4 border-t border-border">
              <a
                href={invoice.xenditPaymentUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button className="w-full" size="lg">
                  <ExternalLink size={16} className="mr-2" aria-hidden="true" />
                  Bayar Sekarang
                </Button>
              </a>
            </div>
          )}

          {/* Fallback status hint when payment link is being provisioned. */}
          {isPayable && !hasPaymentLink && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
                <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat.
                </span>
              </div>
            </div>
          )}

          <SheetClose render={<Button variant="outline" className="w-full">Tutup</Button>} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
