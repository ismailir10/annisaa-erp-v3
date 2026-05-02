"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassDayGrid } from "@/components/student-journal/class-day-grid";
import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";
import { Save, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/portal/page-header";
import { weekStart, weekDates } from "@/lib/student-journal/week";

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
  const [gridState, setGridState] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setGridState(initial);
    setLoading(false);
  }, [classId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGrid();
  }, [loadGrid]);

  function handleToggle(studentId: string, indicatorId: string) {
    setGridState((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {}),
        [indicatorId]: !(prev[studentId]?.[indicatorId] ?? false),
      },
    }));
  }

  async function handleSave() {
    setSaving(true);

    // Flatten state into entries array — only include entries that are checked
    // (unchecked = not ticked, still send them so batch can upsert false values too)
    const entries: { studentId: string; indicatorId: string; checked: boolean }[] = [];
    for (const [studentId, indicators] of Object.entries(gridState)) {
      for (const [indicatorId, checked] of Object.entries(indicators)) {
        entries.push({ studentId, indicatorId, checked });
      }
    }

    const res = await fetch("/api/student-journal/entries/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classSectionId: classId, date, entries }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal menyimpan");
      setSaving(false);
      return;
    }

    const { data } = await res.json();
    toast.success(`Catatan tersimpan · ${data.saved} entri`);
    setSaving(false);
  }

  const dateLabel = date
    ? formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  if (loading) {
    return (
      <div className="space-y-3 pb-32">
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
    <div className="pb-32">
      <PageHeader title="Isi Buku Penghubung" subtitle={dateLabel || undefined} />

      <ClassDayGrid
        students={students}
        categories={categories}
        state={gridState}
        onToggle={handleToggle}
        onAddNote={(s) => setNoteStudent(s)}
        noteCounts={noteCounts}
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

      {/* Sticky save bar — sits above PortalBottomNav (z-30, h≈65px). z-40 + bottom-16 prevents the BottomNav from covering the Simpan button (UAT 2026-05-01 blocker B1). */}
      <div className="fixed bottom-16 inset-x-0 z-40 bg-background border-t border-border px-page-x py-3">
        <div className="max-w-md mx-auto">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full"
            size="lg"
          >
            <Save size={16} className="mr-2" />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
