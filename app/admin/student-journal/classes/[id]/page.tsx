"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import Link from "next/link";
import { weekStart } from "@/lib/student-journal/week";
import { formatDate } from "@/lib/format";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye } from "lucide-react";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type StudentRow = {
  studentId: string;
  name: string;
  checkedCount: number;
  totalCells: number;
};

type RollUpData = {
  weekStart: string;
  dates: string[];
  students: StudentRow[];
};

type ClassInfo = {
  className: string;
  programName: string;
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function currentMonday(): string {
  const today = new Date().toISOString().slice(0, 10);
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

function CompletionBar({
  checked,
  total,
}: {
  checked: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {checked}/{total}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function ClassWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: classSectionId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [ws, setWs] = useState<string>(() => {
    const p = searchParams.get("weekStart");
    return p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : currentMonday();
  });

  const [rollUp, setRollUp] = useState<RollUpData | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRollUp = useCallback(
    async (weekStartYmd: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/student-journal/admin/class-roll-up?classSectionId=${classSectionId}&weekStart=${weekStartYmd}`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Gagal memuat data kelas");
          return;
        }
        const json = await res.json();
        setRollUp(json.data ?? null);
      } catch {
        toast.error("Gagal memuat data kelas");
      } finally {
        setLoading(false);
      }
    },
    [classSectionId],
  );

  // Fetch class info from the classes list endpoint for the header
  useEffect(() => {
    fetch(`/api/student-journal/admin/classes?weekStart=${ws}`)
      .then((r) => r.json())
      .then((json) => {
        const row = (json.data ?? []).find(
          (c: { classSectionId: string; className: string; programName: string }) =>
            c.classSectionId === classSectionId,
        );
        if (row) {
          setClassInfo({ className: row.className, programName: row.programName });
        }
      })
      // Silent: optional header-label populate; primary data load has its own toast.error path.
      .catch(() => {});
  }, [classSectionId, ws]);

  useEffect(() => {
    fetchRollUp(ws);
  }, [fetchRollUp, ws]);

  const handleWeekChange = (delta: number) => {
    const newWs = addWeeks(ws, delta);
    setWs(newWs);
    router.replace(
      `/admin/student-journal/classes/${classSectionId}?weekStart=${newWs}`,
      { scroll: false },
    );
  };

  const headerTitle = classInfo
    ? `${classInfo.className} — ${classInfo.programName}`
    : "Detail Kelas";

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/student-journal/monitoring"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Kembali ke Pemantauan
        </Link>
      </div>

      <PageHeader
        title={headerTitle}
        description="Rekap kelengkapan pengisian Buku Penghubung per siswa."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleWeekChange(-1)}
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
              onClick={() => handleWeekChange(1)}
              title="Minggu berikutnya"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 border-b border-border bg-muted/30">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Siswa
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[140px]">
            Kelengkapan
          </span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[60px]">
            Aksi
          </span>
        </div>

        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center"
              >
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : !rollUp || rollUp.students.length === 0 ? (
          <EmptyState title="Belum ada siswa aktif di kelas ini" />
        ) : (
          <div className="divide-y divide-border/50">
            {rollUp.students.map((student) => (
              <div
                key={student.studentId}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{student.name}</p>
                </div>
                <CompletionBar
                  checked={student.checkedCount}
                  total={student.totalCells}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() =>
                    router.push(
                      `/admin/student-journal/students/${student.studentId}?weekStart=${ws}`,
                    )
                  }
                >
                  <Eye size={14} className="mr-1" />
                  <span className="text-xs">Lihat</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        {rollUp && rollUp.students.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              {rollUp.students.length} siswa aktif
            </p>
          </div>
        )}
      </div>
    </>
  );
}
