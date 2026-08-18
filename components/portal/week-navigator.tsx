import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prev / label / next control for the week-scoped portal pages.
 *
 * Kehadiran and Jurnal had each grown their own: Kehadiran used 44px bare
 * chevron links, Jurnal used 32×32 outline buttons — below the 44px minimum
 * target, and visibly a different control for the same job one tab away.
 * Both now render this.
 *
 * Navigation is by `href` (server-rendered pages, so the week survives a
 * refresh and a back-button press) or by `onPrev`/`onNext` (the client-state
 * Jurnal page). Exactly one pair should be supplied.
 */
export function WeekNavigator({
  label,
  prevHref,
  nextHref,
  onPrev,
  onNext,
  prevLabel = "Pekan sebelumnya",
  nextLabel = "Pekan berikutnya",
  className,
}: {
  label: string;
  prevHref?: string;
  nextHref?: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}) {
  // size-11 = 44px. Bare (no border) so the control reads as chrome rather
  // than as two competing buttons flanking the label.
  const control =
    "grid size-11 shrink-0 place-items-center rounded-md text-foreground transition-colors " +
    "hover:bg-primary/10 active:bg-primary/20 outline-none " +
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      {prevHref ? (
        <Link href={prevHref} className={control} aria-label={prevLabel}>
          <ChevronLeft size={20} />
        </Link>
      ) : (
        <button type="button" onClick={onPrev} className={control} aria-label={prevLabel}>
          <ChevronLeft size={20} />
        </button>
      )}

      <span className="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>

      {nextHref ? (
        <Link href={nextHref} className={control} aria-label={nextLabel}>
          <ChevronRight size={20} />
        </Link>
      ) : (
        <button type="button" onClick={onNext} className={control} aria-label={nextLabel}>
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

export default WeekNavigator;
