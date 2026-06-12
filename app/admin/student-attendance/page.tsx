"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import {
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
} from "@/components/admin/admin-tabs";
import {
  CalendarCheck,
  CalendarX,
  Download,
  Heart,
  Info,
  Pencil,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  student: { id: string; name: string; nickname: string | null };
  classSection: { id: string; name: string };
};

type ClassSection = { id: string; name: string };

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type RecapRow = {
  studentId: string;
  name: string;
  nickname: string | null;
  nis: string | null;
  classSectionId: string;
  className: string;
  present: number;
  absent: number;
  sick: number;
  permission: number;
  total: number;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "PRESENT", label: "Hadir" },
  { value: "ABSENT", label: "Tidak Hadir" },
  { value: "SICK", label: "Sakit" },
  { value: "PERMISSION", label: "Izin" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentAttendancePage() {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classSectionFilter, setClassSectionFilter] = useState("all");
  // Default both ends of the range to today so the table renders something on
  // first load (UAT 2026-05-12 admin m8 — blank dd/mm/yyyy placeholders left
  // the admin staring at a "Tidak ada catatan" empty state before they could
  // figure out the filter was required). Jakarta-tz helper, not toISOString —
  // the UTC split showed yesterday's date 00:00–06:59 WIB (2026-04-24 ADR).
  const [dateFrom, setDateFrom] = useState(() => getTodayInTimezone("Asia/Jakarta"));
  const [dateTo, setDateTo] = useState(() => getTodayInTimezone("Asia/Jakarta"));
  const [stats, setStats] = useState({ present: 0, absent: 0, sick: 0, permission: 0 });

  // Override dialog (Category C — event-log override, not a destructive edit)
  const [overrideTarget, setOverrideTarget] = useState<AttendanceRecord | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ status: "PRESENT", notes: "" });

  // Void confirm
  const [voidTarget, setVoidTarget] = useState<AttendanceRecord | null>(null);
  const [voiding, setVoiding] = useState(false);

  // ── Fetch class sections once ───────────────────────────────────
  useEffect(() => {
    fetch("/api/class-sections")
      .then((r) => r.json())
      .then((d) => setClassSections(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch stats (today's date range for context) ────────────────
  useEffect(() => {
    const today = getTodayInTimezone("Asia/Jakarta");
    fetch(`/api/student-attendance/stats?dateFrom=${today}&dateTo=${today}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.present !== undefined) setStats(data);
      })
      .catch(() => toast.error("Gagal memuat data"));
  }, []);

  // ── Fetch list ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode: "list",
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (classSectionFilter !== "all") params.set("classSectionId", classSectionFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/student-attendance?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal memuat data");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data kehadiran");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, classSectionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  function openOverride(r: AttendanceRecord) {
    setOverrideTarget(r);
    setOverrideForm({ status: r.status, notes: r.notes ?? "" });
  }

  async function handleOverride() {
    if (!overrideTarget) return;
    setOverriding(true);
    const res = await fetch(`/api/student-attendance/${overrideTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: overrideForm.status, notes: overrideForm.notes || null }),
    });
    if (res.ok) {
      toast.success("Kehadiran di-override");
      setOverrideTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal meng-override");
    }
    setOverriding(false);
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    const res = await fetch(`/api/student-attendance/${voidTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Record kehadiran dibatalkan");
      setVoidTarget(null);
      fetchData();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal membatalkan");
    }
    setVoiding(false);
  }

  // ── Columns ─────────────────────────────────────────────────────

  const columns: ColumnDef<AttendanceRecord>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tanggal" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{formatDate(row.original.date)}</span>
      ),
    },
    {
      id: "student",
      header: "Siswa",
      cell: ({ row }) => {
        const s = row.original.student;
        return (
          <div>
            <p className="text-sm font-medium">{s.name}</p>
            {s.nickname && (
              <p className="text-xs text-muted-foreground">{s.nickname}</p>
            )}
          </div>
        );
      },
    },
    {
      id: "class",
      header: "Kelas",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.classSection.name}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "notes",
      header: "Catatan",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
          {row.original.notes ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DataTableRowActions
          extraActions={[
            {
              label: "Override",
              icon: <Pencil size={14} />,
              onClick: () => openOverride(row.original),
            },
          ]}
          onVoid={() => setVoidTarget(row.original)}
        />
      ),
    },
  ];

  // ── Class section filter options ─────────────────────────────────
  const classSectionOptions = [
    { value: "all", label: "Semua Kelas" },
    ...classSections.map((c) => ({ value: c.id, label: c.name })),
  ];

  // ─────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Kehadiran Siswa"
        description={`${pagination.total} record`}
      />

      <StatsCardsRow cols={4}>
        <StatCard label="Hadir Hari Ini" value={stats.present} icon={CalendarCheck} color="success" index={0} />
        <StatCard label="Tidak Hadir" value={stats.absent} icon={CalendarX} color="error" index={1} />
        <StatCard label="Sakit" value={stats.sick} icon={Heart} color="warning" index={2} />
        <StatCard label="Izin" value={stats.permission} icon={Info} color="primary" index={3} />
      </StatsCardsRow>

      <AdminTabs defaultValue="harian">
        <AdminTabsList>
          <AdminTabsTrigger value="harian">Harian</AdminTabsTrigger>
          <AdminTabsTrigger value="rekap">Rekap Bulanan</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="harian">

      {/* Date range filters (outside DataTableToolbar since they're date inputs) */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Dari</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="h-9 w-40 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sampai</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="h-9 w-40 text-sm"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            Reset tanggal
          </Button>
        )}
      </div>

      <DataTableToolbar
        searchPlaceholder="Cari nama siswa..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: STATUS_OPTIONS,
          },
          {
            key: "classSection",
            label: "Kelas",
            value: classSectionFilter,
            onChange: (v) => {
              setClassSectionFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: classSectionOptions,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        onPageSizeChange={(pageSize) => setPagination((p) => ({ ...p, page: 1, pageSize }))}
        loading={loading}
        emptyTitle="Tidak ada catatan kehadiran"
        emptyDescription="Record kehadiran siswa akan tampil di sini setelah guru mencatat kehadiran."
      />

        </AdminTabsContent>

        <AdminTabsContent value="rekap">
          <RecapView classSections={classSections} />
        </AdminTabsContent>
      </AdminTabs>

      {/* ── Override dialog (Category C — event-log override) ─── */}
      <ResponsiveFormDialog
        open={!!overrideTarget}
        onOpenChange={(o) => { if (!overriding && !o) setOverrideTarget(null); }}
        title="Override Kehadiran"
        description={overrideTarget ? `${overrideTarget.student.name} — ${overrideTarget.date}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOverrideTarget(null)} disabled={overriding}>Batal</Button>
            <Button onClick={handleOverride} disabled={overriding}>
              {overriding ? "Menyimpan..." : "Simpan Override"}
            </Button>
          </>
        }
      >
        <Field>
          <FieldLabel>Status Kehadiran</FieldLabel>
          <Select
            value={overrideForm.status}
            onValueChange={(v) => setOverrideForm((f) => ({ ...f, status: v ?? f.status }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRESENT">Hadir</SelectItem>
              <SelectItem value="ABSENT">Tidak Hadir</SelectItem>
              <SelectItem value="SICK">Sakit</SelectItem>
              <SelectItem value="PERMISSION">Izin</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Catatan (opsional)</FieldLabel>
          <Textarea
            value={overrideForm.notes}
            onChange={(e) => setOverrideForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Catatan tambahan..."
            rows={2}
          />
        </Field>
      </ResponsiveFormDialog>

      {/* ── Void confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => { if (!o) setVoidTarget(null); }}
        title="Batalkan Record Kehadiran?"
        description={
          voidTarget
            ? `Record kehadiran ${voidTarget.student.name} pada ${voidTarget.date} akan dibatalkan dan tidak muncul di laporan.`
            : undefined
        }
        confirmLabel="Batalkan Record"
        destructive
        loading={voiding}
        onConfirm={handleVoid}
      />

    </>
  );
}

// ─── Rekap Bulanan ────────────────────────────────────────────────────────────

const recapColumns: ColumnDef<RecapRow>[] = [
  {
    id: "student",
    header: "Siswa",
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium">{row.original.name}</p>
        {row.original.nis && (
          <p className="text-xs text-muted-foreground">NIS {row.original.nis}</p>
        )}
      </div>
    ),
  },
  {
    id: "class",
    header: "Kelas",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.className}</span>
    ),
  },
  {
    accessorKey: "present",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Hadir" />,
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.present}</span>,
  },
  {
    accessorKey: "sick",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sakit" />,
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.sick}</span>,
  },
  {
    accessorKey: "permission",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Izin" />,
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.permission}</span>,
  },
  {
    accessorKey: "absent",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Alpa" />,
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.absent}</span>,
  },
  {
    accessorKey: "total",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Tercatat" />,
    cell: ({ row }) => (
      <span className="text-sm font-medium tabular-nums">{row.original.total}</span>
    ),
  },
];

function RecapView({ classSections }: { classSections: ClassSection[] }) {
  // <input type="month"> value: "YYYY-MM" — default to the current Jakarta month.
  const [month, setMonth] = useState(() =>
    getTodayInTimezone("Asia/Jakarta").slice(0, 7),
  );
  const [classFilter, setClassFilter] = useState("all");
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(true);

  const buildParams = useCallback(() => {
    const [y, m] = month.split("-");
    const params = new URLSearchParams({ month: m, year: y });
    if (classFilter !== "all") params.set("classSectionId", classFilter);
    return params;
  }, [month, classFilter]);

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/student-attendance/recap?${buildParams()}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Gagal memuat rekap");
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setRows(json.data ?? []);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Gagal memuat rekap");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, buildParams]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Bulan</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 w-44 text-sm"
          />
        </div>
        <Select value={classFilter} onValueChange={(v) => setClassFilter(v ?? "all")}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="Semua Kelas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kelas</SelectItem>
            {classSections.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 ml-auto"
          disabled={!month || loading || rows.length === 0}
          onClick={() => {
            window.open(`/api/student-attendance/export?${buildParams()}`, "_blank");
          }}
        >
          <Download size={14} className="mr-1" /> Ekspor CSV
        </Button>
      </div>

      <DataTable
        columns={recapColumns}
        data={rows}
        loading={loading}
        emptyTitle="Belum ada data rekap"
        emptyDescription="Rekap bulanan tampil setelah ada siswa terdaftar aktif. Pilih bulan lain atau periksa filter kelas."
      />
    </>
  );
}
