"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/page-header";
import { SaveStatus } from "@/components/portal/save-status";
import { Button } from "@/components/ui/button";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { resolveTeacherDate } from "@/lib/teacher/home-progress";

type Assignment = {
  id: string;
  classSection: { id: string; name: string; status?: string; academicYear?: {status: string}; program: { name: string }; campus: { name: string }; _count: { enrollments: number } };
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedClass = searchParams?.get("classId") ?? "";
  const requestedDate = searchParams?.get("date") ?? "";
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(resolveTeacherDate(requestedDate, getTodayInTimezone("Asia/Jakarta")));
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [lastLoadedCount, setLastLoadedCount] = useState(10);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const [rosterError, setRosterError] = useState(false);
  const rosterRequestId = useRef(0);
  const assignmentRequestId = useRef(0);
  const context = `${selectedClass}:${date}`;
  const contextToken = useMemo(() => ({context}), [context]);
  const activeContext = useRef<typeof contextToken | null>(contextToken);
  useEffect(() => { activeContext.current = contextToken; return () => { activeContext.current = null; }; }, [contextToken]);
  const confirmed = useRef<Record<string, Status>>({});
  const [confirmedStatuses, setConfirmedStatuses] = useState<Record<string, Status>>({});
  const [saveErrors,setSaveErrors] = useState<Record<string,string>>({});
  const [failedIntents, setFailedIntents] = useState<Record<string, Status>>({});
  const saveOperationIds = useRef<Record<string, number>>({});
  const saveQueues = useRef<Record<string, Promise<void> | undefined>>({});

  const loadAssignments = useCallback(async () => {
    const requestId = ++assignmentRequestId.current;
    setLoading(true); setAssignmentsError(false);
    try {
      const res = await fetch("/api/teaching-assignments/my");
      if (!res.ok) throw new Error("assignments");
      const data = await res.json();
      if (requestId !== assignmentRequestId.current) return;
      setAssignments(data);
      if (data.length > 0) {
        const validRequestedClass = data.some((a: Assignment) => a.classSection.id === requestedClass);
        const nextClass = validRequestedClass ? requestedClass : (data.find((a: Assignment) => a.classSection.status === "ACTIVE" && a.classSection.academicYear?.status === "ACTIVE") ?? data[0]).classSection.id;
        const nextDate = resolveTeacherDate(requestedDate, getTodayInTimezone("Asia/Jakarta"));
        setSelectedClass(nextClass); setDate(nextDate);
        if (nextClass !== requestedClass || nextDate !== requestedDate) router.replace(`/teacher/class-attendance?classId=${encodeURIComponent(nextClass)}&date=${nextDate}`, {scroll:false});
      }
    } catch {
      if (requestId !== assignmentRequestId.current) return;
      setAssignmentsError(true);
      toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
    } finally { if (requestId === assignmentRequestId.current) setLoading(false); }
  }, [requestedClass, requestedDate, router]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  // Load students when class or date changes
  const loadStudents = useCallback(async () => {
    if (!selectedClass) return;
    const requestId = ++rosterRequestId.current;
    setLoadingRoster(true);
    setSaveState({}); setFailedIntents({}); setSaveErrors({}); setConfirmedStatuses({});
    setRosterError(false);
    try {
    const res = await fetch(`/api/student-attendance?classSectionId=${selectedClass}&date=${date}`);
    if (!res.ok) throw new Error("roster");
    const data: StudentRecord[] = await res.json();
    if (requestId !== rosterRequestId.current) return;
    setStudents(data);
    setLastLoadedCount(data.length || 10);
    const initial: Record<string, Status> = {};
    for (const s of data) if (s.attendance && ROTATION.includes(s.attendance.status as Status)) initial[s.student.id] = s.attendance.status as Status;
    for (const [id, status] of Object.entries(initial)) confirmed.current[`${selectedClass}:${date}:${id}`] = status;
    setConfirmedStatuses(initial);
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

  // URL context survives reload/back. Only validated assigned classes are canonicalized.
  useEffect(() => {
    setDate(resolveTeacherDate(requestedDate, getTodayInTimezone("Asia/Jakarta")));
  }, [requestedDate]);
  function changeContext(nextClass: string, nextDate: string) {
    setSelectedClass(nextClass); setDate(nextDate);
    router.replace(`/teacher/class-attendance?classId=${encodeURIComponent(nextClass)}&date=${nextDate}`, {scroll:false});
  }

  function cycleStatus(studentId: string) {
    const current = statuses[studentId];
    persistStatus(studentId, current ? ROTATION[(ROTATION.indexOf(current) + 1) % ROTATION.length] : "PRESENT");
  }

  function persistStatus(studentId: string, next: Status) {
    const key = `${context}:${studentId}`;
    const operationId = (saveOperationIds.current[key] ?? 0) + 1;
    saveOperationIds.current[key] = operationId;
    const isCurrent = () => activeContext.current === contextToken && saveOperationIds.current[key] === operationId;
    setStatuses(prev => ({ ...prev, [studentId]: next }));
    setFailedIntents(prev => { const copy = { ...prev }; delete copy[studentId]; return copy; });
    setSaveState(prev => ({ ...prev, [studentId]: "saving" }));
    const save = async () => {
      try {
        const response = await fetch("/api/student-attendance/mark", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classSectionId: selectedClass, date, records: [{ studentId, status: next }] }),
        });
        if (!response.ok) { const body = await response.json().catch(()=>({})); throw Error(body.error || "Absensi belum tersimpan. Coba lagi ya."); }
        const body = await response.json();
        if (body.saved !== 1) throw Error("Absensi belum tersimpan. Coba lagi ya.");
        confirmed.current[key] = next;
        if (activeContext.current === contextToken) setConfirmedStatuses(prev => ({ ...prev, [studentId]: next }));
        if (isCurrent()) setSaveState(prev => ({ ...prev, [studentId]: "saved" }));
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : "Absensi belum tersimpan. Coba lagi ya.";
        setSaveErrors(prev=>({...prev,[studentId]:message}));
        setStatuses(prev => { const copy = { ...prev }; if (confirmed.current[key]) copy[studentId] = confirmed.current[key]; else delete copy[studentId]; return copy; });
        setFailedIntents(prev => ({ ...prev, [studentId]: next }));
        setSaveState(prev => ({ ...prev, [studentId]: "error" }));
        toast.error(message);
      }
    };
    const queued = (saveQueues.current[key] ?? Promise.resolve()).then(save, save);
    saveQueues.current[key] = queued;
    void queued.finally(() => { if (saveQueues.current[key] === queued) delete saveQueues.current[key]; });
  }

  const counts = {
    PRESENT: Object.values(confirmedStatuses).filter((s) => s === "PRESENT").length,
    ABSENT: Object.values(confirmedStatuses).filter((s) => s === "ABSENT").length,
    SICK: Object.values(confirmedStatuses).filter((s) => s === "SICK").length,
    PERMISSION: Object.values(confirmedStatuses).filter((s) => s === "PERMISSION").length,
  };

  // The header is rendered in every branch, including loading — it used to
  // appear only on the success path, so the h1 popped in after the fetch and
  // shifted the whole page down.
  if (loading) return (
    <div>
      <PageHeader title="Absensi kelas" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (assignments.length === 0 || assignmentsError) {
    return (
      <div data-empty-state={assignmentsError ? "assignments-error" : "no-class-assigned"}>
        <PageHeader title="Absensi kelas" />
        <EmptyState
          icon={Users}
          title={assignmentsError ? "Daftar kelas tidak bisa dimuat" : "Belum ditugaskan ke kelas"}
          description={assignmentsError ? "Periksa koneksi, lalu coba lagi." : "Hubungi admin untuk ditugaskan mengajar di kelas tertentu."}
          actionLabel={assignmentsError ? "Coba lagi" : undefined}
          onAction={assignmentsError ? loadAssignments : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Absensi kelas" />

      {/* Class + Date toolbar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="class-attendance-class" className="sr-only">
          Pilih kelas
        </label>
        <Select value={selectedClass} onValueChange={v => v && changeContext(v, date)} items={assignments.map(a => ({ label: `${a.classSection.name} — ${a.classSection.program.name}`, value: a.classSection.id }))}>
        <SelectTrigger id="class-attendance-class" className="tap-target w-full sm:flex-1">
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
        <Input id="class-attendance-date" type="date" value={date} onChange={e => { const valid = resolveTeacherDate(e.target.value, ""); if (valid) changeContext(selectedClass, valid); }} className="tap-target w-full sm:w-36" />
      </div>

      {/*
        Live summary quad. Colour is applied only to a non-zero count: four
        coloured figures with three of them reading "0" spent an Alpa-red
        signal on nothing at all, which is the same lesson #500 recorded for
        the parent Tagihan total.
      */}
      {!loadingRoster && !rosterError ? <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-sm">
        {(
          [
            ["Hadir", counts.PRESENT, "text-status-present-text"],
            ["Alpa", counts.ABSENT, "text-status-absent-text"],
            ["Sakit", counts.SICK, "text-status-late-text"],
            ["Izin", counts.PERMISSION, "text-status-leave-text"],
          ] as const
        ).map(([label, count, tone]) => (
          <span key={label} className={count > 0 ? tone : "text-muted-foreground"}>
            {label} {count}
          </span>
        ))}
      </div> : null}

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
        <div data-empty-state="roster-error">
          <EmptyState
            icon={Users}
            title="Data siswa tidak bisa dimuat"
            description="Periksa koneksi, lalu coba lagi."
            actionLabel="Coba lagi"
            onAction={loadStudents}
          />
        </div>
      ) : students.length === 0 ? (
        <div data-empty-state="no-students">
          <EmptyState icon={Users} title="Belum ada siswa di kelas ini" description="Minta admin untuk mendaftarkan siswa ke kelas ini." />
        </div>
      ) : (
        <div className="space-y-1.5">
          {students.map((s) => {
            const status = statuses[s.student.id];
            return (
              <div key={s.student.id}>
                <button
                  data-testid="roster-row"
                  onClick={() => cycleStatus(s.student.id)}
                  className={`w-full min-h-11 flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/20 transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${status ? ROW_TINT[status] : "bg-card"}`}
                  aria-label={`${s.student.name} — ${!status ? "Belum dicatat" : status === "PRESENT" ? "Hadir" : status === "ABSENT" ? "Alpa" : status === "SICK" ? "Sakit" : "Izin"}. ${status ? "Ketuk untuk mengubah status." : "Ketuk untuk mencatat Hadir."}`}
                  aria-busy={saveState[s.student.id] === "saving" || undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${status ? AVATAR_BG[status] : "bg-muted text-muted-foreground"}`}>
                      {status === "PRESENT" ? <Check size={14} /> : s.student.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.student.name}</p>
                      {s.student.nickname && <p className="text-xs text-muted-foreground">{s.student.nickname}</p>}
                    </div>
                  </div>
                  {status ? <StatusBadge status={status} /> : <span className="text-small text-muted-foreground">Belum dicatat</span>}
                </button>
                {saveState[s.student.id] ? <div className="flex items-center justify-between gap-2 px-3 py-2"><SaveStatus state={saveState[s.student.id]} message={saveState[s.student.id] === "saving" ? "Menyimpan absensi…" : saveState[s.student.id] === "saved" ? "Absensi tersimpan" : `Absensi belum tersimpan. ${saveErrors[s.student.id] ?? "Gunakan Coba lagi."}`} />{failedIntents[s.student.id] ? <Button variant="outline" className="min-h-11" onClick={() => persistStatus(s.student.id, failedIntents[s.student.id])}>Coba lagi</Button> : null}</div> : null}
              </div>
            );
          })}
        </div>
      )}

      {/*
        Was "Ketuk untuk mulai absensi" — tapping a row changes that student's
        status, it does not start anything. And the roster auto-saves, which
        the teacher had no way to know.
      */}
      <p className="text-xs text-muted-foreground text-center mt-4">
        Ketuk siswa yang belum dicatat untuk menyimpan Hadir. Ketuk lagi untuk mengganti status (Hadir → Alpa → Sakit → Izin). Angka di atas menghitung absensi yang sudah tersimpan.
      </p>
    </div>
  );
}
