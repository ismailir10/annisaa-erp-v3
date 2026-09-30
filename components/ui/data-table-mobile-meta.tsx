import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Secondary line that only exists below `md`, for the identity cell of a
 * DataTable row (CORE-7 / FIN-21 / ACAD-10, cycle 2026-09-29 admin-hr-mobile).
 *
 * The mobile contract keeps ≤3 data columns visible at 390px, so a page marks
 * its secondary columns `meta: { priority: "low" }` (hidden below `md`) and
 * repeats the few facts a phone user needs — class, status, date — here, under
 * the name. It wraps (`whitespace-normal`) where a plain cell would not, which
 * is what lets the identity column shrink instead of pushing the table past the
 * viewport. Pass it as `description` of `DataTableLinkCell`, or render it under
 * any identity cell.
 */
export function DataTableMobileMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal text-xs text-muted-foreground md:hidden",
        className,
      )}
    >
      {children}
    </span>
  );
}
