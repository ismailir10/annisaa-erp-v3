import Link from "next/link";
import { Banknote, ClipboardList, CalendarOff, UserPlus, type LucideIcon } from "lucide-react";

type QuickAction = { label: string; href: string; icon: LucideIcon };

export function QuickActions({
  canSeePayroll,
  canSeeHr,
}: {
  canSeePayroll: boolean;
  canSeeHr: boolean;
}) {
  // /admin/payroll lives inside the (hr) route group, so even a custom role
  // with `payroll.view` will hit the `assertPermission("hr.view")` layout gate
  // and bounce. Require both, otherwise the tile is a dead link.
  const actions: QuickAction[] = [
    ...(canSeeHr && canSeePayroll
      ? [{ label: "Jalankan Penggajian", href: "/admin/payroll?create=1", icon: Banknote }]
      : []),
    ...(canSeeHr
      ? [
          { label: "Lihat Kehadiran", href: "/admin/employee-attendance", icon: ClipboardList },
          { label: "Pengajuan Cuti", href: "/admin/leave-requests", icon: CalendarOff },
          { label: "Tambah Karyawan", href: "/admin/employees?create=1", icon: UserPlus },
        ]
      : []),
  ];

  if (actions.length === 0) return null;

  return (
    <div data-testid="quick-actions">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Aksi Cepat
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Icon size={18} />
              </span>
              <span className="text-xs font-medium group-hover:text-primary transition-colors">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
