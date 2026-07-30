import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card data-testid="pending-actions">
      <CardHeader className="border-b">
        <CardTitle>Perlu Tindakan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
              // Subtle bg + darker text (StatusBadge pattern) — bg-warning/text-primary-foreground
              // (white on #FF8C00) was ~2.34:1, fails WCAG AA 4.5:1 (finding F2).
              <Badge className="bg-status-late-subtle text-status-late-text text-xs">{pendingLeave}</Badge>
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
                <p className="text-xs text-muted-foreground">Pertanyaan baru menunggu ditindaklanjuti</p>
              </div>
            </div>
            {pendingAdmissions > 0 ? (
              // Subtle bg + darker text — same contrast fix as the leave-count badge above,
              // reusing the existing secondary (light-teal) token pairing (finding F2).
              <Badge className="bg-secondary text-secondary-foreground text-xs">{pendingAdmissions}</Badge>
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
      </CardContent>
    </Card>
  );
}
