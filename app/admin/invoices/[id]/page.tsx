"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { XenditActivityCard } from "@/components/admin/invoices/xendit-activity-card";
import { ArrowLeft, Ban, CreditCard, Phone, Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah, formatDateShort } from "@/lib/format";

type InvoiceLine = { id: string; labelSnapshot: string; amount: number; adjustmentAmount: number; adjustmentNote: string | null; finalAmount: number; feeComponent: { code: string; category: string } };
type Payment = { id: string; amount: number; method: string; reference: string | null; notes: string | null; paidAt: string };
type InvoiceDetail = {
  id: string; invoiceNumber: string; periodLabel: string; dueDate: string;
  totalDue: number; totalPaid: number; status: string; xenditPaymentUrl: string | null;
  paymentLinkError: string | null;
  student: { name: string; nickname: string | null; guardians: { parent: { name: string; phone: string | null; email: string | null; whatsapp: string | null } }[] };
  lines: InvoiceLine[]; payments: Payment[];
};

const METHOD_LABELS: Record<string, string> = { CASH: "Tunai", BANK_TRANSFER: "Transfer Bank", XENDIT: "Virtual Account", OTHER: "Lainnya" };

// ------------------------------------------------------------------
// Payment Form Body (shared between Dialog + Sheet)
// ------------------------------------------------------------------

function PaymentFormBody({
  payForm,
  setPayForm,
  remaining,
}: {
  payForm: { amount: string; method: string; reference: string; notes: string };
  setPayForm: (v: { amount: string; method: string; reference: string; notes: string }) => void;
  remaining: number;
}) {
  return (
    <>
      <Field>
        <FieldLabel required>Jumlah</FieldLabel>
        <Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} className="font-currency" placeholder="0" />
        <FieldDescription>Sisa tagihan: {formatRupiah(remaining)}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Metode Pembayaran</FieldLabel>
        <Select value={payForm.method} onValueChange={v => v && setPayForm({ ...payForm, method: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CASH">Tunai</SelectItem>
            <SelectItem value="BANK_TRANSFER">Transfer Bank</SelectItem>
            <SelectItem value="XENDIT">Virtual Account</SelectItem>
            <SelectItem value="OTHER">Lainnya</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Referensi</FieldLabel>
        <Input value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Opsional" />
        <FieldDescription>Nomor transfer, ID transaksi, dll.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Catatan</FieldLabel>
        <Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Opsional" />
      </Field>
    </>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "CASH", reference: "", notes: "" });
  const [paying, setPaying] = useState(false);
  const [creatingXendit, setCreatingXendit] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchInvoice = useCallback(async () => {
    const res = await fetch(`/api/invoices/${id}`);
    if (res.ok) setInvoice(await res.json());
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  async function handlePayment() {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { toast.error("Masukkan jumlah pembayaran"); return; }
    setPaying(true);
    const res = await fetch(`/api/invoices/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payForm),
    });
    if (res.ok) { toast.success("Pembayaran dicatat"); setPaymentDialog(false); fetchInvoice(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal mencatat pembayaran"); }
    setPaying(false);
  }

  async function handleCreateXenditLink() {
    setCreatingXendit(true);
    const res = await fetch("/api/xendit/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: id }),
    });
    if (res.ok) {
      const d = await res.json();
      toast.success("Link pembayaran dibuat");
      if (d.paymentUrl) navigator.clipboard.writeText(d.paymentUrl);
      toast.info("Link disalin ke clipboard — kirim via WhatsApp");
      fetchInvoice();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal membuat link pembayaran");
    }
    setCreatingXendit(false);
  }

  async function handleRetryLink() {
    setRetrying(true);
    try {
      const res = await fetch("/api/invoices/retry-payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: [id] }),
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
      fetchInvoice();
    } finally {
      setRetrying(false);
    }
  }

  async function handleVoidInvoice() {
    setVoiding(true);
    const res = await fetch(`/api/invoices/${id}/void`, { method: "POST" });
    if (res.ok) {
      toast.success("Tagihan dibatalkan");
      setVoidConfirmOpen(false);
      fetchInvoice();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal membatalkan tagihan");
    }
    setVoiding(false);
  }

  if (loading) return <DetailPageSkeleton />;
  if (!invoice) return <EmptyState title="Tagihan tidak ditemukan" description="Data tagihan tidak tersedia." />;

  const guardianEntry = invoice.student.guardians[0];
  const guardian = guardianEntry?.parent;
  const remaining = Number(invoice.totalDue) - Number(invoice.totalPaid);
  const canVoid =
    invoice.status === "DRAFT" ||
    invoice.status === "SENT" ||
    invoice.status === "PENDING_PAYMENT_LINK";

  return (
    <>
      <DetailPageHeader
        backHref="/admin/invoices"
        backLabel="Kembali ke Daftar Tagihan"
        title={`${invoice.invoiceNumber}`}
        description={`${invoice.student.name} · ${invoice.periodLabel}`}
        badge={<StatusBadge status={invoice.status} />}
        actions={
          <>
            {invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
              <>
                {!invoice.xenditPaymentUrl && (
                  <Button size="sm" variant="outline" onClick={handleCreateXenditLink} disabled={creatingXendit}>
                    {creatingXendit ? "Membuat..." : "Buat Link Xendit"}
                  </Button>
                )}
                <Button size="sm" onClick={() => { setPayForm({ amount: String(remaining), method: "CASH", reference: "", notes: "" }); setPaymentDialog(true); }}>
                  <CreditCard size={14} className="mr-1" /> Catat Pembayaran
                </Button>
              </>
            )}
            {canVoid && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setVoidConfirmOpen(true)}
                data-testid="invoice-void-btn"
              >
                <Ban size={14} className="mr-1" /> Batalkan Tagihan
              </Button>
            )}
          </>
        }
      />

      {/* Void Confirmation */}
      <ConfirmDialog
        open={voidConfirmOpen}
        onOpenChange={(o) => !voiding && setVoidConfirmOpen(o)}
        title="Batalkan Tagihan"
        description={`Tagihan ${invoice.invoiceNumber} (${invoice.student.name}) tidak bisa dibayar lagi. Riwayat tetap tersimpan.`}
        onConfirm={handleVoidInvoice}
        confirmLabel={voiding ? "Membatalkan..." : "Ya, Batalkan"}
        destructive
      />

      {invoice.paymentLinkError && (
        <Card className="border-warning/40 bg-warning/5 p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Link pembayaran belum berhasil dibuat</p>
              <p className="text-xs text-muted-foreground mt-1">{invoice.paymentLinkError}</p>
            </div>
            <Button size="sm" onClick={handleRetryLink} disabled={retrying}>
              {retrying ? "..." : "Coba Lagi"}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Invoice Lines */}
        <Card className="p-card lg:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Rincian Tagihan</h3>
          <div className="space-y-2">
            {invoice.lines.map(line => (
              <div key={line.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{line.labelSnapshot}</p>
                  {line.adjustmentAmount !== 0 && (
                    <p className="text-xs text-muted-foreground">Penyesuaian: {formatRupiah(line.adjustmentAmount)} {line.adjustmentNote && `(${line.adjustmentNote})`}</p>
                  )}
                </div>
                <span className="font-currency text-sm font-bold">{formatRupiah(line.finalAmount)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Tagihan</span><span className="font-currency font-bold">{formatRupiah(invoice.totalDue)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dibayar</span><span className="font-currency font-bold text-status-present">{formatRupiah(invoice.totalPaid)}</span></div>
            {remaining > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sisa</span><span className="font-currency font-bold text-destructive">{formatRupiah(remaining)}</span></div>}
          </div>
        </Card>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Guardian info */}
          {guardian && (
            <Card className="p-card">
              <SectionHeading label="Kontak Wali" />
              <p className="text-sm font-medium">{guardian.name}</p>
              {guardian.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Phone size={10} /> {guardian.phone}</p>}
              {guardian.email && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail size={10} /> {guardian.email}</p>}
              {guardian.whatsapp && <p className="text-xs text-muted-foreground mt-0.5">WA: {guardian.whatsapp}</p>}
            </Card>
          )}

          {/* Payment link */}
          {invoice.xenditPaymentUrl && (
            <Card className="p-card">
              <SectionHeading label="Link Pembayaran" />
              <a href={invoice.xenditPaymentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">{invoice.xenditPaymentUrl}</a>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { navigator.clipboard.writeText(invoice.xenditPaymentUrl!); toast.success("Link disalin"); }}>
                Salin Link
              </Button>
            </Card>
          )}

          {/* Payment history */}
          <Card className="p-card">
            <SectionHeading label="Riwayat Pembayaran" />
            {invoice.payments.length === 0 ? (
              <EmptyState title="Belum ada pembayaran" />
            ) : (
              <div className="space-y-2">
                {invoice.payments.map(p => (
                  <div key={p.id} className="border-b border-border/50 last:border-0 pb-2">
                    <div className="flex justify-between">
                      <Badge variant="outline" className="text-xs">{METHOD_LABELS[p.method] ?? p.method}</Badge>
                      <span className="font-currency text-sm font-bold text-status-present">{formatRupiah(p.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateShort(p.paidAt)}
                      {p.reference && ` · Ref: ${p.reference}`}
                    </p>
                    {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Aktivitas Xendit — hides itself when 0 events */}
          <XenditActivityCard invoiceId={invoice.id} />
        </div>
      </div>

      {/* Payment Dialog (desktop) / Sheet (mobile, side="bottom" — narrow single-column form) */}
      {isMobile ? (
        <Sheet open={paymentDialog} onOpenChange={setPaymentDialog}>
          <SheetContent side="bottom" className="overflow-y-auto">
            <SheetHeader><SheetTitle>Catat Pembayaran</SheetTitle></SheetHeader>
            <div className="space-y-field px-4 pb-4">
              <PaymentFormBody payForm={payForm} setPayForm={setPayForm} remaining={remaining} />
            </div>
            <SheetFooter>
              <SheetClose><Button variant="ghost">Batal</Button></SheetClose>
              <Button onClick={handlePayment} disabled={paying}>{paying ? "Menyimpan..." : "Catat Pembayaran"}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Catat Pembayaran</DialogTitle></DialogHeader>
            <div className="space-y-field">
              <PaymentFormBody payForm={payForm} setPayForm={setPayForm} remaining={remaining} />
            </div>
            <DialogFooter>
              <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={handlePayment} disabled={paying}>{paying ? "Menyimpan..." : "Catat Pembayaran"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
