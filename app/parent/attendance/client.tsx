"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AlertCircle } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { useEffect } from "react";
import { toast } from "sonner";

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  notes: string | null;
};

const columns: ColumnDef<AttendanceRecord>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tanggal" />,
    cell: ({ row }) => (
      <span className="text-sm font-medium">{formatDateShort(row.original.date)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function AttendanceClient({ data }: { data: AttendanceRecord[] | null }) {
  useEffect(() => {
    if (data === null) {
      toast.error("Gagal memuat data kehadiran");
    }
  }, [data]);

  if (data === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground">Gagal memuat data kehadiran</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Kehadiran Anak</h1>

      <DataTable
        columns={columns}
        data={data}
        defaultSort={{ field: "date", order: "desc" }}
        emptyTitle="Belum ada data kehadiran"
        emptyDescription="Data kehadiran akan muncul setelah guru mencatat absensi."
      />
    </div>
  );
}
