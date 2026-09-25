"use client";

/**
 * Admin-namespaced re-export of Shadcn `<Tabs>` primitives.
 *
 * Currently a passthrough — the admin portal is happy with Shadcn's
 * default variant (pill on `bg-muted`). The wrapper exists so future
 * admin-wide tab styling changes (spacing, active underline, color
 * tokens) land in one place instead of across every detail page.
 *
 * Consumers that import `AdminTabs*` will automatically pick up any
 * future admin-specific tweak without further per-page edits.
 */

export {
  Tabs as AdminTabs,
  TabsList as AdminTabsList,
  TabsTrigger as AdminTabsTrigger,
  TabsContent as AdminTabsContent,
} from "@/components/ui/tabs";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Link-based sibling to AdminTabs (T2, cycle 2026-09-25 — the Pendaftaran /
 * Formulir merge). AdminTabs (Base UI Tabs.Root) switches panels within a
 * single page and owns its own active-value state; it has no way to
 * represent "current page" for a set of tabs that are actually separate
 * ROUTES (e.g. "Calon Siswa" → /admin/admissions, "Formulir" →
 * /admin/enrollments). AdminLinkTabs renders plain `<Link>`s styled to
 * match `AdminTabsTrigger` so the two visually read as one tab strip, with
 * the active item derived from the current pathname and marked
 * `aria-current="page"` for assistive tech. Additive — does not change any
 * existing AdminTabs consumer.
 */
export function AdminLinkTabs({
  items,
  className,
}: {
  items: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "inline-flex h-8 w-fit items-center justify-center gap-1.5 rounded-lg bg-muted p-[3px] text-muted-foreground",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
              isActive &&
                "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
