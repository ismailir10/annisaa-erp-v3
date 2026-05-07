"use client";

// SidebarGroup — section heading + child items. Heading is hidden when
// `group.label === ""` (used by teacher / parent IAs which have no
// section split per foundation §10A.1).
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

import { cn } from "@/lib/utils";

import type { NavGroup, NavItem } from "@/lib/portal/nav-config";
import { SidebarItem } from "./sidebar-item";

export type SidebarGroupProps = {
  readonly group: NavGroup;
  readonly activeHref: string;
  readonly collapsed: boolean;
};

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === pathname) return true;
  // Portal-root items (single non-empty segment, e.g. "/teacher", "/parent",
  // "/admin") use exact-match only — prefix-match would falsely highlight
  // "Beranda" whenever the user is on any nested portal page like
  // /teacher/kelas, /parent/tagihan, etc. (Per spec-time review: prefix-match
  // is correct only for sub-section roots like /admin/akademik/siswa.)
  if (item.href.split("/").filter(Boolean).length < 2) return false;
  return pathname.startsWith(item.href + "/");
}

export function SidebarGroup({ group, activeHref, collapsed }: SidebarGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      {group.label && !collapsed && (
        <h3 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          {group.label}
        </h3>
      )}
      <ul className={cn("flex flex-col gap-0.5", group.label && "pb-2")}>
        {group.items.map((item) => (
          <li key={item.key}>
            <SidebarItem
              item={item}
              active={isItemActive(item, activeHref)}
              collapsed={collapsed}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
