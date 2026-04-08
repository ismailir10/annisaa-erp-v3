"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut } from "lucide-react";

export function TeacherHeader({ userName }: { userName: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="An Nisaa'" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-semibold text-foreground">An Nisaa&apos;</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">{userName}</span>
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
