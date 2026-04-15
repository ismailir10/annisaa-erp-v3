"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";

export function TeacherHeader({ userName }: { userName: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const initial = userName?.[0]?.toUpperCase() ?? "G";

  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="An Nisaa'" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-semibold text-foreground">An Nisaa&apos;</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/teacher/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{initial}</span>
            </div>
            <span className="text-xs text-muted-foreground">{userName.split(" ")[0]}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Keluar"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
