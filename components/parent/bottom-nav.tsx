"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  Receipt,
  CalendarDays,
  BookHeart,
  MoreHorizontal,
} from "lucide-react";
import { PortalBottomNav, type PortalBottomNavItem } from "@/components/portal/portal-bottom-nav";
import { ParentMoreSheet, PARENT_MORE_ITEMS } from "@/components/parent/more-sheet";

// Frequency-of-use ordering: daily/financial actions first. The bar holds four
// destinations plus an overflow trigger; weekly (Perkembangan), semester (Rapor)
// and account (Profil) surfaces live in the "Lainnya" sheet.
//
// Four link tabs is a hard ceiling here, not a preference. At the 375 px design
// target each slot gets `375 / 5 - 16 = 59 px` of label room; "Kehadiran" needs
// 57.8 px and only just fits. A sixth tab put the last slot 27.4 px past the
// viewport edge at 375 px and dropped it entirely at 360 px — the most common
// Android width in the pilot. Add destinations to PARENT_MORE_ITEMS, never here.
const baseTabs = [
  { label: "Beranda", href: "/parent", icon: Home },
  { label: "Tagihan", href: "/parent/invoices", icon: Receipt },
  { label: "Kehadiran", href: "/parent/attendance", icon: CalendarDays },
  // "Penghubung" (73.5 px) does not fit a 59 px label budget. "Jurnal" is the
  // parent-facing name for the same surface; the route slug, API paths and DB
  // fields all stay `student-journal`.
  { label: "Jurnal", href: "/parent/student-journal", icon: BookHeart },
] as const;

// Only `child` is meaningful across parent tabs (selected student). Other
// filters (invoice month, attendance range, etc.) are local to their own
// tab and must not leak when switching tabs.
const PARENT_NAV_FORWARDED_PARAMS = ["child"] as const;

export function ParentBottomNav() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const forwardedQuery = useMemo(() => {
    const forwarded = new URLSearchParams();
    for (const key of PARENT_NAV_FORWARDED_PARAMS) {
      const value = searchParams.get(key);
      if (value) forwarded.set(key, value);
    }
    return forwarded.toString();
  }, [searchParams]);

  // Keep the "Lainnya" tab lit while the user is on one of its destinations,
  // so the bar never shows zero active tabs.
  const onMoreRoute = PARENT_MORE_ITEMS.some((item) =>
    pathname.startsWith(item.href),
  );

  const items = useMemo<PortalBottomNavItem[]>(() => {
    const qs = forwardedQuery;
    const links: PortalBottomNavItem[] = baseTabs.map((tab) => ({
      kind: "link",
      label: tab.label,
      href: `${tab.href}${qs ? `?${qs}` : ""}`,
      icon: tab.icon,
      matcher: (p: string) =>
        tab.href === "/parent" ? p === "/parent" : p.startsWith(tab.href),
    }));

    return [
      ...links,
      {
        kind: "action",
        label: "Lainnya",
        icon: MoreHorizontal,
        onSelect: () => setMoreOpen(true),
        expanded: moreOpen,
        active: moreOpen || onMoreRoute,
      },
    ];
  }, [forwardedQuery, moreOpen, onMoreRoute]);

  return (
    <>
      <PortalBottomNav items={items} ariaLabel="Navigasi utama orang tua" />
      <ParentMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        queryString={forwardedQuery}
      />
    </>
  );
}
