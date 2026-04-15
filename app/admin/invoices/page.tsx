"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatCard } from "@/components/admin/stat-card";
import { Plus, FileText, Receipt, CheckCircle, Clock, AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah, formatDateShort } from "@/lib/format";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Invoice = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  dueDate: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  createdAt: string;
  student: { name: string; nickname: string | null };
  _count: { payments: number };
};

type AcademicYear = { id: string; name: string; status: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ------------------------------------------------------------------
// Columns
// ------------------------------------------------------------------

const columns: ColumnDef<Invoice>[] = [
  {
    id: "student",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Siswa" />
    ),
    cell: ({ row }) => {
      const inv = row.original;
      return (
        <Link
          href={`/admin/invoices/${inv.id}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <FileText size={14} className="text-primary" />
          </div>
          <div>
            <span className="text-sm font-medium group-hover:text-primary transition-colors">
              {inv.student.name}
            </span>
            <p className="font-currency text-[10px] text-muted-foreground">
              {inv.invoiceNumber}
            </p>
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: "periodLabel",
    header: "Periode",
    cell: ({ row }) => (
      <div>
        <span className="text-sm">{row.original.periodLabel}</span>
        <p className="text-[10px] text-muted-foreground">
          Jatuh tempo: {row.original.dueDate}
        </p>
      </div>
    ),
  },
  {
    id: "amount",
    header: "Jumlah",
    cell: ({ row }) => {
      const inv = row.original;
      const remaining = Number(inv.totalDue) - Number(inv.totalPaid);
      return (
        <div className="text-right">
          <p className="font-currency text-sm font-bold">
            {formatRupiah(Number(inv.totalDue))}
          </p>
          {Number(inv.totalPaid) > 0 && Number(inv.totalPaid) < Number(inv.totalDue) && (
            <p className="font-currency text-[10px] text-success">
              Dibayar: {formatRupiah(Number(inv.totalPaid))}
            </p>
          )}
          {remaining > 0 && inv.status !== "DRAFT" && (
            <p className="font-currency text-[10px] text-destructive">
              Sisa: {formatRupiah(remaining)}
            </p>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dibuat" />
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDateShort(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function InvoicesPage() {
  const router = useRouter();
  const [data, setData] = useState<Invoice[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);

  // Dialog state
  const [generateDialog, setGenerateDialog] = useState(false);
  const [genForm, setGenForm] = useState({ periodLabel: "", dueDate: "", academicYearId: "" });
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [stats, setStats] = useState({ total: 0, draft: 0, sent: 0, paid: 0, overdue: 0 });
  const [sendResults, setSendResults] = useState<
    { studentName: string; invoiceNumber: string; paymentUrl: string }[] | null
  >(null);

  // Fetch stats + academic years once
  useEffect(() => {
    Promise.all([
      fetch("/api/invoices?pageSize=1&status=DRAFT").then(r => r.json()),
      fetch("/api/invoices?pageSize=1&status=SENT").then(r => r.json()),
      fetch("/api/invoices?pageSize=1&status=PAID").then(r => r.json()),
      fetch("/api/invoices?pageSize=1&status=OVERDUE").then(r => r.json()),
    ]).then(([draft, sent, paid, overdue]) => {
      const d = draft.pagination?.total ?? 0;
      const s = sent.pagination?.total ?? 0;
      const p = paid.pagination?.total ?? 0;
      const o = overdue.pagination?.total ?? 0;
      setStats({ total: d + s + p + o, draft: d, sent: s, paid: p, overdue: o });
    }).catch(() => { /* stats are non-critical */ });
  }, []);

  useEffect(() => {
    fetch("/api/academic-years")
      .then((r) => r.json())
      .then((y) => setYears(Array.isArray(y) ? y : y.data ?? []))
      .catch(() => { /* academic years lookup is non-critical */ });
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/invoices?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data tagihan");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => {
    setSortBy(field);
    setSortOrder(order);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  function openGenerateDialog() {
    const now = new Date();
    const monthName = now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    const activeYear = years.find((y) => y.status === "ACTIVE");
    setGenForm({ periodLabel: monthName, dueDate, academicYearId: activeYear?.id ?? "" });
    setGenerateDialog(true);
  }

  async function handleGenerate() {
    if (!genForm.periodLabel || !genForm.dueDate || !genForm.academicYearId) {
      toast.error("Lengkapi semua field");
      return;
    }
    setGenerating(true);
    const res = await fetch("/api/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(genForm),
    });
    if (res.ok) {
      const d = await res.json();
      toast.success(`${d.created} tagihan dibuat (${d.skipped} dilewati)`);
      setGenerateDialog(false);
      fetchInvoices();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal membuat tagihan");
    }
    setGenerating(false);
  }

  async function handleSendInvoices() {
    const draftIds = data.filter((i) => i.status === "DRAFT").map((i) => i.id);
    if (draftIds.length === 0) {
      toast.error("Tidak ada tagihan DRAFT untuk dikirim");
      return;
    }

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
    if (d.errors?.length) d.errors.forEach((e: string) => toast.error(e));
    fetchInvoices();
    setSending(false);
  }

  async function handleVoidInvoice() {
    if (!voidTarget) return;
    const res = await fetch(`/api/invoices/${voidTarget.id}/void`, { method: "POST" });
    if (res.ok) {
      toast.success("Tagihan dibatalkan");
      setVoidTarget(null);
      fetchInvoices();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal membatalkan tagihan");
    }
  }

  const columnsWithActions = useMemo<ColumnDef<Invoice>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const inv = row.original;
          const canVoid = inv.status === "DRAFT" || inv.status === "SENT";
          return (
            <DataTableRowActions
              onView={() => router.push(`/admin/invoices/${inv.id}`)}
              extraActions={
                canVoid
                  ? [
                      {
                        label: "Batalkan",
                        icon: <Ban size={14} />,
                        destructive: true,
                        onClick: () => setVoidTarget(inv),
                      },
                    ]
                  : undefined
              }
            />
          );
        },
      },
    ],
    [router],
  );

  // Stats from current page data (approximate — for exact stats, use a separate API)
  const draftCount = data.filter((i) => i.status === "DRAFT").length;

  return (
    <>
      <PageHeader
        title="Tagihan"
        description={`${pagination.total} tagihan`}
        actions={
          <div className="flex gap-2">
            {draftCount > 0 && (
              <Button size="sm" onClick={() => setSendConfirmOpen(true)} disabled={sending}>
                {sending ? "Mengirim..." : `Kirim ${draftCount} Tagihan`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openGenerateDialog}>
              <Plus size={14} className="mr-1.5" /> Buat Tagihan
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Tagihan" value={stats.total} icon={Receipt} color="primary" index={0} />
        <StatCard label="Draft" value={stats.draft} icon={Clock} color="warning" index={1} />
        <StatCard label="Lunas" value={stats.paid} icon={CheckCircle} color="success" index={2} />
        <StatCard label="Jatuh Tempo" value={stats.overdue} icon={AlertTriangle} color="error" index={3} />
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari siswa atau nomor tagihan..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: [
              { value: "all", label: "Semua Status" },
              { value: "DRAFT", label: "Draft" },
              { value: "SENT", label: "Terkirim" },
              { value: "PAID", label: "Lunas" },
              { value: "PARTIALLY_PAID", label: "Sebagian" },
              { value: "OVERDUE", label: "Jatuh Tempo" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columnsWithActions}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Buat tagihan bulanan untuk semua siswa aktif"
      />

      {/* Send Confirmation */}
      <ConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title="Kirim Tagihan"
        description={`Kirim ${draftCount} tagihan? Link pembayaran Xendit akan dibuat untuk setiap tagihan.`}
        onConfirm={handleSendInvoices}
        confirmLabel="Ya, Kirim"
      />

      {/* Void Confirmation */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="Batalkan Tagihan"
        description={`Batalkan tagihan ${voidTarget?.invoiceNumber} untuk ${voidTarget?.student.name}? Tindakan ini tidak dapat dikembalikan.`}
        onConfirm={handleVoidInvoice}
        confirmLabel="Ya, Batalkan"
      />

      {/* Generate Dialog */}
      <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Tagihan Bulanan</DialogTitle>
            <DialogDescription>
              Sistem akan membuat tagihan untuk semua siswa aktif berdasarkan struktur biaya program.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel>Periode *</FieldLabel>
              <Input
                value={genForm.periodLabel}
                onChange={(e) => setGenForm({ ...genForm, periodLabel: e.target.value })}
                placeholder="April 2026"
              />
              <FieldDescription>Contoh: April 2026</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Tanggal Jatuh Tempo *</FieldLabel>
              <Input
                type="date"
                value={genForm.dueDate}
                onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Tahun Ajaran *</FieldLabel>
              <Select
                value={genForm.academicYearId}
                onValueChange={(v) => v && setGenForm({ ...genForm, academicYearId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tahun ajaran" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Membuat..." : "Buat Tagihan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Results Dialog */}
      <Dialog open={!!sendResults} onOpenChange={(o) => !o && setSendResults(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Pembayaran Berhasil Dibuat</DialogTitle>
            <DialogDescription>
              Salin link di bawah dan kirim ke orang tua via WhatsApp
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-3 py-2">
            {sendResults?.map((r, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.studentName}</p>
                    <p className="text-[10px] text-muted-foreground font-currency">{r.invoiceNumber}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(r.paymentUrl);
                      toast.success(`Link ${r.studentName} disalin`);
                    }}
                  >
                    Salin Link
                  </Button>
                </div>
                <p className="text-[10px] text-primary mt-1 break-all">{r.paymentUrl}</p>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const allLinks = sendResults?.map((r) => `${r.studentName}: ${r.paymentUrl}`).join("\n") ?? "";
                navigator.clipboard.writeText(allLinks);
                toast.success("Semua link disalin");
              }}
            >
              Salin Semua Link
            </Button>
            <DialogClose>
              <Button>Selesai</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
