"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/portal/page-header";

type Assignment = {
  id: string;
  classSection: { id: string; name: string; program: { name: string }; campus: { name: string }; _count: { enrollments: number } };
};

type StudentRecord = {
  student: { id: string; name: string; nickname: string | null; gender: string | null };
  attendance: { status: string; notes: string | null } | null;
};

// Prisma enum values — do NOT translate in code, only display labels
const ROTATION = ["PRESENT", "ABSENT", "SICK", "PERMISSION"] as const;
type Status = (typeof ROTATION)[number];

// Row-tint background via CSS vars (no inline hex)
const ROW_TINT: Record<Status, string> = {
  PRESENT: "bg-[color:var(--status-present-subtle)]",
  ABSENT: "bg-[color:var(--status-absent-subtle)]",
  SICK: "bg-[color:var(--status-late-subtle)]",
  PERMISSION: "bg-[color:var(--status-leave-subtle)]",
};

const AVATAR_BG: Record<Status, string> = {
  PRESENT: "bg-status-present",
  ABSENT: "bg-destructive",
  SICK: "bg-status-late",
  PERMISSION: "bg-status-leave",
};

export default function ClassAttendancePage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [lastLoadedCount, setLastLoadedCount] = useState(10);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const [rosterError, setRosterError] = useState(false);
  const rosterRequestId = useRef(0);
  const saveOperationIds = useRef<Record<string, number>>({});
  const saveQueues = useRef<Record<string, Promise<void> | undefined>>({});

  const loadAssignments = useCallback(async () => {
    setLoading(true); setAssignmentsError(false);
    try {
      const res = await fetch("/api/teaching-assignments/my");
      if (!res.ok) throw new Error("assignments");
      const data = await res.json();
      setAssignments(data);
      if (data.length > 0) setSelectedClass(data[0].classSection.id);
    } catch {
      setAssignmentsError(true);
      toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  // Load students when class or date changes
  const loadStudents = useCallback(async () => {
    if (!selectedClass) return;
    const requestId = ++rosterRequestId.current;
    setLoadingRoster(true);
    setRosterError(false);
    try {
    const res = await fetch(`/api/student-attendance?classSectionId=${selectedClass}&date=${date}`);
    if (!res.ok) throw new Error("roster");
    const data: StudentRecord[] = await res.json();
    if (requestId !== rosterRequestId.current) return;
    setStudents(data);
    setLastLoadedCount(data.length || 10);
    const initial: Record<string, Status> = {};
    for (const s of data) initial[s.student.id] = (s.attendance?.status as Status) ?? "PRESENT";
    setStatuses(initial);
    } catch {
      if (requestId !== rosterRequestId.current) return;
      setRosterError(true);
      toast.error("Data siswa tidak bisa dimuat. Coba lagi sebentar ya.");
    } finally { if (requestId === rosterRequestId.current) setLoadingRoster(false); }
  }, [selectedClass, date]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedClass) loadStudents(); }, [selectedClass, date, loadStudents]);

  // Cycle-tap: PRESENT → ABSENT → SICK → PERMISSION. Optimistic save on every tap.
  // Save status confirmation lives next to the row so silent failures can't hide
  // behind unrelated toasts (e.g. a stale Cuti notification stuck on screen).
  const [saveState, setSaveState] = useState<Record<string, "saving" | "saved" | "error">>({});

  async function cycleStatus(studentId: string) {
    const current = statuses[studentId] ?? "PRESENT";
    const next = ROTATION[(ROTATION.indexOf(current) + 1) % ROTATION.length];
    const previous = current;
    const operationId = (saveOperationIds.current[studentId] ?? 0) + 1;
    saveOperationIds.current[studentId] = operationId;

    // Optimistic update + per-row pending marker
    setStatuses((prev) => ({ ...prev, [studentId]: next }));
    setSaveState((prev) => ({ ...prev, [studentId]: "saving" }));

    const save = async () => { try {
      const res = await fetch("/api/student-attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classSectionId: selectedClass,
          date,
          records: [{ studentId, status: next }],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (saveOperationIds.current[studentId] === operationId) { setStatuses((prev) => ({ ...prev, [studentId]: previous })); setSaveState((prev) => ({ ...prev, [studentId]: "error" })); }
        if (saveOperationIds.current[studentId] === operationId) toast.error(d?.error || "Absensi tidak tersimpan. Coba ketuk ulang ya.");
        return;
      }
      const body = await res.json().catch(() => ({ saved: 0 }));
      // Guard against a successful HTTP status but zero rows persisted —
      // mark route returns { saved, total }; treat saved < total as failure.
      if (typeof body.saved === "number" && body.saved < 1) {
        if (saveOperationIds.current[studentId] === operationId) { setStatuses((prev) => ({ ...prev, [studentId]: previous })); setSaveState((prev) => ({ ...prev, [studentId]: "error" })); }
        if (saveOperationIds.current[studentId] === operationId) toast.error("Absensi tidak tersimpan. Coba ketuk ulang ya.");
        return;
      }
      if (saveOperationIds.current[studentId] === operationId) setSaveState((prev) => ({ ...prev, [studentId]: "saved" }));
    } catch {
      if (saveOperationIds.current[studentId] === operationId) { setStatuses((prev) => ({ ...prev, [studentId]: previous })); setSaveState((prev) => ({ ...prev, [studentId]: "error" })); }
      if (saveOperationIds.current[studentId] === operationId) toast.error("Koneksi terputus. Coba lagi sebentar ya.");
    } };
    const queued = saveQueues.current[studentId] ?? Promise.resolve();
    const nextQueue = queued.then(save, save);
    saveQueues.current[studentId] = nextQueue;
    void nextQueue.finally(() => { if (saveQueues.current[studentId] === nextQueue) delete saveQueues.current[studentId]; });
  }

  const counts = {
    PRESENT: Object.values(statuses).filter((s) => s === "PRESENT").length,
    ABSENT: Object.values(statuses).filter((s) => s === "ABSENT").length,
    SICK: Object.values(statuses).filter((s) => s === "SICK").length,
    PERMISSION: Object.values(statuses).filter((s) => s === "PERMISSION").length,
  };

  if (loading) return (
    <div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (assignments.length === 0) {
    return (
      <div data-empty-state={assignmentsError ? "assignments-error" : "no-class-assigned"}>
        <EmptyState icon={Users} title={assignmentsError ? "Daftar kelas tidak bisa dimuat" : "Belum ditugaskan ke kelas"} description={assignmentsError ? "Periksa koneksi, lalu coba lagi." : "Hubungi admin untuk ditugaskan mengajar di kelas tertentu."} />
        {assignmentsError ? <div className="mt-4 text-center"><Button variant="outline" onClick={loadAssignments}>Coba lagi</Button></div> : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Absensi Kelas" />

      {/* Class + Date toolbar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="class-attendance-class" className="sr-only">
          Pilih kelas
        </label>
        <Select value={selectedClass} onValueChange={v => v && setSelectedClass(v)} items={assignments.map(a => ({ label: `${a.classSection.name} — ${a.classSection.program.name}`, value: a.classSection.id }))}>
        <SelectTrigger id="class-attendance-class" className="w-full sm:flex-1">
            <SelectValue placeholder="Pilih kelas">
              {(() => {
                const a = assignments.find(a => a.classSection.id === selectedClass);
                return a ? `${a.classSection.name} — ${a.classSection.program.name}` : null;
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {assignments.map(a => (
              <SelectItem key={a.classSection.id} value={a.classSection.id}>
                {a.classSection.name} — {a.classSection.program.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor="class-attendance-date" className="sr-only">
          Tanggal kehadiran
        </label>
        <Input id="class-attendance-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full sm:w-36" />
      </div>

      {/* Live summary trio (quad — includes Izin) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-sm">
        <span className="text-status-present-text">Hadir {counts.PRESENT}</span>
        <span className="text-status-absent-text">Alpa {counts.ABSENT}</span>
        <span className="text-status-late-text">Sakit {counts.SICK}</span>
        <span className="text-status-leave-text">Izin {counts.PERMISSION}</span>
      </div>

      {/* Student list — skeleton during roster reload, tap to cycle status on rendered rows */}
      {loadingRoster ? (
        <div className="space-y-1.5">
          {Array.from({ length: lastLoadedCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border border-border rounded-lg">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : rosterError ? (
        <div data-empty-state="roster-error"><EmptyState icon={Users} title="Data siswa tidak bisa dimuat" description="Periksa koneksi, lalu coba lagi." /><div className="mt-4 text-center"><Button variant="outline" onClick={loadStudents}>Coba lagi</Button></div></div>
      ) : students.length === 0 ? (
        <div data-empty-state="no-students">
          <EmptyState icon={Users} title="Belum ada siswa di kelas ini" description="Minta admin untuk mendaftarkan siswa ke kelas ini." />
        </div>
      ) : (
        <div className="space-y-1.5">
          {students.map((s) => {
            const status = statuses[s.student.id] ?? "PRESENT";
            return (
              <div key={s.student.id}>
                <button
                  data-testid="roster-row"
                  onClick={() => cycleStatus(s.student.id)}
                  className={`w-full min-h-11 flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/20 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${ROW_TINT[status]}`}
                  aria-label={`${s.student.name} — ${status === "PRESENT" ? "Hadir" : status === "ABSENT" ? "Alpa" : status === "SICK" ? "Sakit" : "Izin"}. Ketuk untuk mengubah status.`}
                  aria-busy={saveState[s.student.id] === "saving" || undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${AVATAR_BG[status]}`}>
                      {status === "PRESENT" ? <Check size={14} /> : s.student.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.student.name}</p>
                      {s.student.nickname && <p className="text-xs text-muted-foreground">{s.student.nickname}</p>}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                  {saveState[s.student.id] ? <span className="text-xs text-muted-foreground" aria-hidden="true">{saveState[s.student.id] === "saving" ? "Menyimpan…" : saveState[s.student.id] === "saved" ? "Tersimpan" : "Ulangi"}</span> : null}
                  {saveState[s.student.id] ? <span className="sr-only" role="status">{saveState[s.student.id] === "saving" ? "Menyimpan absensi" : saveState[s.student.id] === "saved" ? "Absensi tersimpan" : "Absensi belum tersimpan"}</span> : null}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        Ketuk untuk mulai absensi (Hadir → Alpa → Sakit → Izin)
      </p>
    </div>
  );
}
