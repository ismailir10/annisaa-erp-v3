"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Send, Check, Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type PayrollLine = {
  id: string; labelSnapshot: string; categorySnapshot: string;
  calculatedAmount: number; adjustmentAmount: number; adjustmentNote: string | null; finalAmount: number;
  componentDef: { code: string; calcType: string };
};

type PayrollItem = {
  id: string; grossAmount: number; deductions: number; netAmount: number;
  overtimeHours: number; outdoorDays: number; holidayWorkedDays: number; dcDays: number;
  employee: { id: string; kode: string; nama: string; jabatan: string; bankAccountNo: string | null; bankName: string | null };
  lines: PayrollLine[];
};

type PayrollData = {
  id: string; periodStart: string; periodEnd: string; actualWorkDays: number; status: string;
  items: PayrollItem[];
};

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Modals
  const [varsModal, setVarsModal] = useState<PayrollItem | null>(null);
  const [lineModal, setLineModal] = useState<{ item: PayrollItem; line: PayrollLine } | null>(null);
  const [approveModal, setApproveModal] = useState(false);
  const [sendModal, setSendModal] = useState(false);

  // Vars form
  const [varsForm, setVarsForm] = useState({ overtimeHours: 0, outdoorDays: 0, holidayWorkedDays: 0, dcDays: 0 });
  const [varsSaving, setVarsSaving] = useState(false);

  // Line adjustment form
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  const [approving, setApproving] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/payroll/${id}`);
    setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openVars(item: PayrollItem) {
    setVarsForm({
      overtimeHours: item.overtimeHours,
      outdoorDays: item.outdoorDays,
      holidayWorkedDays: item.holidayWorkedDays,
      dcDays: item.dcDays,
    });
    setVarsModal(item);
  }

  async function saveVars() {
    if (!varsModal) return;
    setVarsSaving(true);
    const res = await fetch(`/api/payroll/${id}/items/${varsModal.id}/variables`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(varsForm),
    });
    if (res.ok) { toast.success("Variabel diperbarui"); setVarsModal(null); fetchData(); }
    else toast.error("Gagal menyimpan");
    setVarsSaving(false);
  }

  function openLineAdj(item: PayrollItem, line: PayrollLine) {
    setAdjAmount(String(line.adjustmentAmount || ""));
    setAdjNote(line.adjustmentNote ?? "");
    setLineModal({ item, line });
  }

  async function saveLineAdj() {
    if (!lineModal) return;
    setAdjSaving(true);
    const res = await fetch(`/api/payroll/${id}/items/${lineModal.item.id}/lines/${lineModal.line.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustmentAmount: parseFloat(adjAmount) || 0, adjustmentNote: adjNote }),
    });
    if (res.ok) { toast.success("Penyesuaian disimpan"); setLineModal(null); fetchData(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setAdjSaving(false);
  }

  async function handleApprove() {
    setApproving(true);
    const res = await fetch(`/api/payroll/${id}/approve`, { method: "POST" });
    if (res.ok) { toast.success("Penggajian disetujui"); setApproveModal(false); fetchData(); }
    else toast.error("Gagal menyetujui");
    setApproving(false);
  }

  async function handleExport() {
    window.open(`/api/payroll/${id}/export/bsi`, "_blank");
    setTimeout(fetchData, 1000);
  }

  async function handleSendSlips() {
    setSending(true);
    const res = await fetch(`/api/payroll/${id}/send-slips`, { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      toast.success(`${d.sent} slip terkirim`);
      setSendModal(false);
      fetchData();
    } else toast.error("Gagal mengirim");
    setSending(false);
  }

  if (loading) return <div className="animate-pulse h-96 bg-card rounded-xl" />;
  if (!data) return <p>Tidak ditemukan</p>;

  const totalGross = data.items.reduce((s, i) => s + i.grossAmount, 0);
  const totalDed = data.items.reduce((s, i) => s + i.deductions, 0);
  const totalNet = data.items.reduce((s, i) => s + i.netAmount, 0);
  const noBank = data.items.filter((i) => !i.employee.bankAccountNo);
  const isDraft = data.status === "DRAFT";
  const isApproved = ["APPROVED", "EXPORTED", "SLIPS_SENT"].includes(data.status);

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/payroll" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
      <PageHeader
        title={`${data.periodStart} — ${data.periodEnd}`}
        description={`${data.items.length} karyawan · ${data.actualWorkDays} hari kerja`}
        actions={
          <div className="flex gap-2">
            {isDraft && <Button size="sm" onClick={() => setApproveModal(true)}><Check size={14} className="mr-1.5" /> Setujui</Button>}
            {isApproved && <Button size="sm" variant="outline" onClick={handleExport}><Download size={14} className="mr-1.5" /> Ekspor BSI</Button>}
            {isApproved && <Button size="sm" onClick={() => setSendModal(true)}><Send size={14} className="mr-1.5" /> Kirim Slip</Button>}
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Pendapatan</p><p className="font-currency text-lg font-bold mt-1">{formatRp(totalGross)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Potongan</p><p className="font-currency text-lg font-bold mt-1 text-destructive">{formatRp(totalDed)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total Bersih</p><p className="font-currency text-lg font-bold mt-1 text-[#5DB4B8]">{formatRp(totalNet)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Status</p>
          <Badge variant="secondary" className={`mt-2 ${data.status === "DRAFT" ? "bg-muted" : "bg-status-present-subtle text-[#00875A]"}`}>{data.status}</Badge>
          {noBank.length > 0 && <p className="text-[10px] text-status-late mt-1">{noBank.length} tanpa rekening</p>}
        </Card>
      </div>

      {/* Employee items */}
      <div className="space-y-1">
        {data.items.map((item) => {
          const isExpanded = expandedItem === item.id;
          return (
            <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">{item.employee.nama[0]}</span>
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium truncate">{item.employee.nama}</p>
                    <p className="text-[10px] text-muted-foreground">{item.employee.kode} · {item.employee.jabatan}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!item.employee.bankAccountNo && <Badge variant="outline" className="text-[10px] text-status-late">No Bank</Badge>}
                  <span className="font-currency text-sm font-bold">{formatRp(item.netAmount)}</span>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 border-t border-border pt-3">
                      {/* Variables button */}
                      {isDraft && (
                        <button onClick={() => openVars(item)} className="text-xs text-primary flex items-center gap-1 mb-3 hover:underline">
                          <Settings2 size={12} /> Edit Variabel Kehadiran
                        </button>
                      )}

                      {/* Component lines */}
                      <div className="space-y-1">
                        {item.lines.map((line) => (
                          <div key={line.id} className="flex items-center justify-between py-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className={line.categorySnapshot === "INCOME" ? "text-foreground" : "text-destructive"}>
                                {line.labelSnapshot}
                              </span>
                              {line.adjustmentAmount !== 0 && (
                                <Badge variant="outline" className="text-[9px]">Adj</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-currency">{formatRp(line.finalAmount)}</span>
                              {isDraft && (
                                <button onClick={() => openLineAdj(item, line)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                                  <Pencil size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Item totals */}
                      <div className="border-t border-border mt-2 pt-2 space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Pendapatan</span><span className="font-currency font-medium">{formatRp(item.grossAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Potongan</span><span className="font-currency font-medium text-destructive">{formatRp(item.deductions)}</span></div>
                        <div className="flex justify-between font-bold"><span>Bersih</span><span className="font-currency text-[#5DB4B8]">{formatRp(item.netAmount)}</span></div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Variables Modal */}
      <Dialog open={!!varsModal} onOpenChange={(o) => !o && setVarsModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Variabel Kehadiran</DialogTitle>
            <DialogDescription>{varsModal?.employee.nama}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Jam Lembur</Label><Input type="number" step="0.5" value={varsForm.overtimeHours} onChange={(e) => setVarsForm({ ...varsForm, overtimeHours: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>Hari Outdoor</Label><Input type="number" value={varsForm.outdoorDays} onChange={(e) => setVarsForm({ ...varsForm, outdoorDays: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>Hari Libur Kerja</Label><Input type="number" value={varsForm.holidayWorkedDays} onChange={(e) => setVarsForm({ ...varsForm, holidayWorkedDays: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>Hari DC</Label><Input type="number" value={varsForm.dcDays} onChange={(e) => setVarsForm({ ...varsForm, dcDays: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveVars} disabled={varsSaving}>{varsSaving ? "Menyimpan..." : "Simpan & Hitung Ulang"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line Adjustment Modal */}
      <Dialog open={!!lineModal} onOpenChange={(o) => !o && setLineModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Penyesuaian</DialogTitle>
            <DialogDescription>{lineModal?.line.labelSnapshot} — {lineModal?.item.employee.nama}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Kalkulasi: <span className="font-currency font-medium">{formatRp(lineModal?.line.calculatedAmount ?? 0)}</span></p>
            <div><Label>Penyesuaian (+ atau -)</Label><Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="0" className="font-currency" /></div>
            <div><Label>Catatan *</Label><Textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Alasan penyesuaian..." rows={2} /></div>
            <p className="text-sm">Final: <span className="font-currency font-bold text-[#5DB4B8]">{formatRp((lineModal?.line.calculatedAmount ?? 0) + (parseFloat(adjAmount) || 0))}</span></p>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={saveLineAdj} disabled={adjSaving}>{adjSaving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Modal */}
      <Dialog open={approveModal} onOpenChange={setApproveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setujui Penggajian</DialogTitle>
            <DialogDescription>Setelah disetujui, kehadiran akan dikunci dan tidak bisa diubah.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            <p>Periode: {data.periodStart} — {data.periodEnd}</p>
            <p>Karyawan: {data.items.length}</p>
            <p>Total Bersih: <span className="font-currency font-bold">{formatRp(totalNet)}</span></p>
            {noBank.length > 0 && <p className="text-status-late">{noBank.length} karyawan tanpa rekening bank</p>}
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleApprove} disabled={approving}>{approving ? "Menyetujui..." : "Setujui"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Slips Modal */}
      <Dialog open={sendModal} onOpenChange={setSendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kirim Slip Gaji</DialogTitle>
            <DialogDescription>Slip gaji PDF akan dikirim ke email setiap karyawan.</DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm">
            <p>{data.items.length} slip akan dikirim</p>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleSendSlips} disabled={sending}>{sending ? "Mengirim..." : "Kirim Semua"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
