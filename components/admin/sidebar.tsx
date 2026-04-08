"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Banknote,
  Settings,
  Building2,
  Clock,
  CalendarDays,
  Coins,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Karyawan", href: "/admin/employees", icon: Users },
  { label: "Kehadiran", href: "/admin/attendance", icon: CalendarCheck },
  { label: "Penggajian", href: "/admin/payroll", icon: Banknote },
];

const settingsItems = [
  { label: "Kampus", href: "/admin/settings/campuses", icon: Building2 },
  { label: "Jam Kerja", href: "/admin/settings/config", icon: Clock },
  { label: "Hari Libur", href: "/admin/settings/holidays", icon: CalendarDays },
  { label: "Komponen Gaji", href: "/admin/settings/salary-components", icon: Coins },
];

function NavLink({
  item,
  isActive,
}: {
  item: (typeof navItems)[0];
  isActive: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
        isActive
          ? "bg-[#2A4344] text-white"
          : "text-[#8AACAD] hover:text-white hover:bg-[#223838]"
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#5DB4B8] rounded-r-full"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="An Nisaa'" width={36} height={36} className="rounded-lg" />
          <div>
            <p className="text-white font-semibold text-sm leading-tight">An Nisaa&apos;</p>
            <p className="text-[#8AACAD] text-[11px]">Sekolahku</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1" onClick={onNavigate}>
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href)
            }
          />
        ))}

        {/* Settings section */}
        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] uppercase tracking-widest text-[#8AACAD] font-semibold">
            Pengaturan
          </p>
        </div>
        {settingsItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-white/5 pt-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#8AACAD] hover:text-white hover:bg-[#223838] transition-colors w-full"
        >
          <LogOut size={18} strokeWidth={1.5} />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-60 bg-[#1A2E2F] border-r border-white/5 flex-col fixed inset-y-0 left-0 z-30">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="lg:hidden p-2 text-muted-foreground hover:text-foreground">
        <Menu size={22} />
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 bg-[#1A2E2F] border-white/5 [&>button]:hidden">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-[#8AACAD] hover:text-white z-50"
        >
          <X size={18} />
        </button>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
