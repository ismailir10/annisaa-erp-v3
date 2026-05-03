import Link from "next/link";
import { Banknote, ClipboardList, CalendarOff, UserPlus, type LucideIcon } from "lucide-react";

type QuickAction = { label: string; href: string; icon: LucideIcon };

export function QuickActions({ canSeePayroll }: { canSeePayroll: boolean }) {
  const actions: QuickAction[] = [
    ...(canSeePayroll
      ? [{ label: "Jalankan Penggajian", href: "/admin/payroll?create=1", icon: Banknote }]
      : []),
    { label: "Lihat Kehadiran", href: "/admin/attendance", icon: ClipboardList },
    { label: "Pengajuan Cuti", href: "/admin/leave", icon: CalendarOff },
    { label: "Tambah Karyawan", href: "/admin/employees?create=1", icon: UserPlus },
  ];

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
