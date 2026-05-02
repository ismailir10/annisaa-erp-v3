"use client";

import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";

export function TeacherHeader({ userName }: { userName: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
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
