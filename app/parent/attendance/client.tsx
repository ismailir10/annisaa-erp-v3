"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListItem } from "@/components/portal/card-list-item";
import { formatDate } from "@/lib/format";
import { Calendar } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ATTENDANCE_STATUS_VALUES,
  type AttendanceStatusValue,
} from "@/lib/validations/parent-attendance";

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

const WEEKDAY_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Parse a date-only or ISO string safely into the local day. Mirrors the
 * handling in `lib/format.ts` so the card leading circle and `formatDate`
 * body share the same day.
 */
function parseDay(dateStr: string): Date {
  const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  return new Date(dateOnly + "T00:00:00");
}

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

  // Newest-first fixed sort — the card list has no column headers to re-sort on.
  const sortField = "date" as const;
  const sortOrder = "desc" as const;

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
  }, [
    studentId,
    pagination.page,
    pagination.pageSize,
    statusFilter,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handlePrevPage = useCallback(() => {
    setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }));
  }, []);

  const handleNextPage = useCallback(() => {
    setPagination((p) => ({
      ...p,
      page: Math.min(p.totalPages || 1, p.page + 1),
    }));
  }, []);

  // Distinguish "no records ever" vs "filter empty" vs "connection error"
  const emptyCopy = useMemo(() => {
    if (errored) {
      return {
        title: "Kehadiran belum bisa dimuat",
        description: "Koneksi terputus. Coba lagi sebentar ya.",
      };
    }
    if (filtersActive) {
      return {
        title: "Belum ada hasil untuk filter ini",
        description:
          "Coba ubah rentang tanggal atau status, atau ketuk Reset.",
      };
    }
    return {
      title: "Belum ada catatan kehadiran",
      description:
        "Insyaallah akan muncul setelah Ustadzah mengisi absensi hari ini.",
    };
  }, [errored, filtersActive]);

  return (
    <div>
      {/*
       * Filter row — Shadcn Select + date Inputs wrapped in Field so each
       * control has an accessible FieldLabel above it (replaces the native
       * `aria-label="Dari tanggal"` ergonomics that were invisible to sighted
       * parents scanning on mid-range Android).
       */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,11rem)_minmax(0,11rem)_auto] mb-4">
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full h-9">
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
        </Field>

        <Field>
          <FieldLabel>Dari tanggal</FieldLabel>
          <Input
            type="date"
            value={dateFromRaw}
            onChange={(e) => {
              setDateFromRaw(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="w-full h-9"
          />
        </Field>

        <Field>
          <FieldLabel>Sampai tanggal</FieldLabel>
          <Input
            type="date"
            value={dateToRaw}
            onChange={(e) => {
              setDateToRaw(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="w-full h-9"
          />
        </Field>

        {filtersActive && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-9 w-full sm:w-auto"
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Day list — CardListItem primitive, not DataTable. Parent family has
       *  <30 attendance rows in a typical month; this keeps the parent-portal
       *  norm (<10 rows per page) and eliminates the admin-grade chrome. */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          accent="warm"
          icon={Calendar}
          title={emptyCopy.title}
          description={emptyCopy.description}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.map((record) => {
              const day = parseDay(record.date);
              const weekday = WEEKDAY_SHORT_ID[day.getDay()];
              const dayNum = day.getDate();

              return (
                <li key={record.id}>
                  <CardListItem
                    leading={
                      <div
                        className="size-11 rounded-full bg-primary/5 text-primary flex flex-col items-center justify-center leading-tight"
                        aria-hidden="true"
                      >
                        <span className="text-xs uppercase tracking-wide font-medium leading-none">
                          {weekday}
                        </span>
                        <span className="text-sm font-semibold leading-tight">
                          {dayNum}
                        </span>
                      </div>
                    }
                    primary={formatDate(record.date)}
                    secondary={
                      record.notes && record.notes.trim().length > 0
                        ? record.notes
                        : "Tidak ada catatan"
                    }
                    trailing={
                      <StatusBadge
                        status={record.status}
                        variant="intent"
                        label={
                          STATUS_LABELS[
                            record.status as AttendanceStatusValue
                          ] ?? undefined
                        }
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>

          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Halaman {pagination.page} dari {pagination.totalPages} ·{" "}
                {pagination.total} catatan
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.page <= 1}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
