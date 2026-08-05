"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, School, ClipboardCheck, BookHeart, MoreHorizontal } from "lucide-react";
import { PortalBottomNav, type PortalBottomNavItem } from "@/components/portal/portal-bottom-nav";
import { TeacherMoreSheet, TEACHER_MORE_ITEMS } from "@/components/teacher/more-sheet";

// Teacher keeps daily teaching work in the tab bar. Personal attendance (with
// Cuti & Izin), salary, and profile share the same fifth-slot overflow pattern
// as parent navigation. "Jurnal" is a label-only abbreviation for the existing
// Buku Penghubung route and data model.
const baseTabs: PortalBottomNavItem[] = [
  { label: "Beranda", href: "/teacher", icon: Home },
  { label: "Kelas", href: "/teacher/class-attendance", icon: School },
  { label: "Jurnal", href: "/teacher/student-journal", icon: BookHeart },
  { label: "Penilaian", href: "/teacher/assessments", icon: ClipboardCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const onMoreRoute = TEACHER_MORE_ITEMS.some((item) =>
    pathname.startsWith(item.href),
  );

  const items = useMemo<PortalBottomNavItem[]>(
    () => [
      ...baseTabs,
      {
        kind: "action",
        label: "Lainnya",
        icon: MoreHorizontal,
        onSelect: () => setMoreOpen(true),
        expanded: moreOpen,
        active: moreOpen || onMoreRoute,
      },
    ],
    [moreOpen, onMoreRoute],
  );

  return (
    <>
      <PortalBottomNav items={items} ariaLabel="Navigasi utama guru" />
      <TeacherMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
