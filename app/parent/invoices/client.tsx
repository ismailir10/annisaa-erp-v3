"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { InvoiceFilter } from "@/components/parent/invoice-filter";
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton";

// Dynamically import InvoiceDetailSheet to reduce initial bundle size
const InvoiceDetailSheet = dynamic(
  () => import("./invoice-detail-sheet").then((mod) => ({ default: mod.InvoiceDetailSheet })),
  {
    loading: () => <InvoiceDetailSkeleton />,
    ssr: false,
  }
);

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
};

export function InvoicesClient({ data }: { data: InvoiceItem[] | null }) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("unpaid");
  const loading = data === null;

  useEffect(() => {
    if (data === null) {
      toast.error("Gagal memuat data tagihan");
    }
  }, [data]);

  if (loading) {
    return (
      <div className="pb-24">
        {/* Header — mirrors "Tagihan Saya" h1 */}
        <Skeleton className="h-6 w-36 mb-4" />

        {/* Filter tabs — 5 pills mirroring InvoiceFilter (sticky, bg-background) */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-3 -mx-5 px-5 mb-4">
          <div className="flex gap-2 overflow-x-auto">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
            ))}
          </div>
        </div>

        {/* Row skeletons — match DataTable 3-col + action cell grid */}
        <div className="rounded-2xl border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-4 border-b last:border-b-0"
            >
              {/* Periode cell: label + invoice number */}
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              {/* Amount cell: currency */}
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              {/* Status cell: badge */}
              <div className="w-24 shrink-0">
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              {/* Action cell */}
              <div className="w-8 shrink-0">
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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

  const unpaidCount = data.filter((i) => i.status === "SENT").length;
  const partialCount = data.filter((i) => i.status === "PARTIALLY_PAID").length;
  const overdueCount = data.filter((i) => i.status === "OVERDUE").length;

  const counts = {
    total: data.length,
    unpaid: unpaidCount,
    partial: partialCount,
    paid: data.filter((i) => i.status === "PAID").length,
    overdue: overdueCount,
  };

  const columns: ColumnDef<InvoiceItem>[] = [
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
              <p className="font-currency text-xs text-success">Dibayar: {formatRupiah(inv.totalPaid)}</p>
            )}
            {remaining > 0 && inv.status !== "DRAFT" && (
              <p className="font-currency text-xs text-destructive">Sisa: {formatRupiah(remaining)}</p>
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
          onView={() => setSelectedInvoiceId(row.original.id)}
        />
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Tagihan Saya</h1>

      {/* Filter - Touch-Friendly Chips */}
      <div className="mb-4">
        <InvoiceFilter
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      {/* DataTable - Responsive for both mobile and desktop */}
      <DataTable
        columns={columns}
        data={filteredData}
        defaultSort={{ field: "periodLabel", order: "desc" }}
        emptyTitle="Belum ada tagihan"
        emptyDescription="Tagihan akan muncul saat admin membuat tagihan bulanan."
      />

      <InvoiceDetailSheet
        open={!!selectedInvoiceId}
        onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
        invoiceId={selectedInvoiceId}
      />
    </div>
  );
}
