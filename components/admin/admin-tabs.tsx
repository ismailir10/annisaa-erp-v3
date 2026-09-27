"use client";

/**
 * Admin-namespaced wrapper over Shadcn `<Tabs>` primitives.
 *
 * `AdminTabs`/`AdminTabsTrigger`/`AdminTabsContent` are still a passthrough —
 * the admin portal is happy with Shadcn's default variant (pill on
 * `bg-muted`). `AdminTabsList` is not: it OWNS tab-strip layout (cycle
 * 2026-09-26, admin-ui-standard-c1 T1) so every admin tab strip behaves
 * identically on a phone — a single row that scrolls horizontally instead of
 * wrapping to two or three rows (which, on a strip like Komponen Biaya's,
 * dropped a tab onto its own centred row where it read as a heading, not a
 * tab). Pages must not re-fight this with their own `flex-wrap`/`w-full`
 * overrides — see `.claude/standards/ui.md` DataTable/AdminTabs section.
 *
 * The wrapper exists so future admin-wide tab styling changes land in one
 * place instead of across every detail page.
 */

import * as React from "react";
import {
  Tabs as AdminTabs,
  TabsList,
  TabsTrigger,
  TabsContent as AdminTabsContent,
} from "@/components/ui/tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export { AdminTabs, AdminTabsContent };

export function AdminTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "max-w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

// `TabsTrigger`'s own `flex-1` (meant for a `TabsList` that never overflows)
// would fight `AdminTabsList`'s horizontal scroll by stretching triggers to
// fill it instead of letting them keep their natural width. `shrink-0` here,
// applied directly rather than via a parent selector, wins deterministically
// over `flex-1` (same specificity either way — this avoids the coin flip).
export function AdminTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return <TabsTrigger className={cn("shrink-0", className)} {...props} />;
}

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
        "inline-flex h-8 max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center justify-start gap-1.5 overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground",
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
              "relative inline-flex h-[calc(100%-1px)] shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
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
