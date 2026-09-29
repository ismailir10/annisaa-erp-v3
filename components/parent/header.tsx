"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PortalHeader } from "@/components/portal/portal-header";
import { parentHref, resolveParentChildId } from "@/lib/parent/navigation";
import { signOut } from "@/lib/sign-out";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

export function ParentHeader({
  userName,
  childCount,
  childIds = [],
}: {
  userName: string;
  childCount?: number;
  childIds?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const detailChildId = pathname.match(/^\/parent\/perkembangan\/([^/]+)$/)?.[1];
  const childId = resolveParentChildId(childIds, detailChildId ?? searchParams.get("child"));

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      toast.error("Tidak bisa keluar. Coba lagi sebentar ya.");
    }
  }

  return (
    <PortalHeader
      userName={userName}
      userSubtitle={
        childCount && childCount > 0 ? `${childCount} anak` : undefined
      }
      avatarFallback={initialsOf(userName)}
      profileHref={parentHref("/parent/profile", childId)}
      onLogout={handleLogout}
    />
  );
}
