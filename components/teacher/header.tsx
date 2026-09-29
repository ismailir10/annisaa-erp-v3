"use client";

import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/portal-header";
import { signOut } from "@/lib/sign-out";

export function TeacherHeader({ userName }: { userName: string }) {
  async function handleLogout() {
    try {
      await signOut();
    } catch {
      toast.error("Tidak bisa keluar. Coba lagi sebentar ya.");
    }
  }

  const initial = userName?.[0]?.toUpperCase() ?? "G";

  return (
    <PortalHeader
      userName={userName}
      avatarFallback={initial}
      profileHref="/teacher/profile"
      onLogout={handleLogout}
    />
  );
}
