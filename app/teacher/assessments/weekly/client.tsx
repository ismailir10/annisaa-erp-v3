"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, NotebookPen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { PageHeader } from "@/components/portal/page-header";
import { cn } from "@/lib/utils";

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
  date: string;
  level: string;
  note: string | null;
};

type Week = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  subTheme: { id: string; name: string };
  theme: { id: string; name: string };
};

type ClassSection = {
  id: string;
  name: string;
  ageGroup: "A" | "B" | null;
};

const LEVEL_LABEL: Record<Level, string> = {
  CONSISTENT: "Mampu",
  EMERGING: "Belum",
  NEEDS_REINFORCEMENT: "Perlu",
};

const LEVEL_FULL_LABEL: Record<Level, string> = {
  CONSISTENT: "Mampu dan Konsisten",
  EMERGING: "Mampu Belum Konsisten",
  NEEDS_REINFORCEMENT: "Perlu Penguatan",
};

const LEVEL_BG: Record<Level, string> = {
  CONSISTENT: "bg-status-present text-white border-status-present",
  EMERGING: "bg-status-late text-white border-status-late",
  NEEDS_REINFORCEMENT:
    "bg-status-absent text-white border-status-absent",
};

const LEVEL_BG_OFF: Record<Level, string> = {
  CONSISTENT:
    "border-status-present text-status-present-text bg-status-present-subtle",
  EMERGING:
    "border-status-late text-status-late bg-status-late/10",
  NEEDS_REINFORCEMENT:
    "border-status-absent text-status-absent bg-status-absent/10",
};

/**
 * Pure helper: build the `mm/dd–mm/dd` chip strip Mon–Fri inside the week.
 * Exported for reuse if the assessments hub later wants the same strip.
 */
export function weekDays(week: Week): string[] {
  const start = new Date(week.startDate + "T00:00:00Z");
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Pure helper: pick today if it's within the week, else fall back to Monday. */
export function pickInitialDay(
  week: Week,
  todayJakartaYmd: string,
): string {
  const days = weekDays(week);
  if (days.includes(todayJakartaYmd)) return todayJakartaYmd;
  return days[0];
}

export function WeeklyClient({
  initialDate,
  week,
  classSection,
  students,
  indicators,
  initialEntries,
}: {
  initialDate: string;
  week: Week;
  classSection: ClassSection;
  students: Student[];
  indicators: Indicator[];
  initialEntries: Entry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeDay, setActiveDay] = useState<string>(
    pickInitialDay(week, initialDate),
  );
  const [activeIndicatorId, setActiveIndicatorId] = useState<string>(
    indicators[0]?.id ?? "",
  );
  const [entries, setEntries] = useState<Entry[]>(initialEntries);

  const days = useMemo(() => weekDays(week), [week]);

  const entryByStudent = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const e of entries) {
      if (e.indicatorId === activeIndicatorId && e.date === activeDay) {
        map.set(e.studentId, e);
      }
    }
    return map;
  }, [entries, activeIndicatorId, activeDay]);

  async function setLevel(student: Student, level: Level): Promise<void> {
    if (!activeIndicatorId) return;
    const previous = entries;
    // Optimistic update — replace any existing entry for (student, indicator, day).
    const provisional: Entry = {
      id: `optimistic-${student.id}-${activeIndicatorId}-${activeDay}`,
      studentId: student.id,
      indicatorId: activeIndicatorId,
      date: activeDay,
      level,
      note: entryByStudent.get(student.id)?.note ?? null,
    };
    setEntries((curr) => [
      ...curr.filter(
        (e) =>
          !(
            e.studentId === student.id &&
            e.indicatorId === activeIndicatorId &&
            e.date === activeDay
          ),
      ),
      provisional,
    ]);
    try {
      const res = await fetch("/api/teacher/assessment-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              studentId: student.id,
              indicatorId: activeIndicatorId,
              date: activeDay,
              source: "HOMEROOM",
              level,
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Gagal menyimpan penilaian.");
      }
      // Refresh server payload to get the persisted entry id.
      startTransition(() => router.refresh());
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Gagal menyimpan penilaian. Coba lagi sebentar ya.";
      setEntries(previous);
      toast.error(message);
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
        title="Penilaian Pekanan"
        subtitle={`Pekan ${week.number} · ${week.subTheme.name} (${week.theme.name}) · ${classSection.name}`}
      />

      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Hari dalam pekan"
      >
        {days.map((d, i) => {
          const label = ["Sen", "Sel", "Rab", "Kam", "Jum"][i] ?? "?";
          const dd = d.slice(8, 10);
          const isActive = d === activeDay;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setActiveDay(d)}
              className={cn(
                "px-3 py-2 rounded-lg border text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-input",
              )}
            >
              {label} {dd}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="indicator-picker"
          className="block text-sm font-medium text-foreground"
        >
          IKTP
        </label>
        {indicators.length === 0 ? (
          <div className="rounded-lg border border-dashed border-input bg-muted/40 p-4 text-sm text-muted-foreground">
            Belum ada IKTP terhubung untuk tema pekan ini. Hubungi admin.
          </div>
        ) : (
          <NativeSelect className="w-full">
            <select
              id="indicator-picker"
              data-testid="indicator-picker"
              value={activeIndicatorId}
              onChange={(e) => setActiveIndicatorId(e.target.value)}
              className="h-9 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {indicators.map((ind) => (
                <NativeSelectOption key={ind.id} value={ind.id}>
                  {ind.objective.element} · {ind.content}
                </NativeSelectOption>
              ))}
            </select>
          </NativeSelect>
        )}
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-muted/40 p-6 text-sm text-muted-foreground text-center">
          Belum ada siswa terdaftar di kelas ini.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="weekly-roster">
          {students.map((student) => {
            const current = entryByStudent.get(student.id)?.level as
              | Level
              | undefined;
            return (
              <li
                key={student.id}
                className="rounded-lg border border-input p-3 space-y-2"
                data-testid={`weekly-row-${student.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {student.name}
                  </span>
                  {current && (
                    <span className="text-xs text-muted-foreground">
                      {LEVEL_FULL_LABEL[current]}
                    </span>
                  )}
                </div>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label={`Pilih tingkat untuk ${student.name}`}
                >
                  {(Object.keys(LEVEL_LABEL) as Level[]).map((level) => {
                    const isActive = current === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        disabled={!activeIndicatorId || pending}
                        onClick={() => setLevel(student, level)}
                        data-testid={`weekly-level-${student.id}-${level}`}
                        className={cn(
                          "py-2 px-1 rounded-md border text-xs font-medium transition-colors",
                          isActive ? LEVEL_BG[level] : LEVEL_BG_OFF[level],
                          (!activeIndicatorId || pending) &&
                            "opacity-60 cursor-not-allowed",
                        )}
                      >
                        {LEVEL_LABEL[level]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <NotebookPen className="size-3.5" />
        Cubit untuk menyimpan. Catatan ditambahkan dari halaman detail (segera).
      </p>
    </div>
  );
}
