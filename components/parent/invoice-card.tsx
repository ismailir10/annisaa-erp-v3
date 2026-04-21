"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { formatRupiah } from "@/lib/format";

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
};

export function InvoiceCard({
  invoice,
  onView,
}: {
  invoice: InvoiceItem;
  onView: () => void;
}) {
  const remaining = invoice.totalDue - invoice.totalPaid;

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all active:scale-[1.02]">
      {/* Header */}
      <div className="bg-gradient-to-r from-muted/50 to-transparent p-4 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{invoice.periodLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{invoice.invoiceNumber}</p>
          </div>
          <StatusBadge status={invoice.status} label={PARENT_INVOICE_LABELS[invoice.status]} />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total Tagihan</span>
          <span className="font-currency text-lg font-bold">{formatRupiah(invoice.totalDue)}</span>
        </div>

        {invoice.totalPaid > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Dibayar</span>
            <span className="font-currency text-sm font-medium text-success">{formatRupiah(invoice.totalPaid)}</span>
          </div>
        )}

        {remaining > 0 && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Sisa</span>
            <span className="font-currency text-sm font-bold text-destructive">{formatRupiah(remaining)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-muted/20 border-t border-border/50">
        <Button
          onClick={onView}
          className="w-full"
          size="lg"
          aria-label={`Lihat detail ${invoice.invoiceNumber}`}
        >
          <Eye size={16} className="mr-2" />
          Lihat Detail
        </Button>
      </div>
    </div>
  );
}
