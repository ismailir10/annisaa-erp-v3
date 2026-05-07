"use client";

// SidebarItem — single nav link inside the portal sidebar. Renders a Lucide
// icon by name + label. Highlights when its href matches the current
// pathname (via `usePathname`). When `disabled`, renders as a non-interactive
// muted span — surfaces the IA without offering navigation to unmounted
// destinations.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

import * as LucideIcons from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { NavItem } from "@/lib/portal/nav-config";

const FALLBACK_ICON: LucideIcon = LucideIcons.Circle;

function resolveIcon(name: string): LucideIcon {
  // `LucideIcons` is a flat namespace of named exports; index lookup with a
  // safe fallback keeps the renderer robust against typos in nav-config.
  const candidate = (LucideIcons as unknown as Record<string, LucideIcon>)[name];
  return typeof candidate === "function" ? candidate : FALLBACK_ICON;
}

export type SidebarItemProps = {
  readonly item: NavItem;
  readonly active: boolean;
  readonly collapsed: boolean;
};

export function SidebarItem({ item, active, collapsed }: SidebarItemProps) {
  const Icon = resolveIcon(item.icon);

  if (item.disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60",
          collapsed && "justify-center px-2",
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-muted hover:text-foreground",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
