"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, School, ClipboardCheck } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { label: "Beranda", href: "/teacher", icon: Home },
  { label: "Kehadiran", href: "/teacher/attendance", icon: CalendarDays },
  { label: "Kelas", href: "/teacher/class-attendance", icon: School },
  { label: "Penilaian", href: "/teacher/assessments", icon: ClipboardCheck },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 safe-area-bottom" aria-label="Navigasi utama guru">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/teacher"
              ? pathname === "/teacher"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-1 relative py-1 px-2 flex-1"
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
