import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * CardListItem — tappable card-row primitive for parent + teacher portals.
 *
 * Extraction trigger (2nd-instance rule, met at 4 consumers):
 *  1. `components/parent/household-overview.tsx` — T1 child-row card
 *  2. `app/parent/invoices/*` — T2 invoice rows (replacing DataTable for ≤10 items)
 *  3. `app/parent/attendance/*` — T3 attendance-day rows (replacing DataTable)
 *  4. `app/parent/reports/*` — T4 rapor-term rows
 *
 * Cross-checked:
 *  - `.claude/standards/design-system.html` §14 list patterns (card row recipe) + §13
 *    overlays (press-state rules for tappable surfaces: `active:scale-[0.98]` with
 *    150ms transform transition, hover tint on `bg-muted/50`).
 *  - `.claude/standards/portal.md` §Portal Primitive Inventory — takes over from
 *    DataTable whenever a parent list is <10 rows (the parent portal norm).
 *
 * Rendering:
 *  - `href`    → Next.js `<Link>` (interactive, chevron auto-appended)
 *  - `onClick` → `<button type="button">` (interactive, chevron auto-appended)
 *  - neither   → static `<div>` (no chevron)
 *
 * Auto-chevron is suppressed when the consumer passes a `trailing` slot, so
 * rows that render their own chevron, amount, or status chip stay clean.
 *
 * Usage:
 * ```tsx
 * <CardListItem
 *   href={`/parent/children/${child.id}`}
 *   leading={<Avatar>...</Avatar>}
 *   primary="Ahmad Zafran Hidayat"
 *   secondary="TKIT A · Bu Sari"
 *   trailing={<StatusBadge status="PRESENT" label="Hadir" />}
 * />
 * ```
 */
export type CardListItemProps = {
  /** Navigation target. Exactly one of `href` or `onClick` makes this interactive. */
  href?: string;
  /** Click handler. Mutually exclusive with `href`. */
  onClick?: () => void;

  /** Leading slot — avatar, icon, or date badge. Aligned to the first text line. */
  leading?: ReactNode;
  /** Primary line — main content, always present. */
  primary: ReactNode;
  /** Secondary line — muted meta under primary (e.g. class, sub-label). */
  secondary?: ReactNode;
  /** Supplementary third line — optional caption-size detail. */
  meta?: ReactNode;
  /** Trailing slot — right-aligned node (status chip, amount, custom chevron). */
  trailing?: ReactNode;

  /** When true, the row is visually muted and not interactive. */
  disabled?: boolean;
  className?: string;
};

export function CardListItem({
  href,
  onClick,
  leading,
  primary,
  secondary,
  meta,
  trailing,
  disabled = false,
  className,
}: CardListItemProps) {
  const isInteractive = !disabled && (href != null || onClick != null);

  const rootClass = cn(
    "group flex items-start gap-3 p-card rounded-xl",
    "bg-card border border-border transition",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isInteractive &&
      "hover:bg-muted/50 active:scale-[0.98] active:transition-transform active:duration-150",
    disabled && "opacity-60 pointer-events-none",
    className
  );

  // Auto-chevron only when the row is interactive AND the consumer has not
  // supplied their own trailing content (trailing === undefined / null).
  const showAutoChevron = isInteractive && trailing == null;

  const body = (
    <>
      {leading != null ? (
        <span className="shrink-0 mt-0.5">{leading}</span>
      ) : null}
      <span className="flex-1 min-w-0 space-y-0.5">
        <span className="block text-sm font-semibold truncate">{primary}</span>
        {secondary != null ? (
          <span className="block text-xs text-muted-foreground truncate">
            {secondary}
          </span>
        ) : null}
        {meta != null ? (
          <span className="block text-caption text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
      {trailing != null ? (
        <span className="shrink-0 flex items-center gap-2">{trailing}</span>
      ) : null}
      {showAutoChevron ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!disabled && href != null) {
    return (
      <Link href={href} className={rootClass}>
        {body}
      </Link>
    );
  }

  if (!disabled && onClick != null) {
    return (
      <button type="button" onClick={onClick} className={cn(rootClass, "text-left w-full")}>
        {body}
      </button>
    );
  }

  return <div className={rootClass}>{body}</div>;
}

export default CardListItem;
