"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassDayGrid } from "@/components/student-journal/class-day-grid";
import { Save, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

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
    toast.success(`Tersimpan — ${data.saved} entri`);
    setSaving(false);
  }

  const dateLabel = date
    ? formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  if (loading) {
    return (
      <div className="px-5 pt-6 space-y-3 pb-32">
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
      <div className="px-5 pt-6">
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
      <div className="px-5 pt-6">
        <EmptyState
          icon={Users}
          title="Belum ada siswa di kelas ini"
          description="Minta admin untuk mendaftarkan siswa ke kelas ini."
        />
      </div>
    );
  }

  return (
    <div className="px-5 pt-5 pb-32">
      <h1 className="text-base font-bold mb-0.5">Isi Buku Penghubung</h1>
      {dateLabel && (
        <p className="text-xs text-muted-foreground mb-4">{dateLabel}</p>
      )}

      <ClassDayGrid
        students={students}
        categories={categories}
        state={gridState}
        onToggle={handleToggle}
      />

      {/* Sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 safe-area-bottom bg-background border-t border-border px-5 py-3">
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
