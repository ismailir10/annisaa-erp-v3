"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Receipt, CalendarDays, BookOpen, BookHeart } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { label: "Beranda", href: "/parent", icon: Home },
  { label: "Tagihan", href: "/parent/invoices", icon: Receipt },
  { label: "Kehadiran", href: "/parent/attendance", icon: CalendarDays },
  { label: "Penghubung", href: "/parent/student-journal", icon: BookHeart },
  { label: "Rapor", href: "/parent/reports", icon: BookOpen },
];

// Only `child` is meaningful across parent tabs (selected student). Other
// filters (invoice month, attendance range, etc.) are local to their own
// tab and must not leak when switching tabs.
const PARENT_NAV_FORWARDED_PARAMS = ["child"] as const;

export function ParentBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const forwarded = new URLSearchParams();
  for (const key of PARENT_NAV_FORWARDED_PARAMS) {
    const value = searchParams.get(key);
    if (value) forwarded.set(key, value);
  }
  const forwardedQs = forwarded.toString();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 safe-area-bottom" aria-label="Navigasi utama orang tua">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/parent"
              ? pathname === "/parent"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={`${tab.href}${forwardedQs ? `?${forwardedQs}` : ""}`}
              className="flex flex-col items-center justify-center gap-1 relative py-1 px-4"
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute -top-0 w-8 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? "text-primary" : "text-muted-foreground"}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
