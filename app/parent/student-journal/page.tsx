"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { BookHeart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PortalTabs } from "@/components/portal/portal-tabs";
import { PageHeader } from "@/components/portal/page-header";
import { WeekNavigator } from "@/components/portal/week-navigator";
import { WeekGrid } from "@/components/portal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { NoteComposeDialog } from "@/components/student-journal/note-compose-dialog";
import { weekStart, weekDates } from "@/lib/student-journal/week";
import { homeEntryEditFloor } from "@/lib/student-journal/backfill";
import { formatWeekRangeLabel } from "@/lib/format";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

// ── Types ────────────────────────────────────────────────────────

type Child = {
  id: string;
  name: string;
  nickname: string | null;
  className: string | null;
};

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
  return formatWeekRangeLabel(dates[0], dates[dates.length - 1]);
}

/**
 * `?week=` is trusted only as far as "is this a real calendar date" — anything
 * else falls back to the current week rather than 400-ing at the reader. The
 * value is snapped to its Monday so a link to any day of a week opens that week.
 */
function resolveWeekParam(raw: string | null, todayYmd: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) {
      return weekStart(raw);
    }
  }
  return weekStart(todayYmd);
}

// ── Component ─────────────────────────────────────────────────────

type TabView = "school" | "home" | "notes";
const VALID_VIEWS: readonly TabView[] = ["school", "home", "notes"] as const;

function isValidView(v: string | null | undefined): v is TabView {
  return v != null && (VALID_VIEWS as readonly string[]).includes(v);
}

export default function ParentStudentJournalPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active tab persisted in URL (UAT 2026-05-01 cycle T5) — without this the
  // tab resets to "Sekolah" on every Catatan create/delete because the
  // re-render reseeds defaultValue. URL keeps the user where they were.
  const viewParam = searchParams.get("view");
  const activeView: TabView = isValidView(viewParam) ? viewParam : "school";

  const setActiveView = useCallback(
    (next: string) => {
      if (!isValidView(next)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "school") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  // The viewed week lives in the URL, like the tab above it. Held in component
  // state it did not survive a reload, a back-button press, or a link pasted to
  // another wali — every one of those silently snapped back to this week, which
  // is the opposite of what a parent chasing last week's catatan wants.
  const today = getTodayInTimezone("Asia/Jakarta");
  const thisWeek = weekStart(today);
  const currentWeek = resolveWeekParam(searchParams.get("week"), today);
  const isCurrentWeek = currentWeek === thisWeek;

  const setCurrentWeek = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === thisWeek) {
        params.delete("week");
      } else {
        params.set("week", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, thisWeek],
  );
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; noteId: string; date: string; body: string }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load current session id (for own-note edit/delete affordance)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { id?: string } | null) => {
        if (json?.id) setCurrentUserId(json.id);
      })
      .catch(() => {
        // Non-fatal; edit/delete affordance simply won't render.
      });
  }, []);

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
        toast.error("Data anak belum bisa dimuat. Coba lagi sebentar ya.");
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
          toast.error((err as { error?: string }).error ?? "Jurnal belum bisa dimuat. Coba lagi sebentar ya.");
          return;
        }
        const json = await res.json() as { data: WeekData };
        setData(json.data);
      } catch {
        toast.error("Jurnal belum bisa dimuat. Coba lagi sebentar ya.");
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

  const handlePrevWeek = () => setCurrentWeek(addDays(currentWeek, -7));
  const handleNextWeek = () => setCurrentWeek(addDays(currentWeek, 7));

  // ── Loading state ────────────────────────────────────────────────
  if (children === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <EmptyState
        accent="warm"
        icon={BookHeart}
        title="Belum ada data anak"
        description="Hubungi admin sekolah untuk menautkan akun Anda."
      />
    );
  }

  const dates = data?.dates ?? weekDates(currentWeek);
  // Anchored to TODAY's week, not `currentWeek` (the week the parent is
  // currently viewing) — a wali who navigates back four weeks must still see
  // every cell there locked. `homeEntryEditFloor` is the same helper the
  // server route enforces against, so client and server never disagree.
  const homeEditFloor = homeEntryEditFloor(today);

  return (
    <div className="space-y-6">
      {/*
        Child switcher sits ABOVE the title and shows first names only, matching
        Tagihan / Kehadiran / Rapor. It used to sit below the title with full
        names ("Hafizh Umar Ramadhan"), and the full name was then repeated on
        its own line underneath — three different presentations of one child on
        one screen.
      */}
      {children.length > 1 && (
        <PortalTabs
          items={children.map((c) => ({
            id: c.id,
            label: c.nickname ?? c.name.trim().split(/\s+/)[0] ?? c.name,
          }))}
          activeId={childId ?? ""}
          onSelect={setChildId}
          variant="pills"
          ariaLabel="Pilih anak"
        />
      )}

      {/*
        Parent-facing label is "Jurnal" — it has to match the bottom-nav tab,
        and "Penghubung" does not fit a 5-tab bar at 375 px. The route slug,
        the `/api/student-journal/*` paths and every DB field keep the
        `student-journal` name; this is a copy change only. Teacher + admin
        surfaces still say "Buku Penghubung" (staff vocabulary, own cycle).
      */}
      <PageHeader
        title="Jurnal"
        subtitle="Pantau kegiatan harian di sekolah dan rumah"
      />

      <WeekNavigator
        label={isCurrentWeek ? `${weekLabel(dates)} · pekan ini` : weekLabel(dates)}
        onPrev={handlePrevWeek}
        onNext={handleNextWeek}
        // Future weeks hold nothing: school entries are written by the guru for
        // days that have happened, and the "Di rumah" grid locks every cell
        // after today. Paging forward only produced an empty grid.
        nextDisabled={isCurrentWeek}
        onToday={isCurrentWeek ? undefined : () => setCurrentWeek(thisWeek)}
      />

      {/* Main content */}
      {loading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : data.schoolCategories.length === 0 &&
        data.homeCategories.length === 0 ? (
        <EmptyState
          accent="warm"
          icon={BookHeart}
          title="Jurnal belum diatur sekolah"
          description="Sekolah belum menambahkan indikator harian untuk Jurnal. Hubungi admin sekolah untuk informasi lebih lanjut."
        />
      ) : (
        <Tabs value={activeView} onValueChange={setActiveView}>
          {/* min-h-11 = 44px. The triggers measured 25px tall, the smallest
              tap target left in the portal. */}
          <TabsList className="w-full">
            <TabsTrigger value="school" className="min-h-11 flex-1">
              Di sekolah
            </TabsTrigger>
            <TabsTrigger value="home" className="min-h-11 flex-1">
              Di rumah
            </TabsTrigger>
            <TabsTrigger value="notes" className="min-h-11 flex-1">
              Catatan
            </TabsTrigger>
          </TabsList>

          {/* Sekolah tab — read-only */}
          <TabsContent value="school" className="mt-3">
            <WeekGrid
              categories={data.schoolCategories}
              entries={data.schoolEntries}
              dates={data.dates}
              featureLabel="Jurnal"
            />
          </TabsContent>

          {/* Rumah tab — editable */}
          <TabsContent value="home" className="mt-3">
            <WeekGrid
              categories={data.homeCategories}
              entries={data.homeEntries}
              dates={data.dates}
              featureLabel="Jurnal"
              editable
              earliestEditableDate={homeEditFloor}
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
                  toast.error((err as { error?: string }).error ?? "Belum bisa disimpan. Coba lagi sebentar ya.");
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
              Opsional &mdash; bantu Ustadzah memantau ibadah dan rutinitas di rumah.
            </p>
          </TabsContent>

          {/* Catatan tab — parent can write, edit, delete own notes */}
          <TabsContent value="notes" className="mt-3 space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNoteDialog({ mode: "create" })}
              >
                <Plus size={14} className="mr-1" />
                Tulis catatan
              </Button>
            </div>
            <NoteThread
              notes={data.notes}
              audience="parent"
              canEdit={(note) =>
                note.authorRole === "GUARDIAN" &&
                !!currentUserId &&
                note.authorUserId === currentUserId
              }
              onEdit={(noteId, n) =>
                setNoteDialog({
                  mode: "edit",
                  noteId,
                  date: n.date,
                  body: n.body,
                })
              }
              onDelete={(noteId) => setDeleteTarget(noteId)}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Write / Edit dialog */}
      {childId && (
        <NoteComposeDialog
          open={noteDialog !== null}
          onOpenChange={(open) => {
            if (!open) setNoteDialog(null);
          }}
          mode={noteDialog?.mode ?? "create"}
          studentId={childId}
          weekDates={dates}
          audience="parent"
          initialDate={
            noteDialog?.mode === "edit" ? noteDialog.date : undefined
          }
          initialBody={
            noteDialog?.mode === "edit" ? noteDialog.body : undefined
          }
          noteId={noteDialog?.mode === "edit" ? noteDialog.noteId : undefined}
          placeholder="Tulis catatan rumah di sini..."
          onSaved={() => {
            if (childId) loadWeekData(childId, currentWeek);
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan yang dihapus tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  const res = await fetch(
                    `/api/student-journal/notes/${deleteTarget}`,
                    { method: "DELETE" },
                  );
                  if (!res.ok) {
                    const err = (await res
                      .json()
                      .catch(() => ({}))) as { error?: string };
                    toast.error(err.error ?? "Catatan belum bisa dihapus. Coba lagi sebentar ya.");
                    setDeleting(false);
                    return;
                  }
                  toast.success("Catatan dihapus");
                  setDeleteTarget(null);
                  if (childId) loadWeekData(childId, currentWeek);
                } catch {
                  toast.error("Koneksi terputus. Coba lagi sebentar ya.");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
