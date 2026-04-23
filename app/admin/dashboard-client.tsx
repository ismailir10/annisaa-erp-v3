"use client";

import { StatCard } from "@/components/admin/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Users, UserCheck, Clock, UserX, CalendarOff, Banknote, ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDate } from "@/lib/format";

type WeeklyTrend = { date: string; present: number; late: number; absent: number };

export function DashboardClient({
  totalEmployees,
  present,
  late,
  absent,
  pendingLeave,
  lastPayroll,
  weeklyTrend,
  canSeeSalary = true,
}: {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
  pendingLeave: number;
  lastPayroll: { period: string; status: string; employeeCount: number } | null;
  weeklyTrend: WeeklyTrend[];
  canSeeSalary?: boolean;
}) {
  const maxTrendValue = Math.max(...weeklyTrend.map((d) => d.present + d.late + d.absent), 1);

  return (
    <div className="space-y-section">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Karyawan" value={totalEmployees} sublabel="aktif" icon={Users} color="primary" index={0} />
        <StatCard label="Hadir Hari Ini" value={present} sublabel={`dari ${totalEmployees}`} icon={UserCheck} color="success" index={1} />
        <StatCard label="Terlambat" value={late} icon={Clock} color="warning" index={2} />
        <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={3} />
      </div>

      {/* Middle row: Attendance trend + Pending actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attendance trend chart */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="p-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Tren Kehadiran (7 Hari Terakhir)</h3>
              <Link href="/admin/attendance" className="text-xs text-primary hover:underline flex items-center gap-1">
                Lihat detail <ArrowRight size={12} />
              </Link>
            </div>
            <div className="flex items-end gap-1.5 h-32">
              {weeklyTrend.map((day, i) => {
                const total = day.present + day.late + day.absent;
                const presentH = total > 0 ? (day.present / maxTrendValue) * 100 : 0;
                const lateH = total > 0 ? (day.late / maxTrendValue) * 100 : 0;
                const absentH = total > 0 ? (day.absent / maxTrendValue) * 100 : 0;
                const dayLabel = formatDate(day.date, { weekday: "short" });

                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-24">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${absentH}%` }}
                        transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
                        className="w-full max-w-8 bg-status-absent/20 rounded-t-sm"
                        title={`Tidak hadir: ${day.absent}`}
                      />
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${lateH}%` }}
                        transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
                        className="w-full max-w-8 bg-status-late/30"
                        title={`Terlambat: ${day.late}`}
                      />
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${presentH}%` }}
                        transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
                        className="w-full max-w-8 bg-status-present rounded-b-sm"
                        title={`Hadir: ${day.present}`}
                      />
                    </div>
                    <span className="text-caption text-muted-foreground">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-present" /> Hadir</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-late/60" /> Terlambat</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-absent/40" /> Tidak Hadir</span>
            </div>
          </Card>
        </motion.div>

        {/* Pending actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-card h-full flex flex-col">
            <h3 className="text-sm font-semibold mb-4">Perlu Tindakan</h3>
            <div className="flex-1 space-y-3">
              {/* Pending leave */}
              <Link href="/admin/leave" className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                    <CalendarOff size={16} className="text-warning" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">Pengajuan Cuti</p>
                    <p className="text-xs text-muted-foreground">Menunggu persetujuan</p>
                  </div>
                </div>
                {pendingLeave > 0 ? (
                  <Badge className="bg-warning text-white text-xs">{pendingLeave}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">0</span>
                )}
              </Link>

              {/* Last payroll — hidden for SCHOOL_ADMIN */}
              {canSeeSalary && (
              <Link href="/admin/payroll" className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Banknote size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">Penggajian Terakhir</p>
                    <p className="text-xs text-muted-foreground">
                      {lastPayroll ? lastPayroll.period : "Belum ada"}
                    </p>
                  </div>
                </div>
                {lastPayroll && <StatusBadge status={lastPayroll.status} />}
              </Link>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            ...(canSeeSalary ? [{ label: "Jalankan Penggajian", href: "/admin/payroll/new", emoji: "💰" }] : []),
            { label: "Lihat Kehadiran", href: "/admin/attendance", emoji: "📋" },
            { label: "Pengajuan Cuti", href: "/admin/leave", emoji: "📝" },
            { label: "Tambah Karyawan", href: "/admin/employees/new", emoji: "👤" },
          ].map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.06, duration: 0.3 }}
            >
              <Link
                href={action.href}
                className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <span className="text-lg">{action.emoji}</span>
                <span className="text-xs font-medium group-hover:text-primary transition-colors">
                  {action.label}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
