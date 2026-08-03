"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekGrid } from "@/components/portal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";
import { ChevronLeft, ChevronRight, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { weekStart } from "@/lib/student-journal/week";
import { JOURNAL_FORBIDDEN_MSG } from "@/lib/student-journal/messages";
import { formatDate } from "@/lib/format";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { computeDefaultNoteDate } from "./note-date";

type Indicator = { id: string; label: string; order: number };
type Category = { id: string; name: string; scope: string; indicators: Indicator[] };
type Entry = {
  id?: string;
  indicatorId: string;
  date: string;
  checked: boolean;
  lastAdminEdit?: { changedAt: string; changedByName: string } | null;
};
type Note = {
  id: string;
  date: string;
  authorRole: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
};

type WeekData = {
  weekStart: string;
  dates: string[];
  categories: Category[];
  entries: Entry[];
  notes: Note[];
};

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStartYmd: string, dates: string[]): string {
  if (dates.length === 0) return "";
  const start = formatDate(dates[0], { day: "numeric", month: "short" });
  const end = formatDate(dates[dates.length - 1], { day: "numeric", month: "short" });
  return `${start} – ${end}`;
}

export default function TeacherStudentWeekPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = getTodayInTimezone("Asia/Jakarta");
  // Honor `?week=YYYY-MM-DD` from the entry-grid chevron so the week view
  // opens scoped to the picker's selected date (UAT 2026-05-01 cycle T2).
  const initialAnchor = searchParams.get("week") ?? today;
  const [ws, setWs] = useState<string>(() => weekStart(initialAnchor));
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  // Add-note dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(today);

  const loadWeek = useCallback(async (weekStartYmd: string) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/student-journal/students/${studentId}/week?weekStart=${weekStartYmd}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        // Prefer server JSON body; fall back to the Indonesian remediation copy on 403
        // (UAT 2026-05-01 — raw "Forbidden" toast was unhelpful to Bu Sari).
        const fallback = res.status === 403 ? JOURNAL_FORBIDDEN_MSG : "Gagal memuat data";
        throw new Error((err as { error?: string }).error || fallback);
      }
      const json = await res.json();
      if (requestId !== loadRequestId.current) return;
      setData(json.data);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      const message = error instanceof Error ? error.message : "Gagal memuat data";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek(ws);
  }, [loadWeek, ws]);

  function prevWeek() {
    setWs((prev) => addDays(prev, -7));
  }

  function nextWeek() {
    setWs((prev) => addDays(prev, 7));
  }

  const weekLabel = data ? formatWeekLabel(data.weekStart, data.dates) : "";

  return (
    <div>
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push("/teacher/student-journal")}
        className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground mb-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft size={16} />
        Kembali
      </button>

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevWeek}
          className="grid min-h-11 min-w-11 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Minggu sebelumnya"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Minggu ini</p>
          <p className="text-sm font-semibold">{weekLabel || ws}</p>
        </div>
        <button
          type="button"
          onClick={nextWeek}
          className="grid min-h-11 min-w-11 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Minggu berikutnya"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : loadError ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-foreground">Data penghubung tidak bisa dimuat</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError}. Coba lagi sebentar ya.</p>
          <Button className="mt-4" variant="outline" onClick={() => loadWeek(ws)}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Riwayat penghubung (hanya-baca)
          </p>
          <WeekGrid
            categories={data?.categories ?? []}
            entries={data?.entries ?? []}
            dates={data?.dates ?? []}
          />

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-h2 font-semibold">Catatan</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNoteDate(computeDefaultNoteDate(ws, today));
                  setDialogOpen(true);
                }}
              >
                <Plus size={14} className="mr-1" />
                Tambah Catatan
              </Button>
            </div>
            <NoteThread notes={data?.notes ?? []} />
          </div>
        </>
      )}

      <NoteComposeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        studentId={studentId}
        weekDates={data?.dates ?? [noteDate]}
        initialDate={noteDate}
        title="Tambah Catatan"
        placeholder="Tulis catatan di sini..."
        onSaved={() => {
          setDialogOpen(false);
          setNoteDate(computeDefaultNoteDate(ws, today));
          loadWeek(ws);
        }}
      />
    </div>
  );
}
