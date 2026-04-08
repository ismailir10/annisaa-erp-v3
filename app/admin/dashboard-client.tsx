"use client";

import { StatCard } from "@/components/admin/stat-card";
import { Users, UserCheck, Clock, UserX } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export function DashboardClient({
  totalEmployees,
  present,
  late,
  absent,
}: {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
}) {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Karyawan"
          value={totalEmployees}
          sublabel="aktif"
          icon={Users}
          color="primary"
          index={0}
        />
        <StatCard
          label="Hadir Hari Ini"
          value={present}
          sublabel={`dari ${totalEmployees}`}
          icon={UserCheck}
          color="success"
          index={1}
        />
        <StatCard
          label="Terlambat"
          value={late}
          icon={Clock}
          color="warning"
          index={2}
        />
        <StatCard
          label="Tidak Hadir"
          value={absent}
          icon={UserX}
          color="error"
          index={3}
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Aksi Cepat
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Jalankan Penggajian", href: "/admin/payroll", emoji: "💰" },
            { label: "Lihat Kehadiran", href: "/admin/attendance", emoji: "📋" },
            { label: "Tambah Karyawan", href: "/admin/employees", emoji: "👤" },
          ].map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08, duration: 0.3 }}
            >
              <Link
                href={action.href}
                className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <span className="text-xl">{action.emoji}</span>
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
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
