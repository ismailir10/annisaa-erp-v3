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
import { weekStart, weekDates } from "@/lib/student-journal/week";
import {
  getJournalCellKey,
  applyJournalCellValue,
  shouldApplyJournalSaveResult,
  enqueuePerKey,
  type GridState,
} from "@/lib/student-journal/optimistic-save";

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
  const saveQueues = useRef<Record<string, Promise<void> | undefined>>({});
  const [pendingCells, setPendingCells] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  // Add-note dialog state + optimistic per-student note counter (resets each grid load)
  const [noteStudent, setNoteStudent] = useState<Student | null>(null);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const noteDialogOpen = noteStudent !== null;
  const noteWeekDates = useMemo(
    () => (date ? weekDates(weekStart(date)) : []),
    [date],
  );

  const loadGrid = useCallback(async () => {
    if (!classId || !date) return;
    setLoading(true);

    const res = await fetch(
      `/api/student-journal/class-grid?classSectionId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal memuat data kelas");
      setLoading(false);
      return;
    }

    const { data } = await res.json();
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
    saveQueues.current = {};
    setPendingCells(new Set());
    setGridState(initial);
    setLoading(false);
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
  async function saveSingleEntry(
    studentId: string,
    indicatorId: string,
    checked: boolean,
    previousChecked: boolean,
    cellKey: string,
    requestId: number,
  ) {
    try {
      const res = await fetch("/api/student-journal/entries/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classSectionId: classId,
          date,
          entries: [{ studentId, indicatorId, checked }],
        }),
      });

      if (!res.ok) {
        throw new Error("save_failed");
      }
    } catch {
      if (
        shouldApplyJournalSaveResult(latestSaveRequestIds.current, cellKey, requestId)
      ) {
        setGridStateNow(
          applyJournalCellValue(
            gridStateRef.current,
            studentId,
            indicatorId,
            previousChecked,
          ),
        );
        toast.error("Catatan belum tersimpan. Ketuk ulang ya.");
      }
    } finally {
      if (
        shouldApplyJournalSaveResult(latestSaveRequestIds.current, cellKey, requestId)
      ) {
        delete latestSaveRequestIds.current[cellKey];
        setCellPending(cellKey, false);
      }
    }
  }

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

    // Serialized per cell: guarantees the server receives this cell's writes
    // in tap order (the requestId guard alone only orders client display).
    void enqueuePerKey(saveQueues.current, cellKey, () =>
      saveSingleEntry(
        studentId,
        indicatorId,
        checked,
        previousChecked,
        cellKey,
        requestId,
      ),
    );
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
          title="Parameter tidak valid"
          description="Kembali ke halaman sebelumnya dan pilih kelas serta tanggal."
        />
      </div>
    );
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
