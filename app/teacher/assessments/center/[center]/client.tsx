"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/portal/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

const JAKARTA_TZ = "Asia/Jakarta";
const MAX_PICKED_INDICATORS = 4;

type Level = "CONSISTENT" | "EMERGING" | "NEEDS_REINFORCEMENT";

type Student = {
  id: string;
  name: string;
  nickname: string | null;
  status: string;
};

type Indicator = {
  id: string;
  content: string;
  order: number;
  objective: { id: string; ageGroup: string; element: string };
};

type Entry = {
  id: string;
  studentId: string;
  indicatorId: string;
  level: Level | string;
  note: string | null;
  activity: string | null;
};

type Payload =
  | {
      ok: true;
      week: { id: string; number: number; subTheme: { name: string }; theme: { name: string } };
      center: string;
      date: string;
      ageGroup: "A" | "B";
      students: Student[];
      indicators: Indicator[];
      entries: Entry[];
      lastActivity: string | null;
    }
  | { ok: false; status: number; error: string; reason?: string };

const LEVEL_LABEL: Record<Level, string> = {
  CONSISTENT: "Mampu",
  EMERGING: "Belum",
  NEEDS_REINFORCEMENT: "Perlu",
};

const LEVEL_BG: Record<Level, string> = {
  CONSISTENT: "bg-status-present text-white border-status-present",
  EMERGING: "bg-status-late text-white border-status-late",
  NEEDS_REINFORCEMENT: "bg-status-absent text-white border-status-absent",
};

const LEVEL_BG_OFF: Record<Level, string> = {
  CONSISTENT:
    "border-status-present text-status-present-text bg-status-present-subtle",
  EMERGING: "border-status-late text-status-late bg-status-late/10",
  NEEDS_REINFORCEMENT:
    "border-status-absent text-status-absent bg-status-absent/10",
};

type Cell = { level: Level | null; note: string };

function cellKey(studentId: string, indicatorId: string): string {
  return `${studentId}::${indicatorId}`;
}

export function CenterSessionClient({
  center,
  centerLabel,
}: {
  center: string;
  centerLabel: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState<string>(() =>
    getTodayInTimezone(JAKARTA_TZ),
  );
  const [ageGroup, setAgeGroup] = useState<"A" | "B">("A");
  const [activity, setActivity] = useState<string>("");
  const [pickedIndicatorIds, setPickedIndicatorIds] = useState<string[]>([]);
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  // Fetch payload whenever date/ageGroup changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Reset session-scoped state before fetching so stale picks from a
      // previous (date, ageGroup) pair don't bleed into the new payload.
      // Indicators differ across ageGroups (and across weeks for date
      // changes); without this reset the roster grid silently goes empty
      // because the new payload's indicators don't match the old IDs.
      setPickedIndicatorIds([]);
      setCells(new Map());
      setOpenNotes(new Set());
      try {
        const res = await fetch(
          `/api/teacher/assessment-entries/center/${center}?date=${date}&ageGroup=${ageGroup}`,
        );
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPayload({
            ok: false,
            status: res.status,
            error: body.error ?? "Gagal memuat data sentra.",
            reason: body.reason,
          });
        } else {
          setPayload({ ok: true, ...body });
          // Hydrate cells + activity from existing entries (shared activity
          // for all entries in a session). When no entries yet, fall back to
          // lastActivity (server-supplied prefill) or keep the user's draft.
          const next = new Map<string, Cell>();
          const picked = new Set<string>();
          for (const e of body.entries as Entry[]) {
            picked.add(e.indicatorId);
            next.set(cellKey(e.studentId, e.indicatorId), {
              level: e.level as Level,
              note: e.note ?? "",
            });
          }
          setCells(next);
          setPickedIndicatorIds((curr) =>
            curr.length > 0 ? curr : Array.from(picked).slice(0, MAX_PICKED_INDICATORS),
          );
          setActivity((curr) => curr || body.lastActivity || "");
        }
      } catch (err) {
        if (cancelled) return;
        setPayload({
          ok: false,
          status: 0,
          error:
            err instanceof Error ? err.message : "Tidak bisa terhubung ke server.",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [center, date, ageGroup]);

  const indicators = payload?.ok ? payload.indicators : [];
  const students = payload?.ok ? payload.students : [];

  const pickedIndicators = useMemo(
    () => indicators.filter((i) => pickedIndicatorIds.includes(i.id)),
    [indicators, pickedIndicatorIds],
  );

  function toggleIndicator(id: string): void {
    setPickedIndicatorIds((curr) => {
      if (curr.includes(id)) return curr.filter((x) => x !== id);
      if (curr.length >= MAX_PICKED_INDICATORS) {
        toast.error(`Maksimum ${MAX_PICKED_INDICATORS} IKTP per sesi.`);
        return curr;
      }
      return [...curr, id];
    });
  }

  function setCellLevel(
    studentId: string,
    indicatorId: string,
    level: Level,
  ): void {
    const key = cellKey(studentId, indicatorId);
    setCells((curr) => {
      const next = new Map(curr);
      const existing = next.get(key);
      next.set(key, { level, note: existing?.note ?? "" });
      return next;
    });
  }

  function setCellNote(
    studentId: string,
    indicatorId: string,
    note: string,
  ): void {
    const key = cellKey(studentId, indicatorId);
    setCells((curr) => {
      const next = new Map(curr);
      const existing = next.get(key);
      next.set(key, { level: existing?.level ?? null, note });
      return next;
    });
  }

  function toggleNoteOpen(key: string): void {
    setOpenNotes((curr) => {
      const next = new Set(curr);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save(): Promise<void> {
    if (!payload?.ok) return;
    if (!activity.trim()) {
      toast.error("Isi kegiatan dulu sebelum menyimpan.");
      return;
    }
    const entries: Array<{
      studentId: string;
      indicatorId: string;
      level: Level;
      note?: string;
    }> = [];
    for (const student of students) {
      for (const indicator of pickedIndicators) {
        const cell = cells.get(cellKey(student.id, indicator.id));
        if (!cell?.level) continue;
        entries.push({
          studentId: student.id,
          indicatorId: indicator.id,
          level: cell.level,
          note: cell.note?.trim() ? cell.note.trim() : undefined,
        });
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/assessment-entries/center", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          center,
          date,
          activity: activity.trim(),
          entries,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Gagal menyimpan sesi sentra.");
      }
      const body = await res.json();
      toast.success(`Tersimpan: ${body.written} penilaian.`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Gagal menyimpan sesi sentra. Coba lagi sebentar ya.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/teacher/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Penilaian
      </Link>

      <PageHeader
        title={centerLabel}
        subtitle="Penilaian harian sentra"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="center-date"
            className="block text-xs font-medium text-foreground"
          >
            Tanggal
          </label>
          <input
            id="center-date"
            data-testid="center-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-foreground">
            Kelompok usia
          </span>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Kelompok usia"
          >
            {(["A", "B"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={ageGroup === g}
                data-testid={`agegroup-${g}`}
                onClick={() => setAgeGroup(g)}
                className={cn(
                  "h-9 rounded-lg border text-sm transition-colors",
                  ageGroup === g
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input",
                )}
              >
                TK {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="center-activity"
          className="block text-xs font-medium text-foreground"
        >
          Kegiatan
        </label>
        <input
          id="center-activity"
          data-testid="center-activity"
          type="text"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          maxLength={200}
          placeholder="Mis. Doa pagi + asmaul husna"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : payload && !payload.ok ? (
        <EmptyState
          icon={CalendarOff}
          title={
            payload.reason === "no_active_week"
              ? "Belum ada Pekan aktif"
              : "Tidak bisa memuat sentra"
          }
          description={payload.error}
        />
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Pilih IKTP (maks {MAX_PICKED_INDICATORS})
            </p>
            {indicators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-muted/40 p-4 text-sm text-muted-foreground">
                Belum ada IKTP terhubung untuk tema pekan ini. Hubungi admin.
              </div>
            ) : (
              <ul className="space-y-1.5" data-testid="center-indicator-picker">
                {indicators.map((ind) => {
                  const picked = pickedIndicatorIds.includes(ind.id);
                  return (
                    <li key={ind.id}>
                      <button
                        type="button"
                        onClick={() => toggleIndicator(ind.id)}
                        aria-pressed={picked}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                          picked
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background text-foreground",
                        )}
                      >
                        <span className="block font-medium">
                          {ind.objective.element}
                        </span>
                        <span className="block text-muted-foreground">
                          {ind.content}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {pickedIndicators.length > 0 && students.length > 0 && (
            <ul className="space-y-3" data-testid="center-roster">
              {students.map((student) => (
                <li
                  key={student.id}
                  className="space-y-2 rounded-lg border border-input p-3"
                  data-testid={`center-row-${student.id}`}
                >
                  <p className="text-sm font-medium">{student.name}</p>
                  <ul className="space-y-2">
                    {pickedIndicators.map((ind) => {
                      const key = cellKey(student.id, ind.id);
                      const cell = cells.get(key);
                      const level = cell?.level ?? null;
                      const noteOpen = openNotes.has(key);
                      return (
                        <li key={ind.id} className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {ind.content}
                          </p>
                          <div
                            className="grid grid-cols-3 gap-2"
                            role="radiogroup"
                            aria-label={`Tingkat ${student.name} pada ${ind.content}`}
                          >
                            {(Object.keys(LEVEL_LABEL) as Level[]).map((lv) => {
                              const isActive = level === lv;
                              return (
                                <button
                                  key={lv}
                                  type="button"
                                  role="radio"
                                  aria-checked={isActive}
                                  onClick={() =>
                                    setCellLevel(student.id, ind.id, lv)
                                  }
                                  className={cn(
                                    "py-1.5 px-1 rounded-md border text-xs font-medium transition-colors",
                                    isActive ? LEVEL_BG[lv] : LEVEL_BG_OFF[lv],
                                  )}
                                >
                                  {LEVEL_LABEL[lv]}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleNoteOpen(key)}
                            className="text-[11px] text-muted-foreground underline"
                          >
                            {noteOpen ? "Sembunyikan catatan" : "Catatan"}
                          </button>
                          {noteOpen && (
                            <textarea
                              value={cell?.note ?? ""}
                              onChange={(e) =>
                                setCellNote(student.id, ind.id, e.target.value)
                              }
                              maxLength={500}
                              rows={2}
                              placeholder="Catatan singkat (opsional)"
                              className="w-full rounded-md border border-input bg-transparent p-2 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {pickedIndicators.length === 0 && indicators.length > 0 && (
            <p className="text-xs text-muted-foreground italic">
              Pilih minimal satu IKTP di atas untuk mulai menilai.
            </p>
          )}

          {students.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              Belum ada siswa TK {ageGroup} terdaftar pada tahun ajaran aktif.
            </p>
          )}
        </>
      )}

      <div className="sticky bottom-20 -mx-page-x bg-background/95 px-page-x py-3 border-t border-border">
        <Button
          type="button"
          onClick={save}
          disabled={
            saving ||
            loading ||
            !payload?.ok ||
            pickedIndicators.length === 0 ||
            !activity.trim()
          }
          className="w-full"
          data-testid="center-save"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan...
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" /> Simpan
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
