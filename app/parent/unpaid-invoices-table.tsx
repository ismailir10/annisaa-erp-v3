"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye } from "lucide-react";
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

export function UnpaidInvoicesTable({ data, childId }: { data: UnpaidInvoiceItem[]; childId?: string }) {
  // Memoize columns with childId to avoid recreating on every render
  const columns: ColumnDef<UnpaidInvoiceItem>[] = useMemo(() => [
    {
      accessorKey: "periodLabel",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Periode" />,
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium">{row.original.periodLabel}</span>
          <p className="text-xs text-muted-foreground font-currency">{row.original.invoiceNumber}</p>
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
              <Button size="icon" variant="default" aria-label="Bayar tagihan">
                <ExternalLink size={16} />
              </Button>
            </a>
          );
        }

        // Otherwise, show ghost icon link to invoices page, preserving child selection
        return (
          <Link
            href={childId ? `/parent/invoices?child=${childId}` : "/parent/invoices"}
            className="inline-block"
          >
            <Button size="icon" variant="ghost" aria-label="Lihat tagihan">
              <Eye size={16} />
            </Button>
          </Link>
        );
      },
    },
  ], [childId]); // Recreate columns only when childId changes

  return (
    <DataTable
      columns={columns}
      data={data}
      defaultSort={{ field: "periodLabel", order: "desc" }}
      emptyTitle="Belum ada tagihan bulan ini"
      emptyDescription="Alhamdulillah, semua lunas."
    />
  );
}
