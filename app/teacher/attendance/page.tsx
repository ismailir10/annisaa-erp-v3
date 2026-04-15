"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AttendanceCalendar } from "@/components/attendance/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

export default function TeacherAttendancePage() {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/attendance/my?month=${month}&year=${year}`);
    if (!res.ok) { setLoading(false); return; }
    setRecords(await res.json());
    setLoading(false);
  }, [month, year]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleMonthChange(m: number, y: number) {
    setMonth(m);
    setYear(y);
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Kehadiran Saya</h1>

      {/* Cuti action card */}
      <Card
        className="p-4 mb-4 cursor-pointer hover:border-primary/30 transition-colors"
        onClick={() => router.push("/teacher/leave")}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarDays size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Lihat & Ajukan Cuti</p>
            <p className="text-xs text-muted-foreground">Kelola cuti dan izin Anda</p>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <AttendanceCalendar
          records={records}
          month={month}
          year={year}
          onMonthChange={handleMonthChange}
        />
      )}
    </div>
  );
}
