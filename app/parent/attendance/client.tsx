"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateShort } from "@/lib/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ATTENDANCE_STATUS_VALUES,
  type AttendanceStatusValue,
} from "@/lib/validations/parent-attendance";
import { PageHeader } from "@/components/portal/page-header";

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  notes: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type StatusFilter = AttendanceStatusValue | "all";

const STATUS_LABELS: Record<AttendanceStatusValue, string> = {
  PRESENT: "Hadir",
  ABSENT: "Alpa",
  SICK: "Sakit",
  PERMISSION: "Izin",
};

const columns: ColumnDef<AttendanceRecord>[] = [
  {
    id: "date",
    accessorKey: "date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tanggal" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-medium">
        {formatDateShort(row.original.date)}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.status}
        label={STATUS_LABELS[row.original.status as AttendanceStatusValue] ?? undefined}
      />
    ),
  },
];

export function AttendanceClient({
  studentId,
  initialPageSize = 20,
}: {
  studentId: string;
  initialPageSize?: number;
}) {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: initialPageSize,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  // Filters (committed values used in the request — debounced from raw inputs)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFromRaw, setDateFromRaw] = useState("");
  const [dateToRaw, setDateToRaw] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortField, setSortField] = useState<"date" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Debounce date inputs by 300ms before kicking off a fetch
  useEffect(() => {
    const t = setTimeout(() => setDateFrom(dateFromRaw), 300);
    return () => clearTimeout(t);
  }, [dateFromRaw]);
  useEffect(() => {
    const t = setTimeout(() => setDateTo(dateToRaw), 300);
    return () => clearTimeout(t);
  }, [dateToRaw]);

  const filtersActive =
    statusFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortField,
        sortOrder,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(
        `/api/parent/children/${studentId}/attendance?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        data: AttendanceRecord[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
      setData(json.data);
      setPagination({
        page: json.page,
        pageSize: json.pageSize,
        total: json.total,
        totalPages: json.totalPages,
      });
    } catch {
      setErrored(true);
      toast.error("Data kehadiran belum bisa dimuat. Coba lagi sebentar ya.");
    } finally {
      setLoading(false);
    }
    // pagination.page/pageSize intentionally drive refetch; including the
    // whole object would loop because we set it inside.
  }, [
    studentId,
    pagination.page,
    pagination.pageSize,
    sortField,
    sortOrder,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback(
    (field: string, order: "asc" | "desc") => {
      if (field !== "date" && field !== "status") return;
      setSortField(field);
      setSortOrder(order);
      setPagination((p) => ({ ...p, page: 1 }));
    },
    [],
  );

  const handleStatusChange = useCallback((value: string | null) => {
    if (!value) return;
    if (value === "all") {
      setStatusFilter("all");
    } else if (
      (ATTENDANCE_STATUS_VALUES as readonly string[]).includes(value)
    ) {
      setStatusFilter(value as AttendanceStatusValue);
    }
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handleReset = useCallback(() => {
    setStatusFilter("all");
    setDateFromRaw("");
    setDateToRaw("");
    setDateFrom("");
    setDateTo("");
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  // Distinguish "no records ever" vs "filter empty"
  const emptyTitle = useMemo(() => {
    if (errored) return "Kehadiran belum bisa dimuat";
    if (filtersActive) return "Belum ada hasil untuk filter ini";
    return "Belum ada catatan kehadiran";
  }, [errored, filtersActive]);

  const emptyDescription = useMemo(() => {
    if (errored) return "Koneksi terputus. Coba lagi sebentar ya.";
    if (filtersActive)
      return "Coba ubah rentang tanggal atau status, atau ketuk Reset.";
    return "Catatan muncul setelah Ustadz/Ustadzah mencatat absensi.";
  }, [errored, filtersActive]);

  return (
    <div>
      <PageHeader title="Kehadiran Anak" />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-40 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {ATTENDANCE_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFromRaw}
          onChange={(e) => {
            setDateFromRaw(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="w-full sm:w-44 h-9"
          aria-label="Dari tanggal"
        />
        <Input
          type="date"
          value={dateToRaw}
          onChange={(e) => {
            setDateToRaw(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="w-full sm:w-44 h-9"
          aria-label="Sampai tanggal"
        />

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9"
          >
            Reset
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: sortField, order: sortOrder }}
        loading={loading}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </div>
  );
}
