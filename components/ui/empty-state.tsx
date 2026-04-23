/**
 * EmptyState — shared empty/placeholder surface for list and detail views.
 *
 * Props:
 *   icon?         Lucide icon component (default: Inbox).
 *   title         Primary label.
 *   description?  Secondary supporting copy.
 *   actionLabel?  Optional CTA label (renders <Button>).
 *   actionHref?   If provided with actionLabel, renders <Link><Button/></Link>.
 *   onAction?     If provided with actionLabel (and no href), renders a click handler <Button/>.
 *   accent?       Visual tone for the icon circle.
 *                   - 'neutral' (default): muted circle + muted icon (byte-equivalent to pre-S2 behavior).
 *                   - 'warm': soft-teal primary-tinted circle + primary icon. Use for inviting/friendly
 *                     parent moments (e.g. "no invoices yet", "waiting for teacher to fill attendance").
 *                   - 'celebration': gold-tinted circle + gold icon + decorative Sparkles badge.
 *                     Use for positive outcome moments (e.g. rapor published, all invoices lunas).
 *
 * Tokens only — no raw hex. Celebration accent consumes `--celebration-gold*` triad
 * added in Task S4 (app/globals.css).
 *
 * Cross-check: .claude/standards/design-system.html §Empty patterns and
 * .claude/standards/voice.md "Empty states" + parent copy examples.
 */
import { LucideIcon, Inbox, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export type EmptyStateAccent = "neutral" | "warm" | "celebration";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  accent = "neutral",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  accent?: EmptyStateAccent;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {accent === "neutral" && (
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon size={24} className="text-muted-foreground" />
        </div>
      )}
      {accent === "warm" && (
        <div
          data-testid="empty-state-icon-warm"
          className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4"
        >
          <Icon className="size-8 text-primary" />
        </div>
      )}
      {accent === "celebration" && (
        <div
          data-testid="empty-state-icon-celebration"
          className="relative size-16 rounded-full bg-celebration-gold-subtle flex items-center justify-center mb-4"
        >
          <Icon className="size-8 text-celebration-gold-text" />
          <Sparkles
            data-testid="empty-state-sparkles"
            aria-hidden="true"
            className="size-3.5 text-celebration-gold absolute -top-1 -right-1"
          />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="mt-4">
          <Button size="sm">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
