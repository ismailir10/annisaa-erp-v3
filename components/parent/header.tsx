"use client";

import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal/portal-header";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

export function ParentHeader({
  userName,
  childCount,
}: {
  userName: string;
  childCount?: number;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <PortalHeader
      userName={userName}
      userSubtitle={
        childCount && childCount > 0 ? `${childCount} anak` : undefined
      }
      avatarFallback={initialsOf(userName)}
      onLogout={handleLogout}
    />
  );
}
