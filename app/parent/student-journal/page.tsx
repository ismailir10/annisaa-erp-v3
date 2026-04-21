"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, BookHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WeekGrid } from "@/components/student-journal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { weekStart, weekDates } from "@/lib/student-journal/week";
import { formatDateShort } from "@/lib/format";

// ── Types ────────────────────────────────────────────────────────

type Child = {
  id: string;
  name: string;
  nickname: string | null;
  className: string | null;
};

type Indicator = { id: string; label: string; order: number };
type Category = { id: string; name: string; scope: string; indicators: Indicator[] };
type Entry = { id?: string; indicatorId: string; date: string; checked: boolean };
type Note = { id: string; date: string; authorRole: string; body: string; createdAt: string };

type WeekData = {
  weekStart: string;
  dates: string[];
  schoolCategories: Category[];
  homeCategories: Category[];
  schoolEntries: Entry[];
  homeEntries: Entry[];
  notes: Note[];
};

// ── Helpers ──────────────────────────────────────────────────────

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  return `${formatDateShort(dates[0])} – ${formatDateShort(dates[dates.length - 1])}`;
}

// ── Component ─────────────────────────────────────────────────────

export default function ParentStudentJournalPage() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return weekStart(today);
  });
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load children on mount
  useEffect(() => {
    fetch("/api/parent/children")
      .then((r) => r.json())
      .then((json: { data?: Child[]; error?: string }) => {
        if (json.data && json.data.length > 0) {
          setChildren(json.data);
          setChildId(json.data[0].id);
        } else {
          setChildren([]);
        }
      })
      .catch(() => {
        toast.error("Gagal memuat data anak");
        setChildren([]);
      });
  }, []);

  // Load week data when child or week changes
  const loadWeekData = useCallback(
    async (cid: string, ws: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/student-journal/children/${cid}/week?weekStart=${ws}`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error((err as { error?: string }).error ?? "Gagal memuat data jurnal");
          return;
        }
        const json = await res.json() as { data: WeekData };
        setData(json.data);
      } catch {
        toast.error("Gagal memuat data jurnal");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (childId) {
      loadWeekData(childId, currentWeek);
    }
  }, [childId, currentWeek, loadWeekData]);

  const handlePrevWeek = () => setCurrentWeek((w) => addDays(w, -7));
  const handleNextWeek = () => setCurrentWeek((w) => addDays(w, 7));

  // ── Loading state ────────────────────────────────────────────────
  if (children === null) {
    return (
      <div className="max-w-md mx-auto p-4 pb-24 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="max-w-md mx-auto p-4 pb-24 flex flex-col items-center justify-center py-16 gap-3">
        <BookHeart size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Belum ada data anak. Hubungi admin sekolah untuk menghubungkan akun Anda.
        </p>
      </div>
    );
  }

  const selectedChild = children.find((c) => c.id === childId) ?? children[0];
  const dates = data?.dates ?? weekDates(currentWeek);

  return (
    <div className="max-w-md mx-auto p-4 pb-24 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BookHeart size={20} className="text-primary" />
          Buku Penghubung
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pantau kegiatan harian di sekolah dan rumah
        </p>
      </div>

      {/* Child selector (only shown when 2+ children) */}
      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChildId(c.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                c.id === childId
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground"
              }`}
            >
              {c.nickname ?? c.name}
            </button>
          ))}
        </div>
      )}

      {/* Child info */}
      <div className="text-sm font-medium text-foreground">
        {selectedChild.name}
        {selectedChild.className && (
          <span className="text-xs text-muted-foreground font-normal ml-1.5">
            ({selectedChild.className})
          </span>
        )}
      </div>

      {/* Week picker */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrevWeek}
          aria-label="Minggu sebelumnya"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-xs font-medium text-foreground">
          {weekLabel(dates)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleNextWeek}
          aria-label="Minggu berikutnya"
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Main content */}
      {loading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="school">
          <TabsList className="w-full">
            <TabsTrigger value="school" className="flex-1">
              Di Sekolah
            </TabsTrigger>
            <TabsTrigger value="home" className="flex-1">
              Di Rumah
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Catatan
            </TabsTrigger>
          </TabsList>

          {/* Sekolah tab — read-only */}
          <TabsContent value="school" className="mt-3">
            <WeekGrid
              categories={data.schoolCategories}
              entries={data.schoolEntries}
              dates={data.dates}
            />
          </TabsContent>

          {/* Rumah tab — editable */}
          <TabsContent value="home" className="mt-3">
            <WeekGrid
              categories={data.homeCategories}
              entries={data.homeEntries}
              dates={data.dates}
              editable
              onToggle={async (indicatorId, date, next) => {
                const res = await fetch("/api/student-journal/entries/home", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    studentId: childId,
                    date,
                    entries: [{ indicatorId, checked: next }],
                  }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  toast.error((err as { error?: string }).error ?? "Gagal menyimpan");
                  return;
                }
                // Refresh week data so the cell reflects the server state
                if (childId) {
                  const refreshed = await fetch(
                    `/api/student-journal/children/${childId}/week?weekStart=${currentWeek}`,
                  );
                  if (refreshed.ok) {
                    const json = await refreshed.json() as { data: WeekData };
                    setData(json.data);
                  }
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Isi kalau sempat. Opsional.
            </p>
          </TabsContent>

          {/* Catatan tab — read-only thread */}
          <TabsContent value="notes" className="mt-3">
            <NoteThread notes={data.notes} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
