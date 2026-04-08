"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { OverrideModal } from "@/components/attendance/override-modal";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import Link from "next/link";

type MonthlyData = {
  employee: { id: string; kode: string; nama: string; campusName: string };
  records: { id: string; date: string; status: string; checkInTime: string | null; checkOutTime: string | null; isLocked: boolean }[];
  summary: { present: number; late: number; absent: number; leave: number };
};

type Campus = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-[#00B37E]",
  LATE: "bg-[#FF8C00]",
  ABSENT: "bg-[#FF3B3B]",
  LEAVE: "bg-[#0EA5E9]",
  HOLIDAY: "bg-[#8B5CF6]",
  HALF_DAY: "bg-[#FFB020]",
  PRESENT_NO_CHECKOUT: "bg-[#FFB020]",
};

export default function MonthlyAttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [campusId, setCampusId] = useState("all");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{
    recordId: string | null; employeeId: string; employeeName: string;
    date: string; currentStatus: string | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: String(month), year: String(year), campusId });
    const [attRes, campRes] = await Promise.all([
      fetch(`/api/attendance/monthly?${params}`),
      fetch("/api/config/campuses"),
    ]);
    setData(await attRes.json());
    setCampuses(await campRes.json());
    setLoading(false);
  }, [month, year, campusId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function handleCellClick(emp: MonthlyData, day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const record = emp.records.find((r) => r.date === dateStr);
    if (record?.isLocked) return;
    setOverrideTarget({
      recordId: record?.id ?? null,
      employeeId: emp.employee.id,
      employeeName: emp.employee.nama,
      date: dateStr,
      currentStatus: record?.status ?? null,
    });
    setOverrideOpen(true);
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/attendance" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Kembali ke Harian
        </Link>
      </div>
      <PageHeader title="Kehadiran Bulanan" description="Klik sel untuk override" />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-accent"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold w-40 text-center capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-accent"><ChevronRight size={16} /></button>
        <Select value={campusId} onValueChange={(v) => v && setCampusId(v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Semua" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kampus</SelectItem>
            {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="animate-pulse h-96 bg-card rounded-xl" />
      ) : (
        <div className="overflow-x-auto bg-card border border-border rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card z-10 text-left px-3 py-2 font-semibold text-muted-foreground w-40">Nama</th>
                {days.map((d) => {
                  const dow = new Date(year, month - 1, d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={d} className={`px-1 py-2 font-medium text-center w-7 ${isWeekend ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                      {d}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground">H</th>
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground">T</th>
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground">A</th>
                <th className="px-2 py-2 text-center font-semibold text-muted-foreground">I</th>
              </tr>
            </thead>
            <tbody>
              {data.map((emp) => {
                const recordMap = new Map(emp.records.map((r) => [r.date, r]));
                return (
                  <tr key={emp.employee.id} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="sticky left-0 bg-card z-10 px-3 py-1.5 font-medium truncate max-w-[160px]">
                      {emp.employee.nama}
                    </td>
                    {days.map((d) => {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      const record = recordMap.get(dateStr);
                      const dow = new Date(year, month - 1, d).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <td key={d} className="px-0.5 py-1 text-center">
                          <button
                            onClick={() => handleCellClick(emp, d)}
                            className={`w-5 h-5 rounded-sm inline-block ${
                              record ? STATUS_COLORS[record.status] ?? "bg-muted" : isWeekend ? "bg-muted/30" : ""
                            } ${record?.isLocked ? "opacity-50 cursor-not-allowed" : "hover:ring-1 hover:ring-primary cursor-pointer"}`}
                            title={record ? record.status : isWeekend ? "Akhir Pekan" : "Tidak ada data"}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-currency text-[#00B37E]">{emp.summary.present}</td>
                    <td className="px-2 py-1 text-center font-currency text-[#FF8C00]">{emp.summary.late}</td>
                    <td className="px-2 py-1 text-center font-currency text-[#FF3B3B]">{emp.summary.absent}</td>
                    <td className="px-2 py-1 text-center font-currency text-[#0EA5E9]">{emp.summary.leave}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px]">
        {Object.entries(STATUS_COLORS).slice(0, 5).map(([key, bg]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${bg}`} />
            <span className="text-muted-foreground">{key}</span>
          </div>
        ))}
      </div>

      {overrideTarget && (
        <OverrideModal
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          recordId={overrideTarget.recordId}
          employeeId={overrideTarget.employeeId}
          employeeName={overrideTarget.employeeName}
          date={overrideTarget.date}
          currentStatus={overrideTarget.currentStatus}
          onSuccess={fetchData}
        />
      )}
    </>
  );
}
