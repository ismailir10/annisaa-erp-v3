import { ReactNode } from "react";

/**
 * Canonical admin section heading. Use inside detail-page cards when a
 * section label is needed above the content rows.
 *
 * Renders `text-xs font-semibold text-muted-foreground uppercase
 * tracking-wider` label (the admin convention) plus optional description
 * and right-aligned actions slot.
 */
export function SectionHeading({
  label,
  description,
  actions,
}: {
  label: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
