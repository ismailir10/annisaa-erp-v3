"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, LineChart, User, type LucideIcon } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type ParentMoreItem = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Overflow destinations for the parent bottom nav. These are the surfaces whose
 * cadence is weekly (Perkembangan) or semester-ly (Rapor), plus account settings
 * — none of them earn a permanent slot in a 5-tab bar, and the home already
 * summarises it in its "Perkembangan minggu ini" section.
 *
 * "Capaian" is deliberately absent from these labels: `voice.md`'s glossary
 * reserves that word for the per-element achievement level *inside* the page
 * and bans it as a nav or page label, so nav copy stays on "Perkembangan".
 */
export const PARENT_MORE_ITEMS: ParentMoreItem[] = [
  {
    label: "Perkembangan",
    description: "Perkembangan anak per elemen",
    href: "/parent/perkembangan",
    icon: LineChart,
  },
  {
    label: "Rapor",
    description: "Laporan hasil belajar per semester",
    href: "/parent/reports",
    icon: BookOpen,
  },
  {
    label: "Profil",
    description: "Data akun dan kontak",
    href: "/parent/profile",
    icon: User,
  },
];

export function ParentMoreSheet({
  open,
  onOpenChange,
  /** Query string (without `?`) forwarded from the nav, e.g. `child=abc`. */
  queryString = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryString?: string;
}) {
  const pathname = usePathname();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/*
        Rows land at the bottom of the screen, inside the one-handed thumb arc
        — the point of an overflow sheet rather than a header menu. `safe-area-bottom`
        keeps the last row clear of the home indicator on gesture-nav phones.
      */}
      <DrawerContent className="max-w-md mx-auto safe-area-bottom">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>Lainnya</DrawerTitle>
          <DrawerDescription className="text-xs">
            Halaman yang tidak dibuka setiap hari
          </DrawerDescription>
        </DrawerHeader>

        <nav aria-label="Menu lainnya" className="px-4 pb-6">
          <ul className="space-y-2">
            {PARENT_MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              const href = queryString ? `${item.href}?${queryString}` : item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={() => onOpenChange(false)}
                    aria-current={isActive ? "page" : undefined}
                    // min-h-14 (56 px) keeps every row well past the 44 px
                    // minimum tap target even before the icon/padding.
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-xl border bg-card p-4 transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "border-primary/40"
                        : "border-border hover:border-primary/30 active:border-primary/40",
                    )}
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                      aria-hidden="true"
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight
                      size={18}
                      className="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
