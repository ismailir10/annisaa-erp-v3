"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Send, Check, Pencil, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
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

export default function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("all");

  // Detail sheet
  const [detailItem, setDetailItem] = useState<PayrollItem | null>(null);

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

  // Edit toggle for summary card (Category B — Edit Toggle Pattern, DRAFT only)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ periodStart: "", periodEnd: "", actualWorkDays: 0 });
  const [editSaving, setEditSaving] = useState(false);
  const [comparison, setComparison] = useState<Record<string, number> | null>(null);
  const [prevPeriod, setPrevPeriod] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [payRes, compRes] = await Promise.all([
      fetch(`/api/payroll/${id}`),
      fetch(`/api/payroll/compare?current=${id}`),
    ]);
    const payData = await payRes.json();
    setData(payData);
    setDetailItem((current) => {
      if (!current) return current;
      return payData.items?.find((i: PayrollItem) => i.id === current.id) ?? current;
    });
    try {
      const comp = await compRes.json();
      if (comp?.comparison) {
        const map: Record<string, number> = {};
        for (const c of comp.comparison) {
          if (c.delta !== null) map[c.employeeId] = c.delta;
        }
        setComparison(map);
        setPrevPeriod(comp.previousPeriod);
      }
    } catch { /* no comparison available */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const payrollItems = data?.items ?? [];
  const filteredItems = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return payrollItems.filter((item) => {
      const matchesSearch =
        !q ||
        [
          item.employee.nama,
          item.employee.kode,
          item.employee.jabatan,
          item.employee.bankName ?? "",
          item.employee.bankAccountNo ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesBank =
        bankFilter === "all" ||
        (bankFilter === "complete" && Boolean(item.employee.bankAccountNo)) ||
        (bankFilter === "missing" && !item.employee.bankAccountNo);
      return matchesSearch && matchesBank;
    });
  }, [payrollItems, employeeSearch, bankFilter]);

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

  function openEdit() {
    if (!data) return;
    setEditForm({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      actualWorkDays: data.actualWorkDays,
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  async function saveEdit() {
    if (!data) return;
    setEditSaving(true);
    const res = await fetch(`/api/payroll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      toast.success("Periode diperbarui");
      setIsEditing(false);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal menyimpan");
    }
    setEditSaving(false);
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

  if (loading) return <DetailPageSkeleton />;
  if (!data) return <div className="text-center py-20 text-muted-foreground"><p>Data penggajian tidak ditemukan.</p></div>;

  const totalGross = data.items.reduce((s, i) => s + Number(i.grossAmount), 0);
  const totalDed = data.items.reduce((s, i) => s + Number(i.deductions), 0);
  const totalNet = data.items.reduce((s, i) => s + Number(i.netAmount), 0);
  const noBank = data.items.filter((i) => !i.employee.bankAccountNo);
  const isDraft = data.status === "DRAFT";
  const isApproved = ["APPROVED", "EXPORTED", "SLIPS_SENT"].includes(data.status);

  const columns: ColumnDef<PayrollItem>[] = [
    {
      id: "nama",
      accessorFn: (row) => row.employee.nama,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Karyawan" />
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-bold">{item.employee.nama[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{item.employee.nama}</p>
              <p className="text-xs text-muted-foreground">{item.employee.kode} · {item.employee.jabatan}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "grossAmount",
      accessorFn: (row) => Number(row.grossAmount),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Pendapatan" />
      ),
      cell: ({ row }) => (
        <span className="font-currency text-sm">{formatRupiah(row.original.grossAmount)}</span>
      ),
    },
    {
      id: "deductions",
      accessorFn: (row) => Number(row.deductions),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Potongan" />
      ),
      cell: ({ row }) => (
        <span className="font-currency text-sm text-destructive">{formatRupiah(row.original.deductions)}</span>
      ),
    },
    {
      id: "netAmount",
      accessorFn: (row) => Number(row.netAmount),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Bersih" />
      ),
      cell: ({ row }) => {
        const item = row.original;
        const delta = comparison?.[item.employee.id];
        return (
          <div>
            <span className="font-currency text-sm font-bold">{formatRupiah(item.netAmount)}</span>
            {delta !== undefined && (
              <p className={`font-currency text-xs ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                {delta >= 0 ? "+" : ""}{formatRupiah(delta)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "bank",
      header: "Rekening",
      cell: ({ row }) => {
        if (!row.original.employee.bankAccountNo) {
          return <StatusBadge status="UNFILLED" />;
        }
        return (
          <span className="text-xs text-muted-foreground font-currency">
            ••• {row.original.employee.bankAccountNo.slice(-4)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DataTableRowActions onView={() => setDetailItem(row.original)} />
      ),
    },
  ];

  return (
    <>
      <DetailPageHeader
        backHref="/admin/payroll"
        title={`${data.periodStart} — ${data.periodEnd}`}
        description={`${data.items.length} karyawan · ${data.actualWorkDays} hari kerja`}
        badge={<StatusBadge status={data.status} />}
        actions={
          <>
            {isDraft && !isEditing && (
              <Button size="sm" variant="outline" onClick={openEdit} data-testid="payroll-edit-btn">
                <Pencil size={14} className="mr-1.5" /> Edit
              </Button>
            )}
            {isDraft && <Button size="sm" onClick={() => setApproveModal(true)}><Check size={14} className="mr-1.5" /> Setujui</Button>}
            {isApproved && <Button size="sm" variant="outline" onClick={handleExport}><Download size={14} className="mr-1.5" /> Ekspor BSI</Button>}
            {isApproved && <Button size="sm" onClick={() => setSendModal(true)}><Send size={14} className="mr-1.5" /> Kirim Slip</Button>}
          </>
        }
      />

      {/* Summary card — read-only view or Edit mode (DRAFT only) */}
      <Card className="p-card mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-medium">Ringkasan Periode</p>
            <p className="text-xs text-muted-foreground">
              {isEditing ? "Ubah periode atau hari kerja lalu simpan." : "Detail periode penggajian."}
            </p>
          </div>
          {isEditing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={editSaving}>
                <X size={14} className="mr-1.5" /> Batal
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={editSaving} data-testid="payroll-edit-save">
                {editSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          )}
        </div>

        {!isEditing ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Periode Mulai</p>
              <p className="text-sm font-medium" data-testid="payroll-period-start">{data.periodStart}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Periode Akhir</p>
              <p className="text-sm font-medium">{data.periodEnd}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hari Kerja Aktual</p>
              <p className="text-sm font-medium">{data.actualWorkDays}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field>
              <FieldLabel>Periode Mulai</FieldLabel>
              <Input
                type="date"
                value={editForm.periodStart}
                onChange={(e) => setEditForm({ ...editForm, periodStart: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Periode Akhir</FieldLabel>
              <Input
                type="date"
                value={editForm.periodEnd}
                onChange={(e) => setEditForm({ ...editForm, periodEnd: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Hari Kerja Aktual</FieldLabel>
              <Input
                type="number"
                min={0}
                value={editForm.actualWorkDays}
                onChange={(e) => setEditForm({ ...editForm, actualWorkDays: parseInt(e.target.value) || 0 })}
              />
            </Field>
          </div>
        )}
      </Card>

      {/* Summary */}
      <StatsCardsRow cols={4}>
        <Card className="p-card"><p className="text-xs text-muted-foreground">Total Pendapatan</p><p className="font-currency text-2xl font-bold mt-1">{formatRupiah(totalGross)}</p></Card>
        <Card className="p-card"><p className="text-xs text-muted-foreground">Total Potongan</p><p className="font-currency text-2xl font-bold mt-1 text-destructive">{formatRupiah(totalDed)}</p></Card>
        <Card className="p-card"><p className="text-xs text-muted-foreground">Total Bersih</p><p className="font-currency text-2xl font-bold mt-1 text-primary">{formatRupiah(totalNet)}</p></Card>
        <Card className="p-card"><p className="text-xs text-muted-foreground">Status</p>
          <StatusBadge status={data.status} />
          {noBank.length > 0 && <p className="text-xs text-destructive mt-1">{noBank.length} tanpa rekening</p>}
        </Card>
      </StatsCardsRow>

      {prevPeriod && (
        <p className="text-xs text-muted-foreground mb-4">
          Dibandingkan dengan periode sebelumnya: {prevPeriod}
        </p>
      )}

      {/* Employee DataTable */}
      <DataTableToolbar
        value={employeeSearch}
        onValueChange={setEmployeeSearch}
        searchPlaceholder="Cari karyawan, kode, jabatan..."
        filters={[
          {
            key: "bank",
            label: "Rekening",
            value: bankFilter,
            onChange: setBankFilter,
            options: [
              { value: "all", label: "Semua Rekening" },
              { value: "complete", label: "Rekening Lengkap" },
              { value: "missing", label: "Tanpa Rekening" },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={filteredItems}
        pagination={{ page: 1, pageSize: 10, total: filteredItems.length, totalPages: Math.max(1, Math.ceil(filteredItems.length / 10)) }}
        defaultSort={{ field: "nama", order: "asc" }}
        emptyTitle="Tidak ada data karyawan"
        emptyDescription="Ubah kata kunci atau filter rekening untuk melihat data lain."
      />

      {/* Detail Sheet */}
      <Sheet open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle>{detailItem.employee.nama}</SheetTitle>
                <SheetDescription>
                  {detailItem.employee.kode} · {detailItem.employee.jabatan}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {/* Variables button */}
                {isDraft && (
                  <button onClick={() => openVars(detailItem)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <Settings2 size={12} /> Edit Variabel Kehadiran
                  </button>
                )}

                {/* Component lines */}
                <div className="space-y-1">
                  {detailItem.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between py-2 text-xs border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={line.categorySnapshot === "INCOME" ? "text-foreground" : "text-destructive"}>
                          {line.labelSnapshot}
                        </span>
                        {Number(line.adjustmentAmount) !== 0 && (
                          <Badge variant="outline" className="text-caption">Adj</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-currency">{formatRupiah(line.finalAmount)}</span>
                        {isDraft && (
                          <button onClick={() => openLineAdj(detailItem, line)} aria-label={`Edit penyesuaian ${line.labelSnapshot}`} className="p-1 rounded hover:bg-accent text-muted-foreground">
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t border-border pt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Pendapatan</span><span className="font-currency font-medium">{formatRupiah(detailItem.grossAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Potongan</span><span className="font-currency font-medium text-destructive">{formatRupiah(detailItem.deductions)}</span></div>
                  <div className="flex justify-between font-bold text-base"><span>Bersih</span><span className="font-currency text-primary">{formatRupiah(detailItem.netAmount)}</span></div>
                </div>

                {/* Bank info */}
                {detailItem.employee.bankAccountNo && (
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Transfer ke: {detailItem.employee.bankName} {detailItem.employee.bankAccountNo}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Variables Modal */}
      <Dialog open={!!varsModal} onOpenChange={(o) => !o && setVarsModal(null)}>
        <DialogContent className="p-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Variabel Kehadiran</DialogTitle>
            <DialogDescription>{varsModal?.employee.nama}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field><FieldLabel>Jam Lembur</FieldLabel><Input type="number" step="0.5" value={varsForm.overtimeHours} onChange={(e) => setVarsForm({ ...varsForm, overtimeHours: parseFloat(e.target.value) || 0 })} /></Field>
            <Field><FieldLabel>Hari Outdoor</FieldLabel><Input type="number" value={varsForm.outdoorDays} onChange={(e) => setVarsForm({ ...varsForm, outdoorDays: parseInt(e.target.value) || 0 })} /></Field>
            <Field><FieldLabel>Hari Libur Kerja</FieldLabel><Input type="number" value={varsForm.holidayWorkedDays} onChange={(e) => setVarsForm({ ...varsForm, holidayWorkedDays: parseInt(e.target.value) || 0 })} /></Field>
            <Field><FieldLabel>Hari DC</FieldLabel><Input type="number" value={varsForm.dcDays} onChange={(e) => setVarsForm({ ...varsForm, dcDays: parseInt(e.target.value) || 0 })} /></Field>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={saveVars} disabled={varsSaving}>{varsSaving ? "Menyimpan..." : "Simpan & Hitung Ulang"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line Adjustment Modal */}
      <Dialog open={!!lineModal} onOpenChange={(o) => !o && setLineModal(null)}>
        <DialogContent className="p-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Penyesuaian</DialogTitle>
            <DialogDescription>{lineModal?.line.labelSnapshot} — {lineModal?.item.employee.nama}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Kalkulasi: <span className="font-currency font-medium">{formatRupiah(lineModal?.line.calculatedAmount ?? 0)}</span></p>
            <Field><FieldLabel>Penyesuaian (+ atau -)</FieldLabel><Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="0" className="font-currency" /></Field>
            <Field><FieldLabel required>Catatan</FieldLabel><Textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Alasan penyesuaian..." rows={2} /></Field>
            <p className="text-sm">Final: <span className="font-currency font-bold text-primary">{formatRupiah(Number(lineModal?.line.calculatedAmount ?? 0) + (parseFloat(adjAmount) || 0))}</span></p>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={saveLineAdj} disabled={adjSaving}>{adjSaving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve — AlertDialog: irreversible (locks attendance) */}
      <AlertDialog open={approveModal} onOpenChange={setApproveModal}>
        <AlertDialogContent className="p-card sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui Penggajian</AlertDialogTitle>
            <AlertDialogDescription>Setelah disetujui, kehadiran akan dikunci dan tidak bisa diubah.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2 text-sm">
            <p>Periode: {data.periodStart} — {data.periodEnd}</p>
            <p>Karyawan: {data.items.length}</p>
            <p>Total Bersih: <span className="font-currency font-bold">{formatRupiah(totalNet)}</span></p>
            {noBank.length > 0 && <p className="text-destructive">{noBank.length} karyawan tanpa rekening bank</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={approving}>{approving ? "Menyetujui..." : "Setujui"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Slips — AlertDialog: irreversible (emails sent) */}
      <AlertDialog open={sendModal} onOpenChange={setSendModal}>
        <AlertDialogContent className="p-card sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim Slip Gaji</AlertDialogTitle>
            <AlertDialogDescription>Slip gaji PDF akan dikirim ke email setiap karyawan.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 text-sm">
            <p>{data.items.length} slip akan dikirim</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendSlips} disabled={sending}>{sending ? "Mengirim..." : "Kirim Semua"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
