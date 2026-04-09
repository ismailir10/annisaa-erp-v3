"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatRupiah } from "@/lib/format";

type Invoice = {
  id: string; invoiceNumber: string; periodLabel: string; dueDate: string;
  totalDue: number; totalPaid: number; status: string; createdAt: string;
  student: { name: string; nickname: string | null };
  _count: { payments: number };
};
type AcademicYear = { id: string; name: string; status: string };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [generateDialog, setGenerateDialog] = useState(false);
  const [genForm, setGenForm] = useState({ periodLabel: "", dueDate: "", academicYearId: "" });
  const [generating, setGenerating] = useState(false);

  async function fetchData() {
    setLoading(true);
    const [inv, yr] = await Promise.all([
      fetch(`/api/invoices?status=${filter}`).then(r => r.json()),
      fetch("/api/academic-years").then(r => r.json()),
    ]);
    setInvoices(inv); setYears(yr); setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [filter]);

  async function handleGenerate() {
    if (!genForm.periodLabel || !genForm.dueDate || !genForm.academicYearId) { toast.error("Lengkapi semua field"); return; }
    setGenerating(true);
    const res = await fetch("/api/invoices/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(genForm) });
    if (res.ok) {
      const d = await res.json();
      toast.success(`${d.created} tagihan dibuat (${d.skipped} dilewati)`);
      setGenerateDialog(false);
      fetchData();
    } else { const d = await res.json(); toast.error(d.error || "Gagal membuat tagihan"); }
    setGenerating(false);
  }

  // Auto-fill period label
  function openGenerateDialog() {
    const now = new Date();
    const monthName = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    const activeYear = years.find(y => y.status === "ACTIVE");
    setGenForm({ periodLabel: monthName, dueDate, academicYearId: activeYear?.id ?? "" });
    setGenerateDialog(true);
  }

  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ studentName: string; invoiceNumber: string; paymentUrl: string }[] | null>(null);

  async function handleSendInvoices() {
    const draftIds = invoices.filter(i => i.status === "DRAFT").map(i => i.id);
    if (draftIds.length === 0) { toast.error("Tidak ada tagihan DRAFT untuk dikirim"); return; }
    if (!confirm(`Kirim ${draftIds.length} tagihan? Link pembayaran Xendit akan dibuat untuk setiap tagihan.`)) return;

    setSending(true);
    const res = await fetch("/api/xendit/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceIds: draftIds }),
    });
    const d = await res.json();
    if (d.created > 0) {
      toast.success(`${d.created} link pembayaran berhasil dibuat`);
      setSendResults(d.results);
    }
    if (d.failed > 0) toast.error(`${d.failed} tagihan gagal`);
    if (d.errors?.length) d.errors.forEach((e: string) => console.error(e));
    fetchData();
    setSending(false);
  }

  // Stats
  const totalDue = invoices.reduce((s, i) => s + i.totalDue, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.totalPaid, 0);
  const paidCount = invoices.filter(i => i.status === "PAID").length;
  const draftCount = invoices.filter(i => i.status === "DRAFT").length;
  const pendingCount = invoices.filter(i => ["DRAFT", "SENT"].includes(i.status)).length;

  return (
    <>
      <PageHeader
        title="Tagihan"
        description={`${invoices.length} tagihan`}
        actions={
          <div className="flex gap-2">
            {draftCount > 0 && (
              <Button size="sm" onClick={handleSendInvoices} disabled={sending}>
                {sending ? "Mengirim..." : `Kirim ${draftCount} Tagihan`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openGenerateDialog}>
              <Plus size={14} className="mr-1.5" /> Buat Tagihan
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card className="p-3"><p className="text-[10px] text-muted-foreground">Total Tagihan</p><p className="font-currency text-lg font-bold mt-1">{formatRupiah(totalDue)}</p></Card>
          <Card className="p-3"><p className="text-[10px] text-muted-foreground">Total Dibayar</p><p className="font-currency text-lg font-bold mt-1 text-[#00B37E]">{formatRupiah(totalPaid)}</p></Card>
          <Card className="p-3"><p className="text-[10px] text-muted-foreground">Lunas</p><p className="font-currency text-lg font-bold mt-1">{paidCount}</p></Card>
          <Card className="p-3"><p className="text-[10px] text-muted-foreground">Menunggu</p><p className="font-currency text-lg font-bold mt-1 text-[#FF8C00]">{pendingCount}</p></Card>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4">
        <Select value={filter} onValueChange={v => v && setFilter(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Terkirim</SelectItem>
            <SelectItem value="PAID">Lunas</SelectItem>
            <SelectItem value="PARTIALLY_PAID">Sebagian</SelectItem>
            <SelectItem value="OVERDUE">Jatuh Tempo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />)}</div>
      ) : invoices.length === 0 ? (
        <EmptyState icon={FileText} title="Belum ada tagihan" description="Buat tagihan bulanan untuk semua siswa aktif" actionLabel="Buat Tagihan" onAction={openGenerateDialog} />
      ) : (
        <div className="space-y-1">
          {invoices.map((inv, i) => (
            <motion.div key={inv.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <Link href={`/admin/invoices/${inv.id}`}>
                <Card className="p-3 hover:border-primary/20 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{inv.student.name}</span>
                          <span className="font-currency text-[10px] text-muted-foreground">{inv.invoiceNumber}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{inv.periodLabel} · Jatuh tempo: {inv.dueDate}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-currency text-sm font-bold">{formatRupiah(inv.totalDue)}</p>
                      {inv.totalPaid > 0 && inv.totalPaid < inv.totalDue && (
                        <p className="font-currency text-[10px] text-[#00B37E]">Dibayar: {formatRupiah(inv.totalPaid)}</p>
                      )}
                      <StatusBadge status={inv.status} className="mt-0.5" />
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Generate Dialog */}
      <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Tagihan Bulanan</DialogTitle>
            <DialogDescription>Sistem akan membuat tagihan untuk semua siswa aktif berdasarkan struktur biaya program.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Periode" required help="Contoh: April 2026">
              <Input value={genForm.periodLabel} onChange={e => setGenForm({ ...genForm, periodLabel: e.target.value })} placeholder="April 2026" />
            </FormField>
            <FormField label="Tanggal Jatuh Tempo" required>
              <Input type="date" value={genForm.dueDate} onChange={e => setGenForm({ ...genForm, dueDate: e.target.value })} />
            </FormField>
            <FormField label="Tahun Ajaran" required>
              <Select value={genForm.academicYearId} onValueChange={v => v && setGenForm({ ...genForm, academicYearId: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleGenerate} disabled={generating}>{generating ? "Membuat..." : "Buat Tagihan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Results Dialog — shows payment links for WhatsApp sharing */}
      <Dialog open={!!sendResults} onOpenChange={(o) => !o && setSendResults(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Pembayaran Berhasil Dibuat</DialogTitle>
            <DialogDescription>Salin link di bawah dan kirim ke orang tua via WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-3 py-2">
            {sendResults?.map((r, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.studentName}</p>
                    <p className="text-[10px] text-muted-foreground font-currency">{r.invoiceNumber}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(r.paymentUrl); toast.success(`Link ${r.studentName} disalin`); }}>
                    Salin Link
                  </Button>
                </div>
                <p className="text-[10px] text-primary mt-1 break-all">{r.paymentUrl}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              const allLinks = sendResults?.map(r => `${r.studentName}: ${r.paymentUrl}`).join("\n") ?? "";
              navigator.clipboard.writeText(allLinks);
              toast.success("Semua link disalin");
            }}>
              Salin Semua Link
            </Button>
            <DialogClose><Button>Selesai</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
