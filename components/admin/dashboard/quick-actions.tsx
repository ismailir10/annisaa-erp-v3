import Link from "next/link";

export function QuickActions({ canSeePayroll }: { canSeePayroll: boolean }) {
  const actions = [
    ...(canSeePayroll
      ? [{ label: "Jalankan Penggajian", href: "/admin/payroll?create=1", emoji: "💰" }]
      : []),
    { label: "Lihat Kehadiran", href: "/admin/attendance", emoji: "📋" },
    { label: "Pengajuan Cuti", href: "/admin/leave", emoji: "📝" },
    { label: "Tambah Karyawan", href: "/admin/employees?create=1", emoji: "👤" },
  ];

  return (
    <div>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Aksi Cepat
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
          >
            <span className="text-lg">{action.emoji}</span>
            <span className="text-xs font-medium group-hover:text-primary transition-colors">
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
