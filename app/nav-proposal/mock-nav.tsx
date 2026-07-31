"use client";

import {
  Home,
  Receipt,
  CalendarDays,
  BookHeart,
  LineChart,
  BookOpen,
  MoreHorizontal,
  Users,
  NotebookPen,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Icon components cannot cross the server→client boundary as props, so the
 * mockup page passes a string key and this map resolves it client-side.
 */
const ICONS = {
  home: Home,
  receipt: Receipt,
  calendar: CalendarDays,
  journal: BookHeart,
  chart: LineChart,
  report: BookOpen,
  more: MoreHorizontal,
  kids: Users,
  notes: NotebookPen,
  profile: User,
} satisfies Record<string, LucideIcon>;

export type MockNavIcon = keyof typeof ICONS;

/**
 * THROWAWAY MOCKUP COMPONENT — not shipped.
 *
 * Mirrors `components/portal/portal-bottom-nav.tsx` markup + classes exactly
 * (h-16, max-w-md, flex-1 slots, size-20 icon, text-xs label) so the mockup
 * screenshots are pixel-faithful to the real bar. Differs only in that items
 * are inert buttons instead of `next/link` (no routing in the mockup) and an
 * item may be marked `overflow` to render the "Lainnya" affordance.
 */
export type MockNavItem = {
  label: string;
  icon: MockNavIcon;
  active?: boolean;
};

export function MockBottomNav({ items }: { items: MockNavItem[] }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 safe-area-bottom"
      aria-label="Navigasi utama orang tua"
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = !!item.active;
          return (
            <div
              key={item.label}
              className="flex flex-col items-center justify-center gap-1 relative py-1 px-2 flex-1"
            >
              {isActive && (
                <div className="absolute -top-0 w-8 h-0.5 bg-primary rounded-full" />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? "text-primary" : "text-muted-foreground"}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "text-xs font-medium",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
