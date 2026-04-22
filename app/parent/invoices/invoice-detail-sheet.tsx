"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExternalLink, Info, CheckCircle, AlertCircle, Calendar } from "lucide-react";
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

const VARIANT_STYLES: Record<string, string> = {
  success: "bg-status-present/10 border-status-present/20",
  muted: "bg-muted/50 border-border",
  destructive: "bg-destructive/10 border-destructive/20",
  warning: "bg-warning/10 border-warning/20",
};

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
          <InvoiceDetailSkeleton />
        </SheetContent>
      </Sheet>
    );
  }

  const remaining = invoice.totalDue - invoice.totalPaid;
  const isPayable = remaining > 0 && invoice.status !== "CANCELLED" && invoice.status !== "PAID";
  const hasPaymentLink = !!invoice.xenditPaymentUrl;

  const getStatusMessage = () => {
    if (invoice.status === "PAID") {
      return {
        icon: <CheckCircle size={16} className="text-success" />,
        message: `Lunas pada ${formatDateShort(invoice.paidAt!)}`,
        variant: "success" as const,
      };
    }
    if (invoice.status === "CANCELLED") {
      return {
        icon: <AlertCircle size={16} className="text-muted-foreground" />,
        message: "Tagihan ini dibatalkan",
        variant: "muted" as const,
      };
    }
    if (invoice.status === "OVERDUE") {
      return {
        icon: <AlertCircle size={16} className="text-destructive" />,
        message: "Tagihan ini telah jatuh tempo",
        variant: "destructive" as const,
      };
    }
    if (invoice.status === "PARTIALLY_PAID") {
      return {
        icon: <Info size={16} className="text-warning" />,
        message: `Dibayar sebagian, sisa ${formatRupiah(remaining)}`,
        variant: "warning" as const,
      };
    }
    if (hasPaymentLink) {
      return {
        icon: <CheckCircle size={16} className="text-success" />,
        message: "Siap dibayar",
        variant: "success" as const,
      };
    }
    return {
      icon: <Info size={16} className="text-muted-foreground" />,
      message: "Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat.",
      variant: "muted" as const,
    };
  };

  const statusMsg = getStatusMessage();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>{invoice.invoiceNumber}</SheetTitle>
            <StatusBadge status={invoice.status} label={PARENT_INVOICE_LABELS[invoice.status]} />
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

        {/* Status Message */}
        <div className={`mt-4 p-3 rounded-lg flex items-start gap-3 ${VARIANT_STYLES[statusMsg.variant]}`}>
          {statusMsg.icon}
          <p className="text-xs flex-1">{statusMsg.message}</p>
        </div>

        {/* Invoice Details */}
        <div className="mt-6 space-y-4">
          {/* Dates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar size={12} />
              <span>Jatuh Tempo: {formatDateShort(invoice.dueDate)}</span>
            </div>
            {invoice.sentAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar size={12} />
                <span>Dikirim: {formatDateShort(invoice.sentAt)}</span>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Rincian Tagihan</h3>
            <div className="space-y-2">
              {invoice.lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{line.labelSnapshot}</p>
                    {line.adjustmentAmount !== 0 && (
                      <p className="text-xs text-muted-foreground">
                        Penyesuaian: {formatRupiah(line.adjustmentAmount)}
                        {line.adjustmentNote && ` (${line.adjustmentNote})`}
                      </p>
                    )}
                  </div>
                  <span className="font-currency text-sm font-bold">{formatRupiah(line.finalAmount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Tagihan</span>
              <span className="font-currency font-bold">{formatRupiah(invoice.totalDue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dibayar</span>
              <span className="font-currency font-bold text-success">{formatRupiah(invoice.totalPaid)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sisa</span>
                <span className="font-currency font-bold text-destructive">{formatRupiah(remaining)}</span>
              </div>
            )}
          </div>

          {/* Payment History */}
          {invoice.payments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Riwayat Pembayaran</h3>
              <div className="space-y-2">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="border-b border-border/50 last:border-0 pb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{METHOD_LABELS[p.method] || p.method}</span>
                      <span className="font-currency text-sm font-bold text-success">{formatRupiah(p.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateShort(p.paidAt)}
                      {p.reference && ` · Ref: ${p.reference}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment Action — only render when link is available; no-link fallback is in the status banner above */}
        {isPayable && hasPaymentLink && (
          <div className="mt-6 pt-4 border-t border-border">
            <a
              href={invoice.xenditPaymentUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button className="w-full" size="lg">
                <ExternalLink size={16} className="mr-2" />
                Bayar Sekarang
              </Button>
            </a>
          </div>
        )}

        <SheetClose
          render={<Button variant="outline" className="w-full mt-4">Tutup</Button>}
        />
      </SheetContent>
    </Sheet>
  );
}
