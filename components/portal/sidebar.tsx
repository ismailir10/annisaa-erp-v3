"use client";

// Sidebar — portal navigation shell. Desktop renders a 240px sticky rail
// with collapse-to-icon toggle; mobile collapses to a hamburger Sheet
// drawer. Active route via `usePathname`. Collapsed-state preference
// persists in cookie `portal-sidebar-collapsed` (SD3 — cookie over
// localStorage to avoid hydration flicker; the layout reads the cookie
// server-side and passes the initial value as `defaultCollapsed`).
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  NAV_BY_PORTAL,
  type NavGroup,
} from "@/lib/portal/nav-config";
import { SidebarGroup } from "./sidebar-group";

export const SIDEBAR_COOKIE_NAME = "portal-sidebar-collapsed";

const PORTAL_TITLES: Readonly<Record<"admin" | "teacher" | "parent", string>> = {
  admin: "Admin",
  teacher: "Guru",
  parent: "Wali",
};

export type SidebarProps = {
  readonly portal: "admin" | "teacher" | "parent";
  readonly defaultCollapsed?: boolean;
};

function writeCollapsedCookie(value: boolean): void {
  if (typeof document === "undefined") return;
  const v = value ? "1" : "0";
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${v}; path=/; max-age=31536000; samesite=lax`;
}

export function Sidebar({ portal, defaultCollapsed = false }: SidebarProps) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const groups = NAV_BY_PORTAL[portal];
  const title = PORTAL_TITLES[portal];

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedCookie(next);
      return next;
    });
  }, []);

  return (
    <>
      {/* Mobile trigger — visible below md */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden fixed top-3 left-3 z-40"
              aria-label="Buka navigasi"
            />
          }
        >
          <Menu className="size-4" aria-hidden="true" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <nav
            aria-label="Portal navigation"
            className="flex flex-col gap-1 px-2 py-2"
          >
            {groups.map((group: NavGroup) => (
              <SidebarGroup
                key={group.key}
                group={group}
                activeHref={pathname}
                collapsed={false}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop rail */}
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "hidden md:flex md:flex-col md:sticky md:top-0 md:h-dvh md:shrink-0",
          "border-r bg-background",
          collapsed ? "md:w-16" : "md:w-60",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-3 border-b">
          {!collapsed && (
            <span className="text-sm font-semibold">{title}</span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Perluas navigasi" : "Ciutkan navigasi"}
            aria-pressed={collapsed}
            className={cn(collapsed && "mx-auto")}
          >
            {collapsed ? (
              <ChevronRight className="size-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
        <nav
          aria-label="Portal navigation"
          className="flex flex-col gap-1 px-2 py-2 overflow-y-auto"
        >
          {groups.map((group: NavGroup) => (
            <SidebarGroup
              key={group.key}
              group={group}
              activeHref={pathname}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}
