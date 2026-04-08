"use client";

import { useEffect, useState, useCallback } from "react";
import { AttendanceCalendar } from "@/components/attendance/calendar";

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

export default function TeacherAttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/attendance/my?month=${month}&year=${year}`);
    setRecords(await res.json());
    setLoading(false);
  }, [month, year]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleMonthChange(m: number, y: number) {
    setMonth(m);
    setYear(y);
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Kehadiran Saya</h1>
      {loading ? (
        <div className="animate-pulse h-80 bg-card rounded-xl" />
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
