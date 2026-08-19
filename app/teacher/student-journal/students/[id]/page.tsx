"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekGrid } from "@/components/portal/week-grid";
import { WeekNavigator } from "@/components/portal/week-navigator";
import { BackLink } from "@/components/portal/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { NoteThread } from "@/components/student-journal/note-thread";
import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";
import { ApiError, userMessage } from "@/lib/api/client-errors";
import { BookHeart, Plus } from "lucide-react";
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
        throw new ApiError((err as { error?: string }).error || fallback);
      }
      const json = await res.json();
      if (requestId !== loadRequestId.current) return;
      setData(json.data);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      const message = userMessage(error, "Gagal memuat data");
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
  const isCurrentWeek = ws === weekStart(today);

  return (
    <div>
      <BackLink href="/teacher/student-journal" className="mb-4" />

      {/*
        Was a hand-rolled navigator with "Minggu sebelumnya"/"Minggu berikutnya"
        labels and a static "Minggu ini" caption above the range — so a teacher
        paging back three weeks still read "this week". Shared control now, and
        the caption is derived instead of asserted.
      */}
      <WeekNavigator
        className="mb-4"
        label={
          weekLabel
            ? isCurrentWeek
              ? `${weekLabel} · pekan ini`
              : weekLabel
            : ws
        }
        onPrev={prevWeek}
        onNext={nextWeek}
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : loadError ? (
        <EmptyState
          icon={BookHeart}
          title="Data penghubung tidak bisa dimuat"
          // `loadError` already ends in a period, so the old
          // "{loadError}. Coba lagi" rendered "…kelas aktif.. Coba lagi".
          description={loadError.replace(/\.$/, "")}
          actionLabel="Coba lagi"
          onAction={() => loadWeek(ws)}
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Riwayat penghubung — hanya bisa dilihat di sini
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
                className="tap-target"
                onClick={() => {
                  setNoteDate(computeDefaultNoteDate(ws, today));
                  setDialogOpen(true);
                }}
              >
                <Plus size={14} className="mr-1" aria-hidden="true" />
                Tambah catatan
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
        title="Tambah catatan"
        placeholder="Tulis catatan di sini…"
        onSaved={() => {
          setDialogOpen(false);
          setNoteDate(computeDefaultNoteDate(ws, today));
          loadWeek(ws);
        }}
      />
    </div>
  );
}
