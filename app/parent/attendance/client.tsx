"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserCheck, UserX, CalendarDays } from "lucide-react";
import { formatDateShort, formatTime } from "@/lib/format";

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
    id: "checkIn",
    header: "Masuk",
    cell: ({ row }) => (
      <span className="text-xs font-currency text-muted-foreground">
        {row.original.checkInTime ? formatTime(row.original.checkInTime) : "—"}
      </span>
    ),
  },
  {
    id: "checkOut",
    header: "Pulang",
    cell: ({ row }) => (
      <span className="text-xs font-currency text-muted-foreground">
        {row.original.checkOutTime ? formatTime(row.original.checkOutTime) : "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export function AttendanceClient({ data }: { data: AttendanceRecord[] }) {
  const present = data.filter(r => r.status === "PRESENT").length;
  const absent = data.filter(r => ["ABSENT", "SICK", "PERMISSION"].includes(r.status)).length;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Kehadiran Anak</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Hadir" value={present} icon={UserCheck} color="success" index={0} />
        <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={1} />
        <StatCard label="Total" value={data.length} icon={CalendarDays} color="primary" index={2} />
      </div>

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
