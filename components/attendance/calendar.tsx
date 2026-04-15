"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatTime } from "@/lib/format";

type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: "bg-status-present", text: "text-white", label: "Hadir" },
  LATE: { bg: "bg-status-late", text: "text-white", label: "Terlambat" },
  ABSENT: { bg: "bg-status-absent", text: "text-white", label: "Tidak Hadir" },
  LEAVE: { bg: "bg-status-leave", text: "text-white", label: "Izin" },
  HOLIDAY: { bg: "bg-status-holiday", text: "text-white", label: "Libur" },
  HALF_DAY: { bg: "bg-status-late", text: "text-white", label: "Setengah Hari" },
  PRESENT_NO_CHECKOUT: { bg: "bg-status-late", text: "text-white", label: "Hadir Tanpa Pulang" },
};

// Status colors for text display (modal, summary)
const STATUS_TEXT_COLORS: Record<string, string> = {
  PRESENT: "text-status-present-text",
  LATE: "text-status-late-text",
  ABSENT: "text-status-absent-text",
  LEAVE: "text-status-leave-text",
  HOLIDAY: "text-status-holiday-text",
  HALF_DAY: "text-status-late-text",
  PRESENT_NO_CHECKOUT: "text-status-late-text",
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function AttendanceCalendar({
  records,
  month,
  year,
  onMonthChange,
}: {
  records: AttendanceRecord[];
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<AttendanceRecord | null>(null);

  const recordMap = new Map<string, AttendanceRecord>();
  for (const r of records) {
    recordMap.set(r.date, r);
  }

  // Calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;

  function prevMonth() {
    if (month === 1) onMonthChange(12, year - 1);
    else onMonthChange(month - 1, year);
  }
  function nextMonth() {
    if (month === 12) onMonthChange(1, year + 1);
    else onMonthChange(month + 1, year);
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  // Summary
  const summary = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const r of records) {
    if (r.status === "PRESENT" || r.status === "PRESENT_NO_CHECKOUT") summary.present++;
    else if (r.status === "LATE") summary.late++;
    else if (r.status === "ABSENT") summary.absent++;
    else if (r.status === "LEAVE") summary.leave++;
  }

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const record = recordMap.get(dateStr);
          const dow = new Date(year, month - 1, day).getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isToday = isCurrentMonth && day === today.getDate();
          const statusColor = record ? STATUS_COLORS[record.status] : null;

          return (
            <button
              key={i}
              onClick={() => record && setSelectedDay(record)}
              className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium relative transition-colors ${
                statusColor
                  ? `${statusColor.bg} ${statusColor.text}`
                  : isWeekend
                  ? "bg-muted/50 text-muted-foreground"
                  : "text-foreground hover:bg-accent"
              } ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-[10px]">
        {Object.entries(STATUS_COLORS).slice(0, 5).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm ${val.bg}`} />
            <span className="text-muted-foreground">{val.label}</span>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mt-4 bg-card border border-border rounded-xl p-3">
        {[
          { label: "Hadir", value: summary.present, color: "text-status-present" },
          { label: "Terlambat", value: summary.late, color: "text-status-late" },
          { label: "Tidak Hadir", value: summary.absent, color: "text-destructive" },
          { label: "Izin", value: summary.leave, color: "text-status-leave" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className={`font-currency text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Day detail modal */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedDay(null)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl p-5 w-full max-w-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  {new Date(selectedDay.date + "T00:00:00").toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-accent">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-medium ${STATUS_TEXT_COLORS[selectedDay.status] ?? "text-foreground"}`}>
                    {STATUS_COLORS[selectedDay.status]?.label ?? selectedDay.status}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Masuk</span>
                  <span className="font-currency font-medium">{formatTime(selectedDay.checkInTime)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pulang</span>
                  <span className="font-currency font-medium">{formatTime(selectedDay.checkOutTime)}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
