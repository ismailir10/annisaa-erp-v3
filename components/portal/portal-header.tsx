"use client";

import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type PortalHeaderProps = {
  /** Display name for the user (full name). First word becomes the visible label. */
  userName: string;
  /** Optional second line under the name (e.g. role, class). Hidden on narrow widths. */
  userSubtitle?: string;
  /** Optional avatar image URL. Falls back to `avatarFallback` initials when absent. */
  avatarUrl?: string;
  /** 1-2 character fallback when `avatarUrl` is absent. Required. */
  avatarFallback: string;
  /** When set, the avatar + name become a link to the profile page. */
  profileHref?: string;
  /** Logout handler. The trailing icon button fires this. */
  onLogout: () => void | Promise<void>;
  /** Brand label to the right of the logo. Defaults to "An Nisaa'". */
  brandLabel?: string;
  className?: string;
};

/**
 * Shared portal header primitive. Consumed by parent + teacher portals.
 * Logo + brand on the left; avatar + name + logout on the right.
 *
 * Visual contract mirrors the cycle-1 teacher header pattern: sticky top,
 * `h-14`, `max-w-md mx-auto`, `px-5`. Keep parent + teacher pixel-aligned.
 */
export function PortalHeader({
  userName,
  userSubtitle,
  avatarUrl,
  avatarFallback,
  profileHref,
  onLogout,
  brandLabel = "An Nisaa'",
  className,
}: PortalHeaderProps) {
  const firstName = userName.split(" ")[0] ?? userName;

  const avatar = (
    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-primary">{avatarFallback}</span>
      )}
    </div>
  );

  const userBlock = (
    <>
      {avatar}
      <div className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium text-foreground">{firstName}</span>
        {userSubtitle ? (
          <span className="text-xs text-muted-foreground hidden sm:block">
            {userSubtitle}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <header className={cn("sticky top-0 z-20 bg-card border-b border-border", className)}>
      <div className="max-w-md mx-auto flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="An Nisaa'" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-semibold text-foreground">{brandLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {profileHref ? (
            <Link
              href={profileHref}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent transition-colors"
            >
              {userBlock}
            </Link>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1">{userBlock}</div>
          )}
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Keluar"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default PortalHeader;
