"use client";

import { Home, CalendarDays, School, ClipboardCheck, BookHeart } from "lucide-react";
import { PortalBottomNav, type PortalBottomNavItem } from "@/components/portal/portal-bottom-nav";

const tabs: PortalBottomNavItem[] = [
  { label: "Beranda", href: "/teacher", icon: Home },
  { label: "Kehadiran", href: "/teacher/attendance", icon: CalendarDays },
  { label: "Kelas", href: "/teacher/class-attendance", icon: School },
  { label: "Penghubung", href: "/teacher/student-journal", icon: BookHeart },
  { label: "Penilaian", href: "/teacher/assessments", icon: ClipboardCheck },
];

export function BottomNav() {
  return <PortalBottomNav items={tabs} ariaLabel="Navigasi utama guru" />;
}
