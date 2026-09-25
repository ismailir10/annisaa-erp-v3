import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

/**
 * Page-header primitive for portal routes. Renders a semantic `<header>` with
 * the page title (`h1`), an optional subtitle, and an optional actions slot
 * (filters, CTAs). The title stays ahead of actions when the viewport narrows.
 *
 * Shared by parent + teacher + admin pages. Keep the API tiny — if a page
 * needs icons or custom markup in the heading, wrap this primitive rather
 * than extending its props.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-section flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex-1 min-w-0">
        <h1 className="text-h1 font-bold leading-tight tracking-tight text-foreground text-balance">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-body leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export default PageHeader;
