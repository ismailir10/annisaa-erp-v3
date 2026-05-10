"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut, Settings } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TalibWordmark } from "@/components/brand/talib-wordmark";
import {
  adminNav,
  getActiveGroup,
  getActiveItem,
  isItemActive,
  type NavItem,
  type NavGroup,
} from "@/config/admin-nav";

function NavMenuItems({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  const activeItem = getActiveItem(pathname, items);
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === activeItem?.href;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              render={<Link href={item.href} />}
              isActive={active}
              tooltip={item.label}
            >
              <Icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function CollapsibleNavGroup({
  group,
  pathname,
  open,
  onOpenChange,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const GroupIcon = group.icon;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <SidebarGroup>
        <SidebarGroupLabel
          render={
            <CollapsibleTrigger className="flex w-full items-center gap-2" />
          }
        >
          <GroupIcon className="size-4" />
          <span>{group.label}</span>
          <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <NavMenuItems items={group.items} pathname={pathname} />
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(adminNav.groups.map((g) => [g.id, true]))
  );
  const [settingsOpen, setSettingsOpen] = useState(true);

  const visibleGroups = adminNav.groups
    .filter((g) => !g.permission || permissions.includes(g.permission))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.permission || permissions.includes(item.permission)),
    }))
    .filter((g) => g.items.length > 0);
  const visibleSettings = adminNav.settings.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  // Auto-expand whichever group contains the active route so users who
  // collapsed a group and then navigated into it via breadcrumb/back don't
  // lose sight of their current location. User's collapsed state for
  // inactive groups is preserved.
  /* eslint-disable react-hooks/set-state-in-effect -- syncing collapsible
     state from the external system (URL pathname) into local UI state;
     functional setState bails out when the value already matches, so no
     cascading renders occur. */
  useEffect(() => {
    const activeGroupId = getActiveGroup(pathname, adminNav.groups);
    if (activeGroupId) {
      setOpenGroups((prev) =>
        prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }
      );
    }
    if (adminNav.settings.some((item) => isItemActive(pathname, item))) {
      setSettingsOpen(true);
    }
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/admin" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                <Image
                  src="/logo.png"
                  alt="An Nisaa'"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
              </div>
              <TalibWordmark size="md" showSublabel className="flex-1 min-w-0" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard — standalone */}
        <SidebarGroup>
          <SidebarMenu>
            {adminNav.standalone.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(pathname, item);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={active}
                    tooltip={item.label}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Module groups — SDM, Akademik, Keuangan */}
        {visibleGroups.map((group) => (
          <CollapsibleNavGroup
            key={group.id}
            group={group}
            pathname={pathname}
            open={openGroups[group.id] ?? false}
            onOpenChange={(open) =>
              setOpenGroups((prev) => ({ ...prev, [group.id]: open }))
            }
          />
        ))}

        {/* Pengaturan — last group in main nav, not pinned to footer */}
        {visibleSettings.length > 0 && (
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SidebarGroup>
              <SidebarGroupLabel
                render={
                  <CollapsibleTrigger className="flex w-full items-center gap-2" />
                }
              >
                <Settings className="size-4" />
                <span>Pengaturan</span>
                <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <NavMenuItems items={visibleSettings} pathname={pathname} />
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      {/* Footer — Logout only */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Keluar" onClick={handleLogout}>
              <LogOut />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
