"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
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
import { FormField } from "@/components/ui/form-field";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";

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
    header: "Siswa",
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
            <p className="font-currency text-[10px] text-[#00B37E]">
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function InvoicesPage() {
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

  // Dialog state
  const [generateDialog, setGenerateDialog] = useState(false);
  const [genForm, setGenForm] = useState({ periodLabel: "", dueDate: "", academicYearId: "" });
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<
    { studentName: string; invoiceNumber: string; paymentUrl: string }[] | null
  >(null);

  // Fetch academic years once
  useEffect(() => {
    fetch("/api/academic-years")
      .then((r) => r.json())
      .then((y) => setYears(Array.isArray(y) ? y : y.data ?? []))
      .catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortField: "createdAt",
        sortOrder: "desc",
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/invoices?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter]);

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
    fetchInvoices();
    setSending(false);
  }

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
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Buat tagihan bulanan untuk semua siswa aktif"
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
            <FormField label="Periode" required help="Contoh: April 2026">
              <Input
                value={genForm.periodLabel}
                onChange={(e) => setGenForm({ ...genForm, periodLabel: e.target.value })}
                placeholder="April 2026"
              />
            </FormField>
            <FormField label="Tanggal Jatuh Tempo" required>
              <Input
                type="date"
                value={genForm.dueDate}
                onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })}
              />
            </FormField>
            <FormField label="Tahun Ajaran" required>
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
            </FormField>
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
