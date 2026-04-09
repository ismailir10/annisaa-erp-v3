import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import { formatDateShort, formatTime } from "@/lib/format";

export default async function ParentAttendancePage() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const guardian = await prisma.guardian.findFirst({ where: { email: session.email } });
  if (!guardian) redirect("/parent");

  // Last 30 days of attendance
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split("T")[0];

  const records = await prisma.studentAttendance.findMany({
    where: { studentId: guardian.studentId, date: { gte: startDate } },
    orderBy: { date: "desc" },
  });

  const presentCount = records.filter(r => r.status === "PRESENT").length;
  const absentCount = records.filter(r => ["ABSENT", "SICK", "PERMISSION"].includes(r.status)).length;

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">Kehadiran Anak</h1>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-3 text-center">
          <p className="font-currency text-xl font-bold text-[#00B37E]">{presentCount}</p>
          <p className="text-[10px] text-muted-foreground">Hadir</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-currency text-xl font-bold text-[#FF3B3B]">{absentCount}</p>
          <p className="text-[10px] text-muted-foreground">Tidak Hadir</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="font-currency text-xl font-bold">{records.length}</p>
          <p className="text-[10px] text-muted-foreground">Total Hari</p>
        </Card>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Belum ada data kehadiran" description="Data kehadiran akan muncul setelah guru mencatat absensi." />
      ) : (
        <div className="space-y-1">
          {records.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{formatDateShort(r.date)}</p>
                {r.checkInTime && (
                  <p className="text-[10px] text-muted-foreground font-currency">
                    Masuk: {formatTime(r.checkInTime.toISOString())}
                    {r.checkOutTime && ` · Pulang: ${formatTime(r.checkOutTime.toISOString())}`}
                  </p>
                )}
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
              </div>
              <StatusBadge status={r.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
