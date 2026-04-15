"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatRupiah } from "@/lib/format";

const PARENT_INVOICE_LABELS: Record<string, string> = {
  SENT: "Belum Dibayar",
  PARTIALLY_PAID: "Dibayar Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
  CANCELLED: "Dibatalkan",
};

type UnpaidInvoiceItem = {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  xenditPaymentUrl: string | null;
};

const columns: ColumnDef<UnpaidInvoiceItem>[] = [
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
    id: "remaining",
    accessorFn: (row) => row.totalDue - row.totalPaid,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sisa" />,
    cell: ({ row }) => {
      const remaining = row.original.totalDue - row.original.totalPaid;
      return (
        <span className="font-currency text-sm font-bold text-destructive">
          {formatRupiah(remaining)}
        </span>
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

      // Show payment button if URL exists and remaining > 0
      if (inv.xenditPaymentUrl && remaining > 0) {
        return (
          <a
            href={inv.xenditPaymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Button size="sm">
              <ExternalLink size={12} className="mr-1" /> Bayar
            </Button>
          </a>
        );
      }

      // Otherwise, show link to invoices page
      return (
        <Link href="/parent/invoices" className="text-primary hover:underline flex items-center gap-1 text-xs">
          Lihat <ExternalLink size={12} />
        </Link>
      );
    },
  },
];

export function UnpaidInvoicesTable({ data }: { data: UnpaidInvoiceItem[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      defaultSort={{ field: "periodLabel", order: "desc" }}
      emptyTitle="Tidak ada tagihan tertunda"
      emptyDescription="Semua tagihan telah lunas."
    />
  );
}
