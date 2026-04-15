"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Receipt, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InvoiceDetailSheet } from "./invoice-detail-sheet";

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
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  // For detail view
  lines: Array<{
    id: string;
    labelSnapshot: string;
    amount: number;
    finalAmount: number;
    adjustmentAmount: number;
    adjustmentNote: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    paidAt: string;
  }>;
  student: {
    name: string;
    nickname: string | null;
    classSection: {
      name: string;
      program: { name: string };
    } | null;
  };
};

export function InvoicesClient({ data }: { data: InvoiceItem[] | null }) {
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("unpaid");

  useEffect(() => {
    if (data === null) {
      toast.error("Gagal memuat data tagihan");
    }
  }, [data]);

  if (data === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground">Gagal memuat data tagihan</p>
        </div>
      </div>
    );
  }

  // Filter data based on status
  const filteredData = data.filter((item) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unpaid") return item.status === "SENT";
    if (statusFilter === "partial") return item.status === "PARTIALLY_PAID";
    if (statusFilter === "paid") return item.status === "PAID";
    if (statusFilter === "overdue") return item.status === "OVERDUE";
    return true;
  });

  const totalDue = data.reduce((s, i) => s + i.totalDue, 0);
  const totalPaid = data.reduce((s, i) => s + i.totalPaid, 0);
  const paidCount = data.filter(i => i.status === "PAID").length;

  const columns: ColumnDef<InvoiceItem>[] = [
    {
      accessorKey: "periodLabel",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium">{row.original.periodLabel}</span>
          <p className="text-[10px] text-muted-foreground font-currency">{row.original.invoiceNumber}</p>
        </div>
      ),
    },
    {
      id: "amount",
      accessorFn: (row) => row.totalDue,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Jumlah" />,
      cell: ({ row }) => {
        const inv = row.original;
        const remaining = inv.totalDue - inv.totalPaid;
        return (
          <div>
            <span className="font-currency text-sm font-bold">{formatRupiah(inv.totalDue)}</span>
            {inv.totalPaid > 0 && inv.totalPaid < inv.totalDue && (
              <p className="font-currency text-[10px] text-success">Dibayar: {formatRupiah(inv.totalPaid)}</p>
            )}
            {remaining > 0 && inv.status !== "DRAFT" && (
              <p className="font-currency text-[10px] text-destructive">Sisa: {formatRupiah(remaining)}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} label={PARENT_INVOICE_LABELS[row.original.status]} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DataTableRowActions
          onView={() => setSelectedInvoice(row.original)}
        />
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Tagihan Saya</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Tagihan" value={formatRupiah(totalDue)} icon={Receipt} color="primary" index={0} />
        <StatCard label="Dibayar" value={formatRupiah(totalPaid)} icon={CheckCircle} color="success" index={1} />
        <StatCard label="Lunas" value={`${paidCount}/${data.length}`} icon={Clock} color="primary" index={2} />
      </div>

      {/* Status Filter */}
      <div className="mb-4">
        <Select
          value={statusFilter}
          onValueChange={(value) => value && setStatusFilter(value)}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Filter berdasarkan status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="unpaid">Belum Dibayar</SelectItem>
            <SelectItem value="partial">Dibayar Sebagian</SelectItem>
            <SelectItem value="paid">Lunas</SelectItem>
            <SelectItem value="overdue">Jatuh Tempo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        defaultSort={{ field: "periodLabel", order: "desc" }}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Tagihan akan muncul saat admin membuat tagihan bulanan."
      />

      <InvoiceDetailSheet
        open={!!selectedInvoice}
        onOpenChange={(open) => !open && setSelectedInvoice(null)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
