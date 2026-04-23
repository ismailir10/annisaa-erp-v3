import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SummaryHero — tone-tinted hero card for portal landing moments.
 *
 * ## Extraction rationale (2nd-instance trigger met per portal.md
 * §Portal Primitive Inventory — "The 2nd instance is the extraction trigger")
 *
 * Consumed by 4 targets in the Parent Portal Visual Overhaul Cycle 3:
 *   1. T1 — /parent home urgency banner (attention state) + all-clear
 *      Alhamdulillah celebration (HouseholdOverview).
 *   2. T2 — /parent/invoices outstanding money hero (total unpaid + nearest
 *      due date; danger when >0, celebration when all lunas).
 *   3. T3 — /parent/attendance weekly summary (Hadir N · Sakit M · Alpa K ·
 *      Izin L; tone from worst day in week).
 *   4. T4 — /parent/reports latest-rapor celebration (gold when PUBLISHED,
 *      muted when DRAFT).
 *
 * Cross-checked against `.claude/standards/design-system.html` §14 Page
 * Recipes — specifically the Household Overview urgency banner and the
 * Parent money hero patterns — and `.claude/standards/portal.md` §Portal
 * Primitive Inventory.
 *
 * ## Usage
 *
 * ```tsx
 * <SummaryHero
 *   tone="danger"
 *   icon={AlertTriangle}
 *   primary={formatRupiah(total)}
 *   secondary="3 tagihan · jatuh tempo 28 Apr"
 *   action={<Button size="sm">Lihat cara bayar</Button>}
 * />
 * ```
 *
 * ## Motion note
 *
 * SummaryHero does NOT animate itself. Consumers drive page-level motion
 * (e.g. Framer Motion entrance stagger on the landing page). Keeping motion
 * out of the primitive prevents double-animations when consumers wrap it.
 */

export type SummaryHeroTone =
  | "danger"
  | "warn"
  | "success"
  | "celebration"
  | "neutral";

export type SummaryHeroProps = {
  /** Visual tone. Default "neutral". */
  tone?: SummaryHeroTone;
  /** Optional leading icon (Lucide). Rendered at `size-6`, stroke-2. */
  icon?: LucideIcon;
  /** Hero text — the primary number or message. Rendered at `text-display`. */
  primary: ReactNode;
  /** Muted meta line below the primary (e.g. "3 tagihan · jatuh tempo 28 Apr"). */
  secondary?: ReactNode;
  /** Optional CTA slot. Right-aligned on ≥sm, full-width below on mobile. */
  action?: ReactNode;
  /** Default `true` → `shadow-card-elevated`. `false` → `shadow-card-resting` for secondary placements. */
  elevated?: boolean;
  className?: string;
};

/**
 * Per-tone class map. `border-l-4` is always applied — only the border color
 * and bg/icon tint vary. Tokens only — no raw hex, no arbitrary sizes.
 */
const toneClasses: Record<
  SummaryHeroTone,
  { bg: string; borderL: string; icon: string }
> = {
  danger: {
    bg: "bg-destructive/8",
    borderL: "border-l-destructive",
    icon: "text-destructive",
  },
  warn: {
    bg: "bg-status-late-subtle",
    borderL: "border-l-status-late",
    icon: "text-status-late-text",
  },
  success: {
    bg: "bg-status-present-subtle",
    borderL: "border-l-status-present",
    icon: "text-status-present-text",
  },
  celebration: {
    bg: "bg-celebration-gold-subtle",
    borderL: "border-l-celebration-gold",
    icon: "text-celebration-gold-text",
  },
  neutral: {
    bg: "bg-card",
    borderL: "border-l-border",
    icon: "text-muted-foreground",
  },
};

export function SummaryHero({
  tone = "neutral",
  icon: Icon,
  primary,
  secondary,
  action,
  elevated = true,
  className,
}: SummaryHeroProps) {
  const t = toneClasses[tone];

  return (
    <section
      role="region"
      className={cn(
        // Layout: column on mobile (icon+text stacked with action below full-width),
        // row on ≥sm (icon+text left, action right-aligned).
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        // Surface: tone-tinted bg + 4px tone-left-accent.
        "rounded-xl border-l-4 p-card",
        t.bg,
        t.borderL,
        // Elevation — S4 tokens.
        elevated ? "shadow-card-elevated" : "shadow-card-resting",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon ? (
          <Icon
            aria-hidden="true"
            strokeWidth={2}
            className={cn("size-6 shrink-0 mt-0.5", t.icon)}
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="text-display font-bold tracking-tight text-foreground">
            {primary}
          </div>
          {secondary ? (
            <p className="text-sm text-muted-foreground mt-1">{secondary}</p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="w-full sm:w-auto shrink-0 flex sm:justify-end">
          {action}
        </div>
      ) : null}
    </section>
  );
}

export default SummaryHero;
