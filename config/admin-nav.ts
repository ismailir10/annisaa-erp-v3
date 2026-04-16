import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarOff,
  Banknote,
  CalendarDays,
  GraduationCap,
  UserPlus,
  Coins,
  Receipt,
  Building2,
  Clock,
  Shield,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchExact?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type NavConfig = {
  standalone: NavItem[];
  groups: NavGroup[];
  settings: NavItem[];
};

export const adminNav: NavConfig = {
  standalone: [
    {
      label: "Dashboard",
      href: "/admin",
      icon: LayoutDashboard,
      matchExact: true,
    },
  ],

  groups: [
    {
      id: "hr",
      label: "SDM",
      icon: Users,
      items: [
        { label: "Karyawan", href: "/admin/employees", icon: Users },
        { label: "Kehadiran", href: "/admin/attendance", icon: CalendarCheck },
        { label: "Pengajuan Cuti", href: "/admin/leave", icon: CalendarOff },
        { label: "Penggajian", href: "/admin/payroll", icon: Banknote },
      ],
    },
    {
      id: "academic",
      label: "Akademik",
      icon: GraduationCap,
      items: [
        { label: "Tahun Ajaran", href: "/admin/academic", icon: CalendarDays },
        { label: "Siswa", href: "/admin/students", icon: GraduationCap },
        { label: "Pendaftaran", href: "/admin/admissions", icon: UserPlus },
        { label: "Kehadiran Siswa", href: "/admin/student-attendance", icon: CalendarCheck },
        { label: "Template Penilaian", href: "/admin/assessment-templates", icon: ClipboardList },
      ],
    },
    {
      id: "finance",
      label: "Keuangan",
      icon: Coins,
      items: [
        { label: "Biaya", href: "/admin/fees", icon: Coins },
        { label: "Tagihan", href: "/admin/invoices", icon: Receipt },
      ],
    },
  ],

  settings: [
    { label: "Kampus", href: "/admin/settings/campuses", icon: Building2 },
    { label: "Jam Kerja", href: "/admin/settings/config", icon: Clock },
    {
      label: "Hari Libur",
      href: "/admin/settings/holidays",
      icon: CalendarDays,
    },
    {
      label: "Komponen Gaji",
      href: "/admin/settings/salary-components",
      icon: Coins,
    },
    { label: "Pengguna", href: "/admin/settings/users", icon: Users },
    { label: "Peran & Izin", href: "/admin/settings/roles", icon: Shield },
  ],
};

export function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchExact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function getActiveGroup(
  pathname: string,
  groups: NavGroup[]
): string | null {
  for (const group of groups) {
    if (group.items.some((item) => isItemActive(pathname, item))) {
      return group.id;
    }
  }
  return null;
}

/** Build breadcrumb trail from pathname */
export function getBreadcrumbs(
  pathname: string
): { label: string; href?: string }[] {
  // Check standalone items
  for (const item of adminNav.standalone) {
    if (isItemActive(pathname, item)) {
      return [{ label: item.label }];
    }
  }

  // Check groups
  for (const group of adminNav.groups) {
    for (const item of group.items) {
      if (isItemActive(pathname, item)) {
        // If on exact page, no link on last item
        if (pathname === item.href) {
          return [
            { label: group.label, href: item.href },
            { label: item.label },
          ];
        }
        // On a sub-page — detect context from path suffix
        const suffix = pathname.slice(item.href.length + 1); // e.g. "new", "monthly", "[id]"
        let subLabel = "Detail";
        if (suffix === "new") subLabel = "Tambah";
        else if (suffix === "monthly") subLabel = "Bulanan";

        return [
          { label: group.label },
          { label: item.label, href: item.href },
          { label: subLabel },
        ];
      }
    }
  }

  // Check settings
  for (const item of adminNav.settings) {
    if (isItemActive(pathname, item)) {
      return [{ label: "Pengaturan" }, { label: item.label }];
    }
  }

  return [];
}
