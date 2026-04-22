"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { WeekGrid } from "@/components/student-journal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { ChevronLeft, ChevronRight, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { weekStart } from "@/lib/student-journal/week";
import { formatDate } from "@/lib/format";

type Indicator = { id: string; label: string; order: number };
type Category = { id: string; name: string; scope: string; indicators: Indicator[] };
type Entry = { id?: string; indicatorId: string; date: string; checked: boolean };
type Note = { id: string; date: string; authorRole: string; body: string; createdAt: string };

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

  const today = new Date().toISOString().slice(0, 10);
  const [ws, setWs] = useState<string>(() => weekStart(today));
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);

  // Add-note dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteDate, setNoteDate] = useState(today);
  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);

  const loadWeek = useCallback(async (weekStartYmd: string) => {
    setLoading(true);
    const res = await fetch(
      `/api/student-journal/students/${studentId}/week?weekStart=${weekStartYmd}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal memuat data");
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

  async function handleSaveNote() {
    if (!noteBody.trim()) {
      toast.error("Tulis isi catatan dulu ya.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/student-journal/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, date: noteDate, body: noteBody.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal menyimpan");
      setSaving(false);
      return;
    }
    toast.success("Catatan tersimpan");
    setSaving(false);
    setDialogOpen(false);
    setNoteBody("");
    setNoteDate(today);
    loadWeek(ws);
  }

  const weekLabel = data ? formatWeekLabel(data.weekStart, data.dates) : "";

  return (
    <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
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
              setNoteDate(today);
              setNoteBody("");
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

      {/* Add-note dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Tambah Catatan</DialogTitle>
          </DialogHeader>

          <div className="space-y-field py-2">
            <Field>
              <FieldLabel>Tanggal</FieldLabel>
              <Input
                type="date"
                value={noteDate}
                max={today}
                onChange={(e) => setNoteDate(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel>Isi</FieldLabel>
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Tulis catatan di sini..."
              />
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={handleSaveNote} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
