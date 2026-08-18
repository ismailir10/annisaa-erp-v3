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
        className="mb-field inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {backLabel}
      </Link>
      <div className="flex min-w-0 flex-col gap-field sm:flex-row sm:items-start sm:justify-between">
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
    </div>
  );
}
