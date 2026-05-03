import { StatCard } from "@/components/admin/stat-card";
import { Users, UserCheck, Clock, UserX } from "lucide-react";

export function StatGrid({
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Total Karyawan" value={totalEmployees} sublabel="aktif" icon={Users} color="primary" index={0} />
      <StatCard label="Hadir Hari Ini" value={present} sublabel={`dari ${totalEmployees}`} icon={UserCheck} color="success" index={1} />
      <StatCard label="Terlambat" value={late} icon={Clock} color="warning" index={2} />
      <StatCard label="Tidak Hadir" value={absent} icon={UserX} color="error" index={3} />
    </div>
  );
}
