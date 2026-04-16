"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, AlertCircle } from "lucide-react";
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
  const loading = data === null;

  useEffect(() => {
    if (data === null) {
      toast.error("Gagal memuat data tagihan");
    }
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Filter skeleton */}
        <Skeleton className="h-12 w-full rounded-full" />
        {/* Card skeletons */}
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
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
        open={!!selectedInvoice}
        onOpenChange={(open) => !open && setSelectedInvoice(null)}
        invoice={selectedInvoice}
      />
    </div>
  );
}
