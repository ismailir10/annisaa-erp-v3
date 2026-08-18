"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Banknote,
  Building2,
  Download,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { formatRupiah, formatDate, formatInvoicePeriod } from "@/lib/format";
import { Amount, AmountStatus } from "@/components/portal/amount";
import { SectionLabel } from "@/components/portal/section-label";
import { paymentLinkState } from "@/lib/parent-invoice-link";
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
  XENDIT: "Virtual Account",
  // Gateway-paid rows carry the active gateway as their method. Without an
  // entry here a DOKU payment renders a blank label to the parent.
  DOKU: "Virtual Account",
  OTHER: "Lainnya",
};

const METHOD_ICONS: Record<string, LucideIcon> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  XENDIT: Building2,
  DOKU: Building2,
  OTHER: Building2,
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
        {/*
          `data-[side=right]:w-full` is load-bearing. SheetContent's base class
          sets `data-[side=right]:w-3/4`, and a data-attribute variant outranks
          a plain `w-full` from the call site — so this sheet rendered at 75%
          of the viewport on a phone, leaving a ~95px dead gutter and wrapping
          "Transfer bank (Virtual Account)" onto two lines. Same reason the
          desktop cap has to be written as `data-[side=right]:sm:max-w-md`.
        */}
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
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
  // A parent who already transferred part of the SPP was shown the identical
  // "Belum Dibayar" treatment as someone who had paid nothing — only the
  // amount differed. Give the state its own label so the payment they already
  // made is visibly acknowledged.
  const isPartiallyPaid = !isPaid && !isCancelled && invoice.totalPaid > 0;
  const hasPaymentLink = !!invoice.xenditPaymentUrl;
  const linkState = paymentLinkState(hasPaymentLink, invoice.sentAt);
  const focalAmount = isPaid ? invoice.totalDue : remaining;
  const childName = invoice.student.nickname ?? invoice.student.name.split(" ")[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {/* The Frame 6/7 drag-handle bar is gone: this is a side sheet, not a
            bottom sheet, so the handle advertised a drag gesture that does not
            exist. The Lainnya overflow surface is a real bottom Drawer and
            keeps its handle. */}
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="text-sm font-medium text-foreground">
            Tagihan {formatInvoicePeriod(invoice.periodLabel)}
            <span className="ml-1 text-muted-foreground">· {childName}</span>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{invoice.invoiceNumber}</p>
        </SheetHeader>

        <div className="px-card pb-card pt-4 space-y-6">
          {/* Focal amount card */}
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <Amount
              value={focalAmount}
              size="display"
              tone={isPaid ? "paid" : "neutral"}
            />
            {/* Status is a chip beside the figure, not a second uppercase shout
                on top of a coloured number. Sentence case per voice.md. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
              {isPaid ? (
                <>
                  <AmountStatus tone="paid">Lunas</AmountStatus>
                  {invoice.paidAt ? (
                    <span>
                      Dibayar{" "}
                      {formatDate(invoice.paidAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  ) : null}
                </>
              ) : isCancelled ? (
                <AmountStatus tone="cancelled">Dibatalkan</AmountStatus>
              ) : isPartiallyPaid ? (
                <>
                  <AmountStatus tone="partial">Dibayar sebagian</AmountStatus>
                  <span>
                    Sudah dibayar <b className="text-foreground">{formatRupiah(invoice.totalPaid)}</b> · sisa
                    jatuh tempo{" "}
                    <b className="text-foreground">
                      {formatDate(invoice.dueDate, { day: "numeric", month: "long", year: "numeric" })}
                    </b>
                  </span>
                </>
              ) : (
                <>
                  <AmountStatus tone="due">Belum dibayar</AmountStatus>
                  <span>
                    Jatuh tempo{" "}
                    <b className="text-foreground">
                      {formatDate(invoice.dueDate, { day: "numeric", month: "long", year: "numeric" })}
                    </b>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Rincian */}
          <section>
            <SectionLabel>Rincian</SectionLabel>
            <ul>
              {invoice.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{line.labelSnapshot}</p>
                    {line.adjustmentAmount !== 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Penyesuaian: {formatRupiah(line.adjustmentAmount)}
                        {line.adjustmentNote ? ` (${line.adjustmentNote})` : ""}
                      </p>
                    ) : null}
                  </div>
                  <Amount value={line.finalAmount} size="line" className="shrink-0" />
                </li>
              ))}
            </ul>
          </section>

          {/* Cara bayar — unpaid only, single Xendit card */}
          {isPayable ? (
            <section>
              <SectionLabel>Cara bayar</SectionLabel>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Building2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Transfer bank (Virtual Account)</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      BCA · Mandiri · BRI · BNI · Permata · CIMB
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Bukti pembayaran — paid only */}
          {isPaid ? (
            <section>
              <SectionLabel>Bukti pembayaran</SectionLabel>
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
                  <p className="mt-0.5 text-xs text-muted-foreground">
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
              <SectionLabel>Riwayat pembayaran</SectionLabel>
              <ul className="space-y-2">
                {invoice.payments.map((p) => {
                  const Icon = METHOD_ICONS[p.method] ?? Building2;
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
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(p.paidAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </p>
                      </div>
                      <Amount value={p.amount} size="row" tone="paid" className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Bayar sekarang CTA — rendered when invoice is payable.
              - linkState "ready":   live link button.
              - linkState "pending": disabled button + optimistic "sedang disiapkan" copy
                                     (the gateway normally provisions in minutes).
              - linkState "stale":   no button; direct parent to contact admin.
                                     Covers the case where the gateway provision never
                                     completed (UAT 2026-05-12 parent MINOR-02). */}
          {isPayable ? (
            <div className="space-y-2">
              {linkState === "ready" ? (
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
              ) : linkState === "pending" ? (
                <>
                  <Button className="w-full" size="lg" disabled>
                    <ExternalLink size={16} className="mr-2" />
                    Bayar sekarang
                  </Button>
                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      Link pembayaran sedang disiapkan. Silakan coba lagi dalam beberapa saat.
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-status-late bg-status-late-subtle p-3 text-xs text-status-late-text">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Link pembayaran belum tersedia. Silakan <strong>hubungi admin sekolah</strong> untuk info pembayaran.
                  </span>
                </div>
              )}
            </div>
          ) : null}

          <SheetClose render={<Button variant="outline" className="w-full">Tutup</Button>} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
