import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function DetailPageHeader({
  backHref,
  backLabel = "Kembali",
  title,
  description,
  badge,
  actions,
}: {
  backHref: string;
  backLabel?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-section min-w-0">
      <Link
        href={backHref}
        className="mb-field inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 -ml-2 text-body text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {backLabel}
      </Link>
      <div className="flex min-w-0 flex-col gap-field sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-h1 text-balance break-words font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 text-body text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
