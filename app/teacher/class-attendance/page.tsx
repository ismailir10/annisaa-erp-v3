"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Assignment = {
  id: string;
  classSection: { id: string; name: string; program: { name: string }; campus: { name: string }; _count: { enrollments: number } };
};

type StudentRecord = {
  student: { id: string; name: string; nickname: string | null; gender: string | null };
  attendance: { status: string; notes: string | null } | null;
};

export default function ClassAttendancePage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load teacher's assigned classes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetch("/api/teaching-assignments/my").then(r => r.json()).then(d => {
      setAssignments(d);
      if (d.length > 0) setSelectedClass(d[0].classSection.id);
      setLoading(false);
    });
  }, []);

  // Load students when class or date changes
  const loadStudents = useCallback(async () => {
    if (!selectedClass) return;
    const res = await fetch(`/api/student-attendance?classSectionId=${selectedClass}&date=${date}`);
    const data: StudentRecord[] = await res.json();
    setStudents(data);
    // Initialize statuses from existing records
    const initial: Record<string, string> = {};
    for (const s of data) {
      initial[s.student.id] = s.attendance?.status ?? "PRESENT";
    }
    setStatuses(initial);
  }, [selectedClass, date]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (selectedClass) loadStudents(); }, [selectedClass, date, loadStudents]);

  function toggleStatus(studentId: string) {
    setStatuses(prev => {
      const current = prev[studentId] ?? "PRESENT";
      const order = ["PRESENT", "ABSENT", "SICK", "PERMISSION"];
      const next = order[(order.indexOf(current) + 1) % order.length];
      return { ...prev, [studentId]: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    const records = students.map(s => ({
      studentId: s.student.id,
      status: statuses[s.student.id] ?? "PRESENT",
    }));

    const res = await fetch("/api/student-attendance/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classSectionId: selectedClass, date, records }),
    });

    if (res.ok) {
      const d = await res.json();
      toast.success(`Kehadiran ${d.saved} siswa berhasil disimpan`);
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  const presentCount = Object.values(statuses).filter(s => s === "PRESENT").length;
  const absentCount = Object.values(statuses).filter(s => s === "ABSENT").length;

  if (loading) return <div className="px-5 pt-6"><div className="animate-pulse h-40 bg-card rounded-xl" /></div>;

  if (assignments.length === 0) {
    return (
      <div className="px-5 pt-6">
        <EmptyState icon={Users} title="Belum ditugaskan ke kelas" description="Hubungi admin untuk ditugaskan mengajar di kelas tertentu." />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Absensi Kelas</h1>

      {/* Class + Date selector */}
      <div className="flex gap-2 mb-4">
        <Select value={selectedClass} onValueChange={v => v && setSelectedClass(v)}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
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

      {/* Summary */}
      <div className="flex gap-3 mb-4">
        <Card className="p-3 flex-1 text-center">
          <p className="font-currency text-xl font-bold text-[#00B37E]">{presentCount}</p>
          <p className="text-[10px] text-muted-foreground">Hadir</p>
        </Card>
        <Card className="p-3 flex-1 text-center">
          <p className="font-currency text-xl font-bold text-[#FF3B3B]">{absentCount}</p>
          <p className="text-[10px] text-muted-foreground">Tidak Hadir</p>
        </Card>
        <Card className="p-3 flex-1 text-center">
          <p className="font-currency text-xl font-bold">{students.length}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </Card>
      </div>

      {/* Student list */}
      {students.length === 0 ? (
        <EmptyState icon={Users} title="Belum ada siswa di kelas ini" description="Minta admin untuk mendaftarkan siswa ke kelas ini." />
      ) : (
        <div className="space-y-1.5">
          {students.map((s, i) => {
            const status = statuses[s.student.id] ?? "PRESENT";
            return (
              <motion.div key={s.student.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <button
                  onClick={() => toggleStatus(s.student.id)}
                  className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/20 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      status === "PRESENT" ? "bg-[#00B37E]" : status === "ABSENT" ? "bg-[#FF3B3B]" : status === "SICK" ? "bg-[#FF8C00]" : "bg-[#0EA5E9]"
                    }`}>
                      {status === "PRESENT" ? <Check size={14} /> : s.student.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.student.name}</p>
                      {s.student.nickname && <p className="text-[10px] text-muted-foreground">{s.student.nickname}</p>}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Save button */}
      {students.length > 0 && (
        <div className="mt-4 sticky bottom-20 z-10">
          <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
            <Save size={16} className="mr-2" /> {saving ? "Menyimpan..." : "Simpan Kehadiran"}
          </Button>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-3">
        Ketuk nama siswa untuk mengubah status (Hadir → Tidak Hadir → Sakit → Izin)
      </p>
    </div>
  );
}
