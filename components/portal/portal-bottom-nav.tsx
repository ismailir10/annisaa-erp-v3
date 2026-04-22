"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type PortalBottomNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matcher?: (pathname: string) => boolean;
};

export type PortalBottomNavProps = {
  items: PortalBottomNavItem[];
  layoutId?: string;
  ariaLabel: string;
};

export function PortalBottomNav({ items, layoutId, ariaLabel }: PortalBottomNavProps) {
  const pathname = usePathname();
  const layout = layoutId ?? "portal-bottom-nav-active";

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 safe-area-bottom"
      aria-label={ariaLabel}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.matcher
            ? item.matcher(pathname)
            : index === 0
              ? pathname === item.href.split("?")[0]
              : pathname.startsWith(item.href.split("?")[0]);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-1 relative py-1 px-2 flex-1"
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId={layout}
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
                className={`text-xs font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
