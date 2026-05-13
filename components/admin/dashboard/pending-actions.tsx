import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarOff, Banknote, UserPlus } from "lucide-react";

export function PendingActions({
  pendingLeave,
  pendingAdmissions,
  lastPayroll,
  canSeePayroll,
  canSeeAdmissions,
  canSeeLeave,
}: {
  pendingLeave: number;
  pendingAdmissions: number;
  lastPayroll: { period: string; status: string; employeeCount: number } | null;
  canSeePayroll: boolean;
  canSeeAdmissions: boolean;
  canSeeLeave: boolean;
}) {
  return (
    <Card data-testid="pending-actions" className="p-card flex flex-col">
      <h3 className="text-sm font-semibold mb-4">Perlu Tindakan</h3>
      <div className="flex-1 space-y-3">
        {canSeeLeave && (
          <Link
            href="/admin/leave-requests"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
          >
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
              <Badge className="bg-warning text-primary-foreground text-xs">{pendingLeave}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">0</span>
            )}
          </Link>
        )}

        {canSeeAdmissions && (
          <Link
            href="/admin/admissions"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserPlus size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">Pendaftaran Baru</p>
                <p className="text-xs text-muted-foreground">Inquiry menunggu tindak lanjut</p>
              </div>
            </div>
            {pendingAdmissions > 0 ? (
              <Badge className="bg-primary text-primary-foreground text-xs">{pendingAdmissions}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">0</span>
            )}
          </Link>
        )}

        {canSeePayroll && (
          <Link
            href="/admin/payroll"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
          >
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
  );
}
