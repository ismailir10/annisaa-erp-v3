"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Home, Receipt, CalendarDays, BookOpen, BookHeart } from "lucide-react";
import { PortalBottomNav, type PortalBottomNavItem } from "@/components/portal/portal-bottom-nav";

const baseTabs = [
  { label: "Beranda", href: "/parent", icon: Home },
  { label: "Tagihan", href: "/parent/invoices", icon: Receipt },
  { label: "Kehadiran", href: "/parent/attendance", icon: CalendarDays },
  { label: "Penghubung", href: "/parent/student-journal", icon: BookHeart },
  { label: "Rapor", href: "/parent/reports", icon: BookOpen },
] as const;

// Only `child` is meaningful across parent tabs (selected student). Other
// filters (invoice month, attendance range, etc.) are local to their own
// tab and must not leak when switching tabs.
const PARENT_NAV_FORWARDED_PARAMS = ["child"] as const;

export function ParentBottomNav() {
  const searchParams = useSearchParams();

  const items = useMemo<PortalBottomNavItem[]>(() => {
    const forwarded = new URLSearchParams();
    for (const key of PARENT_NAV_FORWARDED_PARAMS) {
      const value = searchParams.get(key);
      if (value) forwarded.set(key, value);
    }
    const qs = forwarded.toString();
    return baseTabs.map((tab) => ({
      label: tab.label,
      href: `${tab.href}${qs ? `?${qs}` : ""}`,
      icon: tab.icon,
      matcher: (pathname: string) =>
        tab.href === "/parent"
          ? pathname === "/parent"
          : pathname.startsWith(tab.href),
    }));
  }, [searchParams]);

  return <PortalBottomNav items={items} ariaLabel="Navigasi utama orang tua" />;
}
