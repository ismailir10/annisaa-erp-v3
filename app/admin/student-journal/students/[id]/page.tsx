"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekGrid } from "@/components/portal/week-grid";
import { NoteThread } from "@/components/student-journal/note-thread";
import { AuditDiff } from "@/components/student-journal/audit-diff";
import { weekStart } from "@/lib/student-journal/week";
import { formatDate } from "@/lib/format";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Check } from "lucide-react";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Indicator = { id: string; label: string; order: number };
type Category = { id: string; name: string; scope: string; indicators: Indicator[] };
type Entry = { id?: string; indicatorId: string; date: string; checked: boolean };
type Note = {
  id: string;
  date: string;
  authorRole: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
};
type AuditRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  changedByUserId: string;
  changedByName?: string;
  changedAt: string;
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

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function currentMonday(): string {
  const today = getTodayInTimezone("Asia/Jakarta");
  return weekStart(today);
}

function addWeeks(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(ws: string): string {
  const d = new Date(`${ws}T00:00:00Z`);
  const fri = new Date(d);
  fri.setUTCDate(d.getUTCDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const friYmd = fri.toISOString().slice(0, 10);
  return `${formatDate(ws, opts)} – ${formatDate(friYmd, opts)}`;
}

const ACTION_LABELS: Record<string, string> = {
  UPDATE: "Diubah",
  DELETE: "Dihapus",
  CREATE: "Dibuat",
};

const ENTITY_LABELS: Record<string, string> = {
  ENTRY: "Entri",
  NOTE: "Catatan",
};

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function StudentJournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: studentId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [ws, setWs] = useState<string>(() => {
    const p = searchParams.get("weekStart");
    return p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : currentMonday();
  });

  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [studentName, setStudentName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);

  // Back link: use ?from param or default to monitoring
  const fromParam = searchParams.get("from");
  const backHref = fromParam
    ? decodeURIComponent(fromParam)
    : "/admin/student-journal/monitoring";

  // ------------------------------------------------------------------
  // Fetch week data
  // ------------------------------------------------------------------
  const fetchWeekData = useCallback(
    async (weekStartYmd: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/student-journal/admin/students/${studentId}/week?weekStart=${weekStartYmd}`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Gagal memuat data jurnal");
          return;
        }
        const json = await res.json();
        const data: WeekData = json.data;
        setWeekData(data);
        // Attempt to get student name from the response (or fetch separately)
      } catch {
        toast.error("Gagal memuat data jurnal");
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );

  // ------------------------------------------------------------------
  // Fetch student name
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch(`/api/students/${studentId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.name) setStudentName(json.data.name);
      })
      // Silent: optional header-name populate; primary data load has its own toast.error path.
      .catch(() => {});
  }, [studentId]);

  useEffect(() => {
    fetchWeekData(ws);
  }, [fetchWeekData, ws]);

  // ------------------------------------------------------------------
  // Fetch audit rows on demand (when Audit tab is opened)
  // ------------------------------------------------------------------
  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(
        `/api/student-journal/admin/audit?studentId=${studentId}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal memuat audit");
        return;
      }
      const json = await res.json();
      setAuditRows(json.data ?? []);
    } catch {
      toast.error("Gagal memuat audit");
    } finally {
      setAuditLoading(false);
    }
  }, [studentId]);

  // ------------------------------------------------------------------
  // Week navigation
  // ------------------------------------------------------------------
  const handleWeekChange = (delta: number) => {
    const newWs = addWeeks(ws, delta);
    setWs(newWs);
    router.replace(
      `/admin/student-journal/students/${studentId}?weekStart=${newWs}`,
      { scroll: false },
    );
  };

  // ------------------------------------------------------------------
  // Edit toggle
  // ------------------------------------------------------------------
  function handleToggle(
    indicatorId: string,
    date: string,
    next: boolean,
    scope: "SCHOOL" | "HOME",
  ) {
    if (!weekData) return;

    const entries = scope === "SCHOOL" ? weekData.schoolEntries : weekData.homeEntries;
    const existing = entries.find(
      (e) => e.indicatorId === indicatorId && e.date === date,
    );

    if (!existing?.id) {
      toast.info("Belum diisi guru/orang tua — tidak dapat diubah admin (V1)");
      return;
    }

    // Optimistic update
    const updated = { ...weekData };
    if (scope === "SCHOOL") {
      updated.schoolEntries = weekData.schoolEntries.map((e) =>
        e.indicatorId === indicatorId && e.date === date ? { ...e, checked: next } : e,
      );
    } else {
      updated.homeEntries = weekData.homeEntries.map((e) =>
        e.indicatorId === indicatorId && e.date === date ? { ...e, checked: next } : e,
      );
    }
    setWeekData(updated);

    fetch(`/api/student-journal/admin/entries/${existing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: next }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Gagal menyimpan perubahan");
          // Revert optimistic update
          fetchWeekData(ws);
        }
      })
      .catch(() => {
        toast.error("Gagal menyimpan perubahan");
        fetchWeekData(ws);
      });
  }

  // ------------------------------------------------------------------
  // Note delete (admin can delete any note; confirm before the DELETE call)
  // ------------------------------------------------------------------
  const [noteDeleteTarget, setNoteDeleteTarget] = useState<string | null>(null);
  const [noteDeleting, setNoteDeleting] = useState(false);

  async function handleNoteDeleteConfirm() {
    if (!noteDeleteTarget || !weekData) return;
    setNoteDeleting(true);
    try {
      const res = await fetch(
        `/api/student-journal/admin/notes/${noteDeleteTarget}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Gagal menghapus catatan");
        return;
      }
      toast.success("Catatan dihapus");
      setWeekData({
        ...weekData,
        notes: weekData.notes.filter((n) => n.id !== noteDeleteTarget),
      });
      setNoteDeleteTarget(null);
    } catch {
      toast.error("Gagal menghapus catatan");
    } finally {
      setNoteDeleting(false);
    }
  }

  // ------------------------------------------------------------------
  // Skeleton
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <>
        <div className="mb-4">
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Back link */}
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Kembali ke Pemantauan
        </Link>
      </div>

      <PageHeader
        title={studentName || "Detail Jurnal Siswa"}
        description="Buku Penghubung — rincian per minggu"
        actions={
          <div className="flex items-center gap-2">
            {/* Week picker */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleWeekChange(-1)}
              title="Minggu sebelumnya"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {formatWeekLabel(ws)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleWeekChange(1)}
              title="Minggu berikutnya"
            >
              <ChevronRight size={14} />
            </Button>

            {/* Edit toggle — per-cell edits already PUT immediately (handleToggle),
                so there is nothing to "save" or "cancel" here: this button only
                exits edit mode. */}
            {isEditing ? (
              <Button
                size="sm"
                onClick={() => setIsEditing(false)}
                className="gap-1.5"
              >
                <Check size={14} />
                Selesai
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1.5"
              >
                <Pencil size={14} />
                Ubah
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        defaultValue="school"
        onValueChange={(v) => {
          if (v === "audit") fetchAudit();
        }}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="school">Sekolah</TabsTrigger>
          <TabsTrigger value="home">Rumah</TabsTrigger>
          <TabsTrigger value="notes">Catatan</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Sekolah tab */}
        <TabsContent value="school">
          <div className="bg-card border border-border rounded-xl p-card">
            <WeekGrid
              categories={weekData?.schoolCategories ?? []}
              entries={weekData?.schoolEntries ?? []}
              dates={weekData?.dates ?? []}
              editable={isEditing}
              onToggle={(indicatorId, date, next) =>
                handleToggle(indicatorId, date, next, "SCHOOL")
              }
            />
          </div>
        </TabsContent>

        {/* Rumah tab */}
        <TabsContent value="home">
          <div className="bg-card border border-border rounded-xl p-card">
            <WeekGrid
              categories={weekData?.homeCategories ?? []}
              entries={weekData?.homeEntries ?? []}
              dates={weekData?.dates ?? []}
              editable={isEditing}
              onToggle={(indicatorId, date, next) =>
                handleToggle(indicatorId, date, next, "HOME")
              }
            />
          </div>
        </TabsContent>

        {/* Catatan tab */}
        <TabsContent value="notes">
          {!weekData || weekData.notes.length === 0 ? (
            <EmptyState title="Belum ada catatan minggu ini" />
          ) : (
            <NoteThread
              notes={weekData.notes}
              /* Gates the action icons only. onEdit is deliberately not passed —
                 admins delete any note but never edit note bodies; wiring onEdit
                 here later would grant edit-any-note and needs a design decision. */
              canEdit={() => true}
              onDelete={(noteId) => setNoteDeleteTarget(noteId)}
            />
          )}

          <ConfirmDialog
            open={noteDeleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setNoteDeleteTarget(null);
            }}
            title="Hapus catatan?"
            description="Catatan akan dinonaktifkan dan tidak lagi muncul di jurnal siswa."
            confirmLabel="Hapus"
            cancelLabel="Batal"
            onConfirm={handleNoteDeleteConfirm}
            destructive
            loading={noteDeleting}
          />
        </TabsContent>

        {/* Audit tab */}
        <TabsContent value="audit">
          {auditLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : auditRows.length === 0 ? (
            <EmptyState title="Belum ada riwayat perubahan" />
          ) : (
            <div className="space-y-4">
              {auditRows.map((row) => (
                <div
                  key={row.id}
                  className="bg-card border border-border rounded-xl p-card space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {ENTITY_LABELS[row.entityType] ?? row.entityType}
                    </span>
                    <span
                      className={
                        row.action === "DELETE"
                          ? "text-destructive"
                          : row.action === "UPDATE"
                          ? "text-primary"
                          : "text-status-present"
                      }
                    >
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                    <span>{formatDate(row.changedAt)}</span>
                    {row.changedByName && (
                      <span className="text-muted-foreground">
                        oleh {row.changedByName}
                      </span>
                    )}
                    <span className="font-mono text-xs truncate max-w-[120px]">
                      {row.entityId}
                    </span>
                  </div>
                  <AuditDiff before={row.beforeJson} after={row.afterJson} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
