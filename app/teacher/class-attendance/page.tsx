"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
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

  // Load teacher's assigned classes
  useEffect(() => {
    fetch("/api/teaching-assignments/my")
      .then((r) => {
        if (!r.ok) {
          toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
          setLoading(false);
          return;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setAssignments(d);
        if (d.length > 0) setSelectedClass(d[0].classSection.id);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Daftar kelas tidak bisa dimuat. Coba lagi sebentar ya.");
        setLoading(false);
      });
  }, []);

  // Load students when class or date changes
  const loadStudents = useCallback(async () => {
    if (!selectedClass) return;
    const res = await fetch(`/api/student-attendance?classSectionId=${selectedClass}&date=${date}`);
    if (!res.ok) {
      toast.error("Data siswa tidak bisa dimuat. Coba lagi sebentar ya.");
      return;
    }
    const data: StudentRecord[] = await res.json();
    setStudents(data);
    // Initialize statuses from existing records — default PRESENT (common case)
    const initial: Record<string, Status> = {};
    for (const s of data) {
      initial[s.student.id] = (s.attendance?.status as Status) ?? "PRESENT";
    }
    setStatuses(initial);
  }, [selectedClass, date]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedClass) loadStudents(); }, [selectedClass, date, loadStudents]);

  // Cycle-tap: PRESENT → ABSENT → SICK → PERMISSION. Optimistic save on every tap.
  async function cycleStatus(studentId: string) {
    const current = statuses[studentId] ?? "PRESENT";
    const next = ROTATION[(ROTATION.indexOf(current) + 1) % ROTATION.length];
    const previous = current;

    // Optimistic update
    setStatuses((prev) => ({ ...prev, [studentId]: next }));

    try {
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
        setStatuses((prev) => ({ ...prev, [studentId]: previous }));
        toast.error(d?.error || "Absensi tidak tersimpan. Coba ketuk ulang ya.");
      }
    } catch {
      setStatuses((prev) => ({ ...prev, [studentId]: previous }));
      toast.error("Koneksi terputus. Coba lagi sebentar ya.");
    }
  }

  const counts = {
    PRESENT: Object.values(statuses).filter((s) => s === "PRESENT").length,
    ABSENT: Object.values(statuses).filter((s) => s === "ABSENT").length,
    SICK: Object.values(statuses).filter((s) => s === "SICK").length,
    PERMISSION: Object.values(statuses).filter((s) => s === "PERMISSION").length,
  };

  if (loading) return (
    <div className="px-5 pt-6">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (assignments.length === 0) {
    return (
      <div className="px-5 pt-6">
        <EmptyState icon={Users} title="Belum ditugaskan ke kelas" description="Hubungi admin untuk ditugaskan mengajar di kelas tertentu." />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <PageHeader title="Absensi Kelas" />

      {/* Class + Date toolbar */}
      <div className="flex gap-2 mb-4">
        <Select value={selectedClass} onValueChange={v => v && setSelectedClass(v)} items={assignments.map(a => ({ label: `${a.classSection.name} — ${a.classSection.program.name}`, value: a.classSection.id }))}>
          <SelectTrigger className="flex-1">
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
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-36" />
      </div>

      {/* Live summary trio (quad — includes Izin) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-sm">
        <span className="text-status-present-text">Hadir {counts.PRESENT}</span>
        <span className="text-status-absent-text">Alpa {counts.ABSENT}</span>
        <span className="text-status-late-text">Sakit {counts.SICK}</span>
        <span className="text-status-leave-text">Izin {counts.PERMISSION}</span>
      </div>

      {/* Student list — tap to cycle status (save on every tap) */}
      {students.length === 0 ? (
        <EmptyState icon={Users} title="Belum ada siswa di kelas ini" description="Minta admin untuk mendaftarkan siswa ke kelas ini." />
      ) : (
        <div className="space-y-1.5">
          {students.map((s, i) => {
            const status = statuses[s.student.id] ?? "PRESENT";
            return (
              <motion.div key={s.student.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <button
                  onClick={() => cycleStatus(s.student.id)}
                  className={`w-full flex items-center justify-between p-3 border border-border rounded-lg hover:border-primary/20 transition-colors text-left ${ROW_TINT[status]}`}
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
                </button>
              </motion.div>
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
