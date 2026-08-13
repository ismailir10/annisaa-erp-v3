"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassDayGrid } from "@/components/student-journal/class-day-grid";
import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/portal/page-header";
import { Button } from "@/components/ui/button";
import { weekStart, weekDates } from "@/lib/student-journal/week";
import {
  getJournalCellKey,
  applyJournalCellValue,
  shouldApplyJournalSaveResult,
  type GridState,
} from "@/lib/student-journal/optimistic-save";
import {
  JournalWriteCoalescer,
  type FlushBatch,
} from "@/lib/student-journal/coalesce-writes";

type Student = {
  id: string;
  name: string;
  nickname: string | null;
};

type Indicator = {
  id: string;
  label: string;
  order: number;
};

type Category = {
  id: string;
  name: string;
  order: number;
  indicators: Indicator[];
};

type EntryRow = {
  id: string;
  studentId: string;
  indicatorId: string;
  checked: boolean;
};

export default function StudentJournalEntryPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get("classId") ?? "";
  const date = searchParams.get("date") ?? "";

  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  /** state[studentId][indicatorId] = checked */
  const [gridState, setGridState] = useState<GridState>({});
  const gridStateRef = useRef<GridState>({});
  const latestSaveRequestIds = useRef<Record<string, number | undefined>>({});
  const coalescerRef = useRef<JournalWriteCoalescer | null>(null);
  const [pendingCells, setPendingCells] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadRequestId = useRef(0);

  // Add-note dialog state + optimistic per-student note counter (resets each grid load)
  const [noteStudent, setNoteStudent] = useState<Student | null>(null);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const noteDialogOpen = noteStudent !== null;
  const noteWeekDates = useMemo(
    () => (date ? weekDates(weekStart(date)) : []),
    [date],
  );

  const loadGrid = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!classId || !date) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
    const res = await fetch(
      `/api/student-journal/class-grid?classSectionId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
    );
    if (requestId !== loadRequestId.current) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (requestId !== loadRequestId.current) return;
      toast.error(err.error || "Gagal memuat data kelas");
      setLoadError(true); setLoading(false);
      return;
    }

    const { data } = await res.json();
    if (requestId !== loadRequestId.current) return;
    const loadedStudents: Student[] = data.students;
    const loadedCategories: Category[] = data.categories;
    const loadedEntries: EntryRow[] = data.entries;

    setStudents(loadedStudents);
    setCategories(loadedCategories);

    // Build initial grid state from pre-filled entries
    const initial: Record<string, Record<string, boolean>> = {};
    for (const student of loadedStudents) {
      initial[student.id] = {};
    }
    for (const entry of loadedEntries) {
      if (!initial[entry.studentId]) initial[entry.studentId] = {};
      initial[entry.studentId][entry.indicatorId] = entry.checked;
    }
    gridStateRef.current = initial;
    latestSaveRequestIds.current = {};
    setPendingCells(new Set());
    setGridState(initial);
    setLoading(false);
    } catch {
      if (requestId !== loadRequestId.current) return;
      setLoadError(true);
      toast.error("Gagal memuat data kelas. Coba lagi sebentar ya.");
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGrid();
  }, [loadGrid]);

  function setGridStateNow(next: GridState) {
    gridStateRef.current = next;
    setGridState(next);
  }

  function setCellPending(cellKey: string, pending: boolean) {
    setPendingCells((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(cellKey);
      } else {
        next.delete(cellKey);
      }
      return next;
    });
  }

  // Deliberately NOT aborted on unmount: an in-flight save finishing after the
  // teacher navigates away is exactly what makes taps survive navigation (T8).
  // Post-unmount setState calls are harmless no-ops in React 18+.
  const flushBatch = useCallback(
    async (batch: FlushBatch) => {
      let failed = false;
      try {
        const res = await fetch("/api/student-journal/entries/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classSectionId: classId,
            date,
            entries: batch.entries,
          }),
        });
        if (!res.ok) failed = true;
      } catch {
        failed = true;
      }

      // Roll back every cell this flush carried, skipping any the teacher has
      // retapped since — that newer tap owns the cell now and is already
      // buffered for the next flush.
      if (failed) {
        let next = gridStateRef.current;
        let rolledBack = false;
        for (const [cellKey, w] of batch.writes) {
          if (
            !shouldApplyJournalSaveResult(
              latestSaveRequestIds.current,
              cellKey,
              w.requestId,
            )
          ) {
            continue;
          }
          next = applyJournalCellValue(
            next,
            w.studentId,
            w.indicatorId,
            w.previousChecked,
          );
          rolledBack = true;
        }
        if (rolledBack) {
          setGridStateNow(next);
          // One toast for the batch, not one per cell.
          toast.error("Catatan belum tersimpan. Ketuk ulang ya.");
        }
      }

      for (const [cellKey, w] of batch.writes) {
        if (
          shouldApplyJournalSaveResult(
            latestSaveRequestIds.current,
            cellKey,
            w.requestId,
          )
        ) {
          delete latestSaveRequestIds.current[cellKey];
          setCellPending(cellKey, false);
        }
      }
    },
    [classId, date],
  );

  // One coalescer per class-day. Rebuilding it on a date change would strand
  // buffered taps, so flush the old one first.
  useEffect(() => {
    const previous = coalescerRef.current;
    if (previous?.hasPending) void previous.flushNow();
    coalescerRef.current = new JournalWriteCoalescer(flushBatch);
    return () => {
      const c = coalescerRef.current;
      if (c?.hasPending) void c.flushNow();
    };
  }, [flushBatch]);

  function handleToggle(studentId: string, indicatorId: string) {
    const previousChecked = gridStateRef.current[studentId]?.[indicatorId] ?? false;
    const checked = !previousChecked;
    const cellKey = getJournalCellKey(studentId, indicatorId);
    const requestId = (latestSaveRequestIds.current[cellKey] ?? 0) + 1;

    latestSaveRequestIds.current[cellKey] = requestId;
    setCellPending(cellKey, true);
    setGridStateNow(
      applyJournalCellValue(gridStateRef.current, studentId, indicatorId, checked),
    );

    // Buffered, not posted: a burst of taps folds into one batch request.
    // Display stays immediate — only the network call is deferred.
    coalescerRef.current?.add({
      studentId,
      indicatorId,
      checked,
      previousChecked,
      requestId,
    });
  }

  const dateLabel = date
    ? formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-56 rounded-md" />
        <Skeleton className="h-4 w-36 rounded-md" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!classId || !date) {
    return (
      <div>
        <EmptyState
          icon={Users}
          title="Kelas dan tanggal belum dipilih"
          description="Pilih kelas dan tanggal terlebih dahulu untuk mengisi penghubung."
          actionLabel="Pilih kelas dan tanggal"
          actionHref="/teacher/student-journal"
        />
      </div>
    );
  }

  if (loadError) {
    return <div className="space-y-4"><EmptyState icon={Users} title="Data kelas tidak bisa dimuat" description="Periksa koneksi, lalu coba lagi." /><div className="text-center"><Button variant="outline" onClick={loadGrid}>Coba lagi</Button></div></div>;
  }

  if (students.length === 0) {
    return (
      <div>
        <EmptyState
          icon={Users}
          title="Belum ada siswa di kelas ini"
          description="Minta admin untuk mendaftarkan siswa ke kelas ini."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Isi Buku Penghubung" subtitle={dateLabel || undefined} />

      <ClassDayGrid
        students={students}
        categories={categories}
        state={gridState}
        onToggle={handleToggle}
        onAddNote={(s) => setNoteStudent(s)}
        noteCounts={noteCounts}
        pendingCells={pendingCells}
        visibleDate={date}
      />

      {noteStudent && (
        <NoteComposeDialog
          open={noteDialogOpen}
          onOpenChange={(o) => {
            if (!o) setNoteStudent(null);
          }}
          mode="create"
          studentId={noteStudent.id}
          weekDates={noteWeekDates}
          initialDate={date}
          title={`Tulis Catatan untuk ${noteStudent.name}`}
          placeholder={`Tulis catatan untuk ${noteStudent.name}…`}
          onSaved={() => {
            setNoteCounts((prev) => ({
              ...prev,
              [noteStudent.id]: (prev[noteStudent.id] ?? 0) + 1,
            }));
            setNoteStudent(null);
          }}
        />
      )}

    </div>
  );
}
