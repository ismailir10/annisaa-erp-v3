"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/constants/payment-methods";
import { Wallet, Receipt, Download } from "lucide-react";

type LedgerRow = {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  invoiceNumber: string;
  studentName: string;
};

type Summary = {
  totalAmount: number;
  totalCount: number;
  byMethod: { method: string; methodLabel: string; amount: number; count: number }[];
};

function formatJakartaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const columns: ColumnDef<LedgerRow>[] = [
  {
    accessorKey: "paidAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tanggal" />,
    cell: ({ row }) => (
      <span className="text-sm whitespace-nowrap">{formatJakartaDateTime(row.original.paidAt)}</span>
    ),
  },
  {
    id: "student",
    header: "Siswa",
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.studentName}</span>,
  },
  {
    accessorKey: "invoiceNumber",
    header: "No. Tagihan",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.invoiceNumber}</span>
    ),
  },
  {
    id: "method",
    header: "Metode",
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs">{row.original.methodLabel}</Badge>
    ),
  },
  {
    id: "reference",
    header: "Referensi",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.reference ?? "—"}</span>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Jumlah" />,
    cell: ({ row }) => (
      <span className="text-sm font-medium tabular-nums">{formatRupiah(row.original.amount)}</span>
    ),
  },
];

export default function PaymentsLedgerPage() {
  const today = getTodayInTimezone("Asia/Jakarta");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [method, setMethod] = useState("all");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalAmount: 0, totalCount: 0, byMethod: [] });
  const [loading, setLoading] = useState(true);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ dateFrom, dateTo });
    if (method !== "all") params.set("method", method);
    return params;
  }, [dateFrom, dateTo, method]);

  const fetchLedger = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/payments?${buildParams()}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Gagal memuat penerimaan");
        }
        const json = await res.json();
        if (!signal.cancelled) {
          setRows(json.data ?? []);
          setSummary(json.summary ?? { totalAmount: 0, totalCount: 0, byMethod: [] });
        }
      } catch (e) {
        if (!signal.cancelled) {
          toast.error(e instanceof Error ? e.message : "Gagal memuat penerimaan");
        }
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [buildParams],
  );

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    const signal = { cancelled: false };
    fetchLedger(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [dateFrom, dateTo, fetchLedger]);

  return (
    <>
      <PageHeader
        title="Penerimaan"
        description="Pembayaran masuk per rentang tanggal — rekap kas harian dan bulanan."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <StatCard
          label="Total Penerimaan"
          value={formatRupiah(summary.totalAmount)}
          icon={Wallet}
          color="success"
          index={0}
        />
        <StatCard
          label="Jumlah Transaksi"
          value={summary.totalCount}
          icon={Receipt}
          color="primary"
          index={1}
        />
      </div>

      {summary.byMethod.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {summary.byMethod.map((m) => (
            <Badge key={m.method} variant="secondary" className="text-xs font-normal">
              {m.methodLabel}: {formatRupiah(m.amount)} ({m.count})
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Dari</span>
          <Input
            type="date"
            aria-label="Tanggal mulai"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-40 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sampai</span>
          <Input
            type="date"
            aria-label="Tanggal akhir"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-40 text-sm"
          />
        </div>
        <Select value={method} onValueChange={(v) => setMethod(v ?? "all")}>
          <SelectTrigger className="h-9 w-44 text-sm" aria-label="Filter metode pembayaran">
            <SelectValue placeholder="Semua Metode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Metode</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 ml-auto"
          disabled={loading || rows.length === 0}
          onClick={() => window.open(`/api/payments/export?${buildParams()}`, "_blank")}
        >
          <Download size={14} className="mr-1" /> Ekspor CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyTitle="Belum ada penerimaan"
        emptyDescription="Pembayaran yang tercatat pada rentang tanggal ini akan tampil di sini. Coba ubah rentang atau filter metode."
      />
    </>
  );
}
