"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { OverrideModal } from "@/components/attendance/override-modal";
import { UserCheck, Clock, UserX, CalendarDays, Pencil, Download } from "lucide-react";
import { motion } from "framer-motion";

type EmployeeAttendance = {
  employee: { id: string; kode: string; nama: string; jabatan: string; campusName: string };
  attendance: {
    id: string; status: string; checkInTime: string | null; checkOutTime: string | null;
    isManualOverride: boolean; isLocked: boolean;
  } | null;
};

type Campus = { id: string; name: string };

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  PRESENT: { label: "Hadir", class: "bg-status-present-subtle text-[#00875A]" },
  LATE: { label: "Terlambat", class: "bg-status-late-subtle text-[#B35C00]" },
  ABSENT: { label: "Tidak Hadir", class: "bg-status-absent-subtle text-[#CC0000]" },
  LEAVE: { label: "Izin", class: "bg-status-leave-subtle text-[#0369A1]" },
  HALF_DAY: { label: "½ Hari", class: "bg-status-late-subtle text-[#B35C00]" },
  PRESENT_NO_CHECKOUT: { label: "No Checkout", class: "bg-status-no-checkout-subtle text-[#B35C00]" },
};

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [campusId, setCampusId] = useState("all");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [data, setData] = useState<EmployeeAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Override modal
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{
    recordId: string | null;
    employeeId: string;
    employeeName: string;
    currentStatus: string | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date, campusId });
    const [attRes, campRes] = await Promise.all([
      fetch(`/api/attendance/today?${params}`),
      fetch("/api/config/campuses"),
    ]);
    setData(await attRes.json());
    setCampuses(await campRes.json());
    setLoading(false);
  }, [date, campusId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  const present = data.filter((d) => ["PRESENT", "LATE", "PRESENT_NO_CHECKOUT"].includes(d.attendance?.status ?? "")).length;
  const late = data.filter((d) => d.attendance?.status === "LATE").length;
  const absent = data.filter((d) => !d.attendance).length;
  const leave = data.filter((d) => d.attendance?.status === "LEAVE").length;

  function openOverride(ea: EmployeeAttendance) {
    setOverrideTarget({
      recordId: ea.attendance?.id ?? null,
      employeeId: ea.employee.id,
      employeeName: ea.employee.nama,
      currentStatus: ea.attendance?.status ?? null,
    });
    setOverrideOpen(true);
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <>
      <PageHeader
        title="Kehadiran Hari Ini"
        description={new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/attendance/export?month=${new Date(date).getMonth() + 1}&year=${new Date(date).getFullYear()}`, "_blank")}>
              <Download size={14} className="mr-1.5" /> Ekspor CSV
            </Button>
            <Link href="/admin/attendance/monthly">
              <Button variant="outline" size="sm"><CalendarDays size={14} className="mr-1.5" /> Bulanan</Button>
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Select value={campusId} onValueChange={(v) => v && setCampusId(v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Semua Kampus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kampus</SelectItem>
            {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Hadir" value={present} icon={UserCheck} color="success" index={0} />
        <StatCard label="Terlambat" value={late} icon={Clock} color="warning" index={1} />
        <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={2} />
        <StatCard label="Izin" value={leave} icon={CalendarDays} color="primary" index={3} />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 bg-card rounded-lg animate-pulse" />)}</div>
      ) : (
        <div className="space-y-1">
          {data.map((ea, i) => (
            <motion.div
              key={ea.employee.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary text-xs font-bold">{ea.employee.nama[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ea.employee.nama}</p>
                  <p className="text-[10px] text-muted-foreground">{ea.employee.campusName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-currency text-xs text-muted-foreground hidden sm:block">
                  {formatTime(ea.attendance?.checkInTime ?? null)}
                </span>
                {ea.attendance ? (
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_LABELS[ea.attendance.status]?.class ?? ""}`}>
                    {STATUS_LABELS[ea.attendance.status]?.label ?? ea.attendance.status}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">—</Badge>
                )}
                <span className="font-currency text-xs text-muted-foreground hidden sm:block">
                  {formatTime(ea.attendance?.checkOutTime ?? null)}
                </span>
                <button
                  onClick={() => openOverride(ea)}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Ubah Status Kehadiran"
                >
                  <Pencil size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Override Modal */}
      {overrideTarget && (
        <OverrideModal
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          recordId={overrideTarget.recordId}
          employeeId={overrideTarget.employeeId}
          employeeName={overrideTarget.employeeName}
          date={date}
          currentStatus={overrideTarget.currentStatus}
          onSuccess={fetchData}
        />
      )}
    </>
  );
}
