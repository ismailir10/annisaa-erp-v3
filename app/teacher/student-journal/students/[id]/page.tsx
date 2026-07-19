"use client";

import { useEffect, useState, useCallback } from "react";
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

  // Add-note dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(today);

  const loadWeek = useCallback(async (weekStartYmd: string) => {
    setLoading(true);
    const res = await fetch(
      `/api/student-journal/students/${studentId}/week?weekStart=${weekStartYmd}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }));
      // Prefer server JSON body; fall back to the Indonesian remediation copy on 403
      // (UAT 2026-05-01 — raw "Forbidden" toast was unhelpful to Bu Sari).
      const fallback = res.status === 403 ? JOURNAL_FORBIDDEN_MSG : "Gagal memuat data";
      toast.error((err as { error?: string }).error || fallback);
      setLoading(false);
      return;
    }
    const json = await res.json();
    setData(json.data);
    setLoading(false);
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
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        Kembali
      </button>

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevWeek}
          className="p-2 rounded-md hover:bg-muted transition-colors"
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
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label="Minggu berikutnya"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week grid */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <WeekGrid
          categories={data?.categories ?? []}
          entries={data?.entries ?? []}
          dates={data?.dates ?? []}
        />
      )}

      {/* Notes section */}
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

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : (
          <NoteThread notes={data?.notes ?? []} />
        )}
      </div>

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
