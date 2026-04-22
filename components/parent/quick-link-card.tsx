import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "destructive" | "success";

export type QuickLinkCardProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  primary: string;
  primaryTone?: Tone;
  secondary?: string;
  /** Overall card is muted (no live data). */
  muted?: boolean;
  /** When true, render `primary` with the currency font. */
  primaryIsCurrency?: boolean;
  className?: string;
};

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  success: "text-status-present",
};

/**
 * Shared dashboard quick-link card.
 *
 * Three uniform slots: icon (top), label (middle), bottom stack
 * (optional secondary + primary stat). Fixed 132 px height keeps
 * the dashboard trio aligned regardless of payload differences.
 */
export function QuickLinkCard({
  href,
  icon: Icon,
  label,
  primary,
  primaryTone = "default",
  secondary,
  muted = false,
  primaryIsCurrency = false,
  className,
}: QuickLinkCardProps) {
  const primaryClass = muted
    ? "text-muted-foreground font-normal"
    : cn("font-semibold", toneClass[primaryTone]);

  return (
    <Link
      href={href}
      className={cn(
        "flex h-[132px] flex-col justify-between rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent",
        className,
      )}
    >
      <Icon
        size={24}
        className={muted ? "text-muted-foreground" : "text-primary"}
      />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="space-y-0.5">
        {secondary && (
          <p className="text-xs text-muted-foreground">{secondary}</p>
        )}
        <p
          className={cn(
            "text-base",
            primaryIsCurrency && !muted && "font-currency",
            primaryClass,
          )}
        >
          {primary}
        </p>
      </div>
    </Link>
  );
}
