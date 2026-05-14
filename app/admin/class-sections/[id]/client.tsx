"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

type ClassSection = {
  id: string;
  name: string;
  capacity: number;
  slotTemplate: string;
  status: string;
  program: { id: string; code: string; name: string };
  campus: { id: string; name: string };
  academicYear: { id: string; name: string };
  classTrack: { id: string; name: string };
};

type SessionRow = {
  id: string;
  classSectionId: string;
  semesterId: string;
  date: string;
  slot: string;
  teacherId: string | null;
  defaultTeacherId: string | null;
  substituteReason: string | null;
  isBackfilled: boolean;
  teacher: { id: string; nama: string } | null;
  defaultTeacher: { id: string; nama: string } | null;
};

type Employee = { id: string; nama: string };

const SLOT_LABELS: Record<string, string> = {
  FULL_DAY: "Sehari Penuh",
  MORNING: "Pagi",
  AFTERNOON: "Siang",
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ClassSectionDetailClient({
  classSectionId,
  canWrite,
}: {
  classSectionId: string;
  canWrite: boolean;
}) {
  const now = new Date();
  const [section, setSection] = useState<ClassSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(true);
  const [sectionError, setSectionError] = useState(false);

  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear] = useState(now.getFullYear());
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesTruncated, setEmployeesTruncated] = useState(false);
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [formTeacherId, setFormTeacherId] = useState<string>("");
  const [formReason, setFormReason] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Section header ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSectionLoading(true);
    setSectionError(false);
    fetch(`/api/class-sections/${classSectionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setSection(data);
      })
      .catch(() => {
        if (!cancelled) setSectionError(true);
      })
      .finally(() => {
        if (!cancelled) setSectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classSectionId]);

  // ── Month sessions ────────────────────────────────────────────
  const fetchSessions = useCallback(() => {
    setSessionsLoading(true);
    setSessionsError(false);
    const m = `${year}-${String(month).padStart(2, "0")}`;
    fetch(
      `/api/admin/class-sessions?classSectionId=${classSectionId}&month=${m}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SessionRow[]) => {
        setSessions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setSessions([]);
        setSessionsError(true);
      })
      .finally(() => setSessionsLoading(false));
  }, [classSectionId, month, year]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Active employees (for the swap Select) — fetched once ─────
  // `/api/employees` caps pageSize at 100 (lib/api/pagination MAX_PAGE_SIZE),
  // so we request the max and compare against the response `total`. Talib's
  // tenants are small preschools — >100 active staff is extremely unlikely —
  // so rather than paginate-and-accumulate we just surface an inline hint in
  // the Sheet when the list is truncated.
  useEffect(() => {
    if (!canWrite) return;
    fetch("/api/employees?status=ACTIVE&pageSize=100")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data ?? [];
        const total = Array.isArray(json)
          ? list.length
          : json?.total ?? list.length;
        setEmployees(
          list.map((e: { id: string; nama: string }) => ({
            id: e.id,
            nama: e.nama,
          })),
        );
        setEmployeesTruncated(total > list.length);
      })
      .catch(() => {
        setEmployees([]);
        setEmployeesTruncated(false);
        toast.error("Gagal memuat daftar guru");
      });
  }, [canWrite]);

  // Group sessions by date for the calendar cells.
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return map;
  }, [sessions]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function openSession(s: SessionRow) {
    setSelected(s);
    setFormTeacherId(s.teacherId ?? "");
    setFormReason(s.substituteReason ?? "");
  }

  function closeSheet() {
    setSelected(null);
    setFormTeacherId("");
    setFormReason("");
  }

  async function submitSwap(teacherId: string | null, reason: string) {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/class-sessions/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherId,
            substituteReason: reason.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Gagal menyimpan perubahan guru");
        return;
      }
      toast.success("Guru sesi diperbarui");
      closeSheet();
      fetchSessions();
    } catch {
      toast.error("Gagal menyimpan perubahan guru");
    } finally {
      setSaving(false);
    }
  }

  // ── Header render ─────────────────────────────────────────────
  let header;
  if (sectionLoading) {
    header = <Skeleton className="h-16 w-full max-w-md" />;
  } else if (sectionError || !section) {
    header = (
      <PageHeader
        title="Kelas tidak ditemukan"
        description="Kelas tidak ada atau Anda tidak memiliki akses."
      />
    );
  } else {
    header = (
      <PageHeader
        title={section.name}
        description={`${section.program.name} · ${section.campus.name} · ${section.academicYear.name} · ${
          SLOT_LABELS[section.slotTemplate] ?? section.slotTemplate
        }`}
        actions={
          <Button variant="outline" size="sm" render={<Link href="/admin/academic-years" />}>
            <ArrowLeft size={14} />
            Kembali
          </Button>
        }
      />
    );
  }

  return (
    <>
      {header}

      <div className="mt-6 bg-card border border-border rounded-xl p-4">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            aria-label="Bulan sebelumnya"
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
          <button
            onClick={nextMonth}
            aria-label="Bulan berikutnya"
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold text-muted-foreground py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {sessionsLoading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : sessionsError ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Gagal memuat sesi kelas.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchSessions}
            >
              Coba lagi
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />;
                const dateStr = ymd(year, month, day);
                const daySessions = sessionsByDate.get(dateStr) ?? [];
                return (
                  <div
                    key={i}
                    className="aspect-square min-h-[64px] rounded-lg border border-border p-1 flex flex-col gap-0.5 overflow-hidden"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {day}
                    </span>
                    {daySessions.map((s) => {
                      const isSubstitute =
                        s.teacherId !== s.defaultTeacherId;
                      return (
                        <button
                          key={s.id}
                          onClick={() => openSession(s)}
                          className="text-left rounded-md bg-accent/60 hover:bg-accent px-1 py-0.5 transition-colors"
                        >
                          <span className="block text-[10px] font-medium text-foreground truncate">
                            {SLOT_LABELS[s.slot] ?? s.slot}
                          </span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {s.teacher?.nama ?? "Belum ada guru"}
                          </span>
                          {isSubstitute && (
                            <Badge
                              variant="outline"
                              className="mt-0.5 text-[9px] px-1 py-0 leading-tight"
                            >
                              Pengganti
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {sessions.length === 0 && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Belum ada sesi kelas pada bulan ini.
              </p>
            )}
          </>
        )}
      </div>

      {/* Teacher-swap drawer */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Ubah Guru Sesi</SheetTitle>
                <SheetDescription>
                  {new Date(selected.date + "T00:00:00").toLocaleDateString(
                    "id-ID",
                    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
                  )}{" "}
                  · {SLOT_LABELS[selected.slot] ?? selected.slot}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Wali kelas</span>
                  <span className="font-medium">
                    {selected.defaultTeacher?.nama ?? "Tidak ada"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Guru saat ini</span>
                  <span className="font-medium">
                    {selected.teacher?.nama ?? "Belum ada guru"}
                  </span>
                </div>

                {canWrite ? (
                  <>
                    <Field>
                      <FieldLabel>Guru pengganti</FieldLabel>
                      <Select
                        value={formTeacherId}
                        onValueChange={(v) => setFormTeacherId(String(v ?? ""))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih guru" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nama}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {employeesTruncated && (
                        <p className="text-xs text-muted-foreground">
                          Daftar guru dipotong pada 100 nama — jika guru yang
                          dicari tidak muncul, hubungi admin.
                        </p>
                      )}
                    </Field>

                    <Field>
                      <FieldLabel>Alasan pengganti</FieldLabel>
                      <Textarea
                        value={formReason}
                        onChange={(e) => setFormReason(e.target.value)}
                        placeholder="Contoh: wali kelas sedang cuti"
                        maxLength={300}
                        rows={3}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Anda tidak memiliki akses untuk mengubah guru sesi.
                  </p>
                )}
              </div>

              {canWrite && (
                <SheetFooter>
                  <Button
                    onClick={() =>
                      submitSwap(formTeacherId || null, formReason)
                    }
                    disabled={saving}
                  >
                    {saving ? "Menyimpan..." : "Simpan"}
                  </Button>
                  {selected.defaultTeacherId && (
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => submitSwap(selected.defaultTeacherId, "")}
                    >
                      Kembalikan ke wali kelas
                    </Button>
                  )}
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
