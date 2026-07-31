"use client";

import { Home, CalendarDays, School, ClipboardCheck, BookHeart } from "lucide-react";
import { PortalBottomNav, type PortalBottomNavItem } from "@/components/portal/portal-bottom-nav";

// Labels must fit a 5-slot bar: `viewport / 5 - 8` px each, i.e. 67 px at the
// 375 px design target and 64 px at 360 px. "Penghubung" needs 73 px and does
// not fit either — it only ever appeared whole because unequal `flex-basis:auto`
// slots let it steal width from "Kelas", the same defect that pushed the parent
// portal's 6th tab off-screen. The nav label is "Jurnal" (matching the parent
// portal per the Portal Consistency Standard); page headings, routes, API paths
// and DB fields all keep "Buku Penghubung" / `student-journal`.
const tabs: PortalBottomNavItem[] = [
  { label: "Beranda", href: "/teacher", icon: Home },
  { label: "Kehadiran", href: "/teacher/attendance", icon: CalendarDays },
  { label: "Kelas", href: "/teacher/class-attendance", icon: School },
  { label: "Jurnal", href: "/teacher/student-journal", icon: BookHeart },
  { label: "Penilaian", href: "/teacher/assessments", icon: ClipboardCheck },
];

export function BottomNav() {
  return <PortalBottomNav items={tabs} ariaLabel="Navigasi utama guru" />;
}
