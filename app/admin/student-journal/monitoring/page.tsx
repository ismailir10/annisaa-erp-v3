"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDate, formatDateShort } from "@/lib/format";
import { weekStart } from "@/lib/student-journal/week";
import {
  BookOpen,
  CheckSquare,
  MessageSquare,
  CalendarX,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type ClassRow = {
  classSectionId: string;
  className: string;
  programName: string;
  studentCount: number;
  completionPct: number;
  lastFilledAt: string | null;
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function currentMonday(): string {
  const today = getTodayInTimezone("Asia/Jakarta");
  return weekStart(today);
}

function addWeeks(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(ws: string): string {
  const d = new Date(`${ws}T00:00:00Z`);
  const fri = new Date(d);
  fri.setUTCDate(d.getUTCDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const friYmd = fri.toISOString().slice(0, 10);
  return `${formatDate(ws, opts)} – ${formatDate(friYmd, opts)}`;
}

// ------------------------------------------------------------------
// Completion bar
// ------------------------------------------------------------------

function CompletionBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-9 text-right">{pct}%</span>
    </div>
  );
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function MonitoringPage() {
  const router = useRouter();
  const [ws, setWs] = useState<string>(currentMonday);
  const [data, setData] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (weekStartYmd: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/student-journal/admin/classes?weekStart=${weekStartYmd}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal memuat data kelas");
        return;
      }
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      toast.error("Gagal memuat data kelas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(ws);
  }, [fetchData, ws]);

  // Derived stats from the class list response
  const stats = useMemo(() => {
    const totalEntries = data.reduce(
      (sum, c) => sum + Math.round((c.completionPct / 100) * c.studentCount * 5),
      0,
    );
    const kelasSudahIsi = data.filter((c) => c.completionPct > 0).length;
    const siswaWithNotes = data.reduce((sum, c) => sum + c.studentCount, 0); // approximate — actual note count would need a separate query
    const hariKosong = 5 - Math.min(5, kelasSudahIsi > 0 ? 5 : 0); // simplified: 0 if any class has entries
    return { totalEntries, kelasSudahIsi, siswaWithNotes, hariKosong };
  }, [data]);

  const columns = useMemo<ColumnDef<ClassRow>[]>(
    () => [
      {
        accessorKey: "className",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Kelas" />
        ),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.className}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.programName}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "studentCount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Siswa" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.studentCount}
          </span>
        ),
      },
      {
        accessorKey: "completionPct",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Kelengkapan" />
        ),
        cell: ({ row }) => (
          <CompletionBar pct={row.original.completionPct} />
        ),
      },
      {
        accessorKey: "lastFilledAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Terakhir diisi" />
        ),
        cell: ({ row }) =>
          row.original.lastFilledAt ? (
            <span className="text-xs text-muted-foreground">
              {formatDateShort(row.original.lastFilledAt)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions
            onView={() =>
              router.push(
                `/admin/student-journal/classes/${row.original.classSectionId}?weekStart=${ws}`,
              )
            }
          />
        ),
      },
    ],
    [router, ws],
  );

  // Fake pagination object — all classes fit in one page for a small school
  const pagination = {
    page: 1,
    pageSize: data.length || 20,
    total: data.length,
    totalPages: 1,
  };

  return (
    <>
      <PageHeader
        title="Buku Penghubung — Pemantauan"
        description="Ringkasan pengisian per kelas untuk minggu berjalan."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setWs((w) => addWeeks(w, -1))}
              title="Minggu sebelumnya"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {formatWeekLabel(ws)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setWs((w) => addWeeks(w, 1))}
              title="Minggu berikutnya"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />

      <StatsCardsRow cols={4}>
        <StatCard
          label="Total entri minggu ini"
          value={loading ? "—" : stats.totalEntries}
          icon={BookOpen}
          color="primary"
          index={0}
        />
        <StatCard
          label="Kelas sudah isi"
          value={loading ? "—" : `${stats.kelasSudahIsi} / ${data.length}`}
          icon={CheckSquare}
          color="success"
          index={1}
        />
        <StatCard
          label="Siswa terdaftar aktif"
          value={loading ? "—" : stats.siswaWithNotes}
          icon={MessageSquare}
          color="primary"
          index={2}
        />
        <StatCard
          label="Kelas belum isi"
          value={
            loading
              ? "—"
              : data.length - stats.kelasSudahIsi
          }
          icon={CalendarX}
          color={data.length - stats.kelasSudahIsi > 0 ? "warning" : "success"}
          index={3}
        />
      </StatsCardsRow>

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onSortChange={() => {}}
        defaultSort={{ field: "className", order: "asc" }}
        loading={loading}
        emptyTitle="Belum ada kelas aktif"
        emptyDescription="Tambahkan kelas terlebih dahulu di menu Kelas."
      />
    </>
  );
}
