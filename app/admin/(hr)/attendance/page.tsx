"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { OverrideModal } from "@/components/attendance/override-modal";
import { UserCheck, Clock, UserX, CalendarDays, Download, Replace } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "sonner";
import { computeAbsentCount } from "./absent-stat";

type EmployeeAttendance = {
  employee: { id: string; kode: string; nama: string; jabatan: string; campusName: string };
  attendance: {
    id: string; status: string; checkInTime: string | null; checkOutTime: string | null;
    isManualOverride: boolean; isLocked: boolean;
  } | null;
};

type Campus = { id: string; name: string };
type Holiday = { date: string };

// F-20: today's date string used to skip the weekend/holiday exclusion when
// the admin is looking at the live "today" view (employees who haven't
// clocked in YET should still count as "tidak hadir" so the dashboard can
// nudge them). For past dates we want a clean stat — weekends and holidays
// are not absences.
const TODAY_ISO = new Date().toISOString().split("T")[0];

export default function AttendancePage() {
  const [date, setDate] = useState(TODAY_ISO);
  const [campusId, setCampusId] = useState("all");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<EmployeeAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  // F-20: holiday list fetched once. Used only to exclude past-date holidays
  // from the "tidak hadir" stat. Empty fetch failure is non-fatal — the stat
  // simply falls back to weekend-only exclusion.
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  // Override modal
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{
    recordId: string | null;
    employeeId: string;
    employeeName: string;
    currentStatus: string | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date, campusId });
      const [attRes, campRes] = await Promise.all([
        fetch(`/api/attendance/today?${params}`),
        fetch("/api/config/campuses"),
      ]);
      if (!attRes.ok || !campRes.ok) {
        toast.error("Gagal memuat data kehadiran");
        return;
      }
      setData(await attRes.json());
      setCampuses(await campRes.json());
    } catch {
      toast.error("Gagal memuat data kehadiran");
    } finally {
      setLoading(false);
    }
  }, [date, campusId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  // F-20: holidays fetched once on mount; non-blocking for the table.
  useEffect(() => {
    fetch("/api/config/holidays")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Holiday[]) =>
        setHolidays(new Set((Array.isArray(rows) ? rows : []).map((h) => h.date))),
      )
      .catch(() => {
        // Non-fatal: stat falls back to weekend-only exclusion.
      });
  }, []);

  const present = data.filter((d) => ["PRESENT", "LATE", "PRESENT_NO_CHECKOUT"].includes(d.attendance?.status ?? "")).length;
  const late = data.filter((d) => d.attendance?.status === "LATE").length;
  // F-20: weekends and holidays are not "tidak hadir" for past dates.
  const absent = computeAbsentCount({ selectedDate: date, today: TODAY_ISO, data, holidays });
  const leave = data.filter((d) => d.attendance?.status === "LEAVE").length;

  function openOverride(ea: EmployeeAttendance) {
    setOverrideTarget({
      recordId: ea.attendance?.id ?? null,
      employeeId: ea.employee.id,
      employeeName: ea.employee.nama,
      currentStatus: ea.attendance?.status ?? null,
    });
    setOverrideOpen(true);
  }

  const columns: ColumnDef<EmployeeAttendance>[] = [
    {
      id: "nama",
      accessorFn: (row) => row.employee.nama,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Karyawan" />
      ),
      cell: ({ row }) => {
        const ea = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-bold">{ea.employee.nama[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{ea.employee.nama}</p>
              <p className="text-xs text-muted-foreground">
                {ea.employee.kode} · {ea.employee.campusName}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "checkIn",
      accessorFn: (row) => row.attendance?.checkInTime,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Masuk" />
      ),
      cell: ({ row }) => (
        <span className="font-currency text-xs text-muted-foreground">
          {formatTime(row.original.attendance?.checkInTime ?? null)}
        </span>
      ),
    },
    {
      id: "checkOut",
      accessorFn: (row) => row.attendance?.checkOutTime,
      header: "Pulang",
      cell: ({ row }) => (
        <span className="font-currency text-xs text-muted-foreground">
          {formatTime(row.original.attendance?.checkOutTime ?? null)}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.attendance?.status ?? "ABSENT",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const ea = row.original;
        return ea.attendance ? (
          <StatusBadge status={ea.attendance.status} />
        ) : (
          <StatusBadge status="ABSENT" label="—" />
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        // AttendanceRecord is an event-log (Category C): no row Edit action.
        // Correction is an override (new canonical event), not an edit.
        <DataTableRowActions
          extraActions={[
            {
              label: "Timpa (Override)",
              icon: <Replace size={14} />,
              onClick: () => openOverride(row.original),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Kehadiran Hari Ini"
        description={formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/attendance/export?month=${new Date(date).getMonth() + 1}&year=${new Date(date).getFullYear()}`, "_blank")}>
              <Download size={14} className="mr-1.5" /> Ekspor CSV
            </Button>
            <Link href="/admin/attendance/monthly">
              <Button variant="outline" size="sm"><CalendarDays size={14} className="mr-1.5" /> Bulanan</Button>
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Select value={campusId} onValueChange={(v) => v && setCampusId(v)} items={{ all: "Semua Kampus", ...Object.fromEntries(campuses.map((c) => [c.id, c.name])) }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Semua Kampus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kampus</SelectItem>
            {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <StatsCardsRow cols={4}>
        <StatCard label="Hadir" value={present} icon={UserCheck} color="success" index={0} />
        <StatCard label="Terlambat" value={late} icon={Clock} color="warning" index={1} />
        <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={2} />
        <StatCard label="Izin" value={leave} icon={CalendarDays} color="primary" index={3} />
      </StatsCardsRow>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyTitle="Tidak ada data kehadiran"
        emptyDescription="Belum ada karyawan yang tercatat untuk tanggal ini."
      />

      {/* Override Modal */}
      {overrideTarget && (
        <OverrideModal
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          recordId={overrideTarget.recordId}
          employeeId={overrideTarget.employeeId}
          employeeName={overrideTarget.employeeName}
          date={date}
          currentStatus={overrideTarget.currentStatus}
          onSuccess={fetchData}
        />
      )}
    </>
  );
}
