"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Banknote,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton";

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
      program: { name: string };
    } | null;
  };
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  BANK_TRANSFER: "Transfer Bank",
  XENDIT: "Online (Xendit)",
  OTHER: "Lainnya",
};

const METHOD_ICONS: Record<string, LucideIcon> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  XENDIT: CreditCard,
  OTHER: CreditCard,
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
  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  const isPayable = remaining > 0 && !isCancelled && !isPaid;
  const hasPaymentLink = !!invoice.xenditPaymentUrl;
  const focalAmount = isPaid ? invoice.totalDue : remaining;
  const childName = invoice.student.nickname ?? invoice.student.name.split(" ")[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {/* Frame 6/7 spec C1 — drag-handle bar centered at top */}
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        </div>
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="text-sm font-medium text-foreground">
            Tagihan {invoice.periodLabel}
            <span className="ml-1 text-muted-foreground">· {childName}</span>
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">{invoice.invoiceNumber}</p>
        </SheetHeader>

        <div className="px-card pb-card pt-4 space-y-6">
          {/* Focal amount card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p
              className={`font-currency text-[2rem] font-bold leading-none tracking-tight ${isPaid ? "text-status-present-text" : "text-status-absent-text"}`}
            >
              {formatRupiah(focalAmount)}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {isPaid ? (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-status-present-text">
                    Lunas
                  </span>
                  {invoice.paidAt ? (
                    <> · dibayar {formatDate(invoice.paidAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</>
                  ) : null}
                </>
              ) : isCancelled ? (
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Dibatalkan
                </span>
              ) : (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-status-absent-text">
                    Belum Dibayar
                  </span>
                  {" · jatuh tempo "}
                  <b className="text-foreground">
                    {formatDate(invoice.dueDate, { day: "numeric", month: "long", year: "numeric" })}
                  </b>
                </>
              )}
            </p>
          </div>

          {/* Rincian */}
          <section>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Rincian
            </p>
            <ul>
              {invoice.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{line.labelSnapshot}</p>
                    {line.adjustmentAmount !== 0 ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Penyesuaian: {formatRupiah(line.adjustmentAmount)}
                        {line.adjustmentNote ? ` (${line.adjustmentNote})` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-currency text-sm font-medium tabular-nums text-foreground">
                    {formatRupiah(line.finalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Cara bayar — unpaid only, single Xendit card */}
          {isPayable ? (
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Cara bayar
              </p>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <QrCode size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Pembayaran online</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      QRIS · Virtual Account · E-wallet · kartu
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Bukti pembayaran — paid only */}
          {isPaid ? (
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Bukti pembayaran
              </p>
              <a
                href={`/api/guardian/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Kuitansi.pdf</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {invoice.paidAt
                      ? `Diterbitkan ${formatDate(invoice.paidAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}`
                      : "Diterbitkan"}
                  </p>
                </div>
                <Download size={16} className="shrink-0 text-muted-foreground" />
              </a>
            </section>
          ) : null}

          {/* Payment history (paid invoices with multiple payment events) */}
          {invoice.payments.length > 0 ? (
            <section>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Riwayat pembayaran
              </p>
              <ul className="space-y-2">
                {invoice.payments.map((p) => {
                  const Icon = METHOD_ICONS[p.method] ?? CreditCard;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <div className="grid size-10 place-items-center rounded-lg bg-status-present-subtle text-status-present-text">
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {METHOD_LABELS[p.method] ?? p.method}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatDate(p.paidAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </p>
                      </div>
                      <span className="font-currency text-sm font-bold tabular-nums text-status-present-text">
                        {formatRupiah(p.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Bayar sekarang CTA — always rendered when invoice is payable.
              Disabled when xenditPaymentUrl is still being provisioned, with
              a helper line below explaining the wait state. Spec C3. */}
          {isPayable ? (
            <div className="space-y-2">
              {hasPaymentLink ? (
                <a
                  href={invoice.xenditPaymentUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full" size="lg">
                    <ExternalLink size={16} className="mr-2" />
                    Bayar sekarang
                  </Button>
                </a>
              ) : (
                <Button className="w-full" size="lg" disabled>
                  <ExternalLink size={16} className="mr-2" />
                  Bayar sekarang
                </Button>
              )}
              {!hasPaymentLink ? (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <SheetClose render={<Button variant="outline" className="w-full">Tutup</Button>} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
