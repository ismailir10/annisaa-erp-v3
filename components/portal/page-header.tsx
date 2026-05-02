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
 * (filters, CTAs). Standard block margin: `mb-6`.
 *
 * Shared by parent + teacher + admin pages. Keep the API tiny — if a page
 * needs icons or custom markup in the heading, wrap this primitive rather
 * than extending its props.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex items-start justify-between gap-3", className)}>
      <div className="flex-1 min-w-0">
        <h1 className="text-h1 font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export default PageHeader;
