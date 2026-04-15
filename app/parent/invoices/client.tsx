"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Receipt, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { formatRupiah } from "@/lib/format";

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
  totalDue: number;
  totalPaid: number;
  status: string;
  xenditPaymentUrl: string | null;
  createdAt: string;
};

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
    cell: ({ row }) => {
      const inv = row.original;
      const remaining = inv.totalDue - inv.totalPaid;
      if (!inv.xenditPaymentUrl || remaining <= 0) return null;
      return (
        <a href={inv.xenditPaymentUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm">
            <ExternalLink size={12} className="mr-1" /> Bayar
          </Button>
        </a>
      );
    },
  },
];

export function InvoicesClient({ data }: { data: InvoiceItem[] }) {
  const totalDue = data.reduce((s, i) => s + i.totalDue, 0);
  const totalPaid = data.reduce((s, i) => s + i.totalPaid, 0);
  const paidCount = data.filter(i => i.status === "PAID").length;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Tagihan Saya</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Tagihan" value={formatRupiah(totalDue)} icon={Receipt} color="primary" index={0} />
        <StatCard label="Dibayar" value={formatRupiah(totalPaid)} icon={CheckCircle} color="success" index={1} />
        <StatCard label="Lunas" value={`${paidCount}/${data.length}`} icon={Clock} color="primary" index={2} />
      </div>

      <DataTable
        columns={columns}
        data={data}
        defaultSort={{ field: "periodLabel", order: "desc" }}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Tagihan akan muncul saat admin membuat tagihan bulanan."
      />
    </div>
  );
}
