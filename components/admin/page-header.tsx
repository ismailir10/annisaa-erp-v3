import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-section flex min-w-0 flex-col gap-field sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-h1 font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
