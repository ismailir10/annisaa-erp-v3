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
  Heart,
  BookOpen,
  ClipboardList,
  Palette,
  type LucideIcon,
} from "lucide-react";
import type { PermissionCode } from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchExact?: boolean;
  permission?: PermissionCode;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  permission?: PermissionCode;
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
      permission: "hr.view",
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
        { label: "Pendaftaran", href: "/admin/admissions", icon: UserPlus },
        { label: "Siswa", href: "/admin/students", icon: GraduationCap },
        { label: "Wali Murid", href: "/admin/guardians", icon: Heart },
        { label: "Penempatan", href: "/admin/enrollments", icon: BookOpen },
        { label: "Guru Pengajar", href: "/admin/teaching-assignments", icon: Users },
        { label: "Kehadiran Siswa", href: "/admin/student-attendance", icon: CalendarCheck },
        { label: "Buku Penghubung", href: "/admin/student-journal", icon: BookOpen },
      ],
    },
    {
      id: "learning",
      label: "Penilaian",
      icon: ClipboardList,
      items: [
        { label: "Template Penilaian", href: "/admin/assessments/templates", icon: ClipboardList },
        { label: "Penilaian Siswa", href: "/admin/assessments", icon: ClipboardList },
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
      permission: "hr.view",
    },
    { label: "Pengguna", href: "/admin/settings/users", icon: Users },
    { label: "Peran & Izin", href: "/admin/settings/roles", icon: Shield },
    { label: "Design System", href: "/admin/design-system", icon: Palette },
  ],
};

export function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.matchExact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * Returns the single best-matching item from `items` for `pathname`.
 * When multiple items match (e.g. parent /admin/assessments + child
 * /admin/assessments/templates), the longer href wins. Prevents both
 * siblings from rendering as active when one is a prefix of the other.
 */
export function getActiveItem(
  pathname: string,
  items: NavItem[]
): NavItem | null {
  let best: NavItem | null = null;
  for (const item of items) {
    if (!isItemActive(pathname, item)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

export function getActiveGroup(
  pathname: string,
  groups: NavGroup[]
): string | null {
  for (const group of groups) {
    // Sort by href length descending so longer prefixes match first
    const sorted = [...group.items].sort(
      (a, b) => b.href.length - a.href.length
    );
    if (sorted.some((item) => isItemActive(pathname, item))) {
      return group.id;
    }
  }
  return null;
}

/**
 * Fixed labels for well-known sub-path segments. Any segment not in this
 * map is assumed to be a dynamic id and renders as "Detail".
 */
const SEGMENT_LABELS: Record<string, string> = {
  new: "Tambah",
  edit: "Ubah",
  monthly: "Bulanan",
  templates: "Template",
  guardians: "Wali Murid",
  score: "Nilai",
  scores: "Nilai",
};

function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? "Detail";
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

  // Check groups — sort items by href length descending so longer prefixes
  // (e.g. /admin/assessments/templates) match before shorter ones
  // (e.g. /admin/assessments). Then parse each remaining sub-segment into
  // its own crumb via SEGMENT_LABELS, falling back to "Detail" for ids.
  for (const group of adminNav.groups) {
    const sorted = [...group.items].sort(
      (a, b) => b.href.length - a.href.length
    );
    for (const item of sorted) {
      if (isItemActive(pathname, item)) {
        // Exact match — last crumb has no link
        if (pathname === item.href) {
          return [
            { label: group.label },
            { label: item.label },
          ];
        }
        // Sub-page — parse each remaining segment into its own crumb
        const suffix = pathname.slice(item.href.length + 1);
        const subTrail = suffix
          .split("/")
          .filter(Boolean)
          .map((seg) => ({ label: segmentLabel(seg) }));

        return [
          { label: group.label },
          { label: item.label, href: item.href },
          ...subTrail,
        ];
      }
    }
  }

  // Check settings
  for (const item of adminNav.settings) {
    if (isItemActive(pathname, item)) {
      if (pathname === item.href) {
        return [{ label: "Pengaturan" }, { label: item.label }];
      }
      const suffix = pathname.slice(item.href.length + 1);
      const subTrail = suffix
        .split("/")
        .filter(Boolean)
        .map((seg) => ({ label: segmentLabel(seg) }));
      return [
        { label: "Pengaturan" },
        { label: item.label, href: item.href },
        ...subTrail,
      ];
    }
  }

  return [];
}
